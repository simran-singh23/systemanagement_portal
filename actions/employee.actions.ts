"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireOrganizationPermission } from "@/lib/dal/auth";
import { reconcileAccountAccess } from "@/lib/member-access";
import { durationMinutes } from "@/lib/date-time";
import { sendPasswordSetupOrReset } from "@/lib/password-account";
import { lockTransaction } from "@/lib/transaction-lock";
import { canAssignEmployeeRole, canManageEmployeeRole, employeeTeamOrder } from "@/lib/employee-policy";
import {
  employeeSchema,
  employeeUpdateSchema,
  type FormState,
} from "@/lib/validations";

const field = (formData: FormData, name: string) => String(formData.get(name) ?? "");

class EmployeeInputError extends Error {
  constructor(message: string, readonly fieldName?: string) {
    super(message);
  }
}

function employeeActionError(error: unknown): FormState {
  if (error instanceof EmployeeInputError) {
    return error.fieldName ? { errors: { [error.fieldName]: [error.message] } } : { message: error.message };
  }
  if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
    return { errors: { email: ["An account with this email already exists. Check the address or contact an administrator."] } };
  }
  return { message: "Employee details could not be saved. Refresh the page and try again." };
}

async function closeDeactivatedMemberSessions(tx: Prisma.TransactionClient, organizationId: string, userId: string) {
  const now = new Date();
  const sessions = await tx.workSession.findMany({ where: { organizationId, userId, endedAt: null }, select: { id: true, attendanceId: true, startedAt: true } });
  const activeBreaks = await tx.break.findMany({ where: { organizationId, userId, endedAt: null }, select: { id: true, startedAt: true } });
  for (const item of activeBreaks) await tx.break.update({ where: { id: item.id }, data: { endedAt: now, durationMins: durationMinutes(item.startedAt, now) } });
  for (const item of sessions) await tx.workSession.update({ where: { id: item.id }, data: { endedAt: now, durationMins: durationMinutes(item.startedAt, now) } });
  const attendanceIds = [...new Set(sessions.map((item) => item.attendanceId))];
  if (attendanceIds.length) await tx.attendance.updateMany({ where: { id: { in: attendanceIds }, organizationId, userId, checkOutAt: null }, data: { checkOutAt: now } });
  return { sessionsClosed: sessions.length, breaksClosed: activeBreaks.length };
}

export async function createEmployee(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = employeeSchema.safeParse({
    organizationId: field(formData, "organizationId"),
    name: field(formData, "name"),
    email: field(formData, "email"),
    jobTitle: field(formData, "jobTitle"),
    department: field(formData, "department"),
    role: field(formData, "role"),
    teamId: field(formData, "teamId"),
  });

  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  const { user: actor, membership: actorMembership } = await requireOrganizationPermission(
    parsed.data.organizationId,
    "members:manage",
  );

  const actorRole = actorMembership?.role ?? actor.role;
  if (!canAssignEmployeeRole(actorRole, parsed.data.role)) {
    return { message: "You cannot assign this role." };
  }
  if (parsed.data.role === "TEAM_LEAD" && !parsed.data.teamId) {
    return { errors: { teamId: ["Assign a team when granting the team lead role."] } };
  }

  let employee: { id: string; email: string; needsPasswordSetup: boolean };
  try {
    employee = await prisma.$transaction(async (tx) => {
      const matches = await tx.user.findMany({
        where: { email: { equals: parsed.data.email, mode: "insensitive" } },
        take: 2,
        include: { organizationMembers: { select: { organizationId: true, status: true } } },
      });
      if (matches.length > 1) throw new EmployeeInputError("More than one account matches this email. Ask an administrator to resolve the duplicate before inviting.", "email");

      const existing = matches[0];
      if (existing?.organizationMembers.some((membership) => membership.organizationId === parsed.data.organizationId)) {
        const membership = existing.organizationMembers.find((item) => item.organizationId === parsed.data.organizationId)!;
        throw new EmployeeInputError(
          membership.status === "SUSPENDED"
            ? "This person already belongs to the organization and is deactivated. Reactivate them from their employee profile."
            : "This person already has an employee profile. Open that profile to edit their access.",
          "email",
        );
      }
      if (existing?.status === "INVITED" && !existing.passwordHash && existing.organizationMembers.some((membership) => membership.status === "INVITED")) {
        throw new EmployeeInputError("This account already has a pending invitation. Complete it before sending another organization invitation.", "email");
      }

      const team = parsed.data.teamId
        ? await tx.team.findFirst({ where: { id: parsed.data.teamId, organizationId: parsed.data.organizationId }, select: { id: true, managerId: true } })
        : null;
      if (parsed.data.teamId && !team) throw new EmployeeInputError("Choose a team from this organization.", "teamId");
      if (parsed.data.role === "TEAM_LEAD" && team?.managerId) {
        throw new EmployeeInputError("This team already has a lead. Change its lead from Team Management first.", "teamId");
      }

      const employee = existing
        ? await tx.user.update({
            where: { id: existing.id },
            // These are account-global User fields in the current schema; keep
            // the existing write behavior until the product defines per-org profiles.
            data: { email: parsed.data.email, name: parsed.data.name, jobTitle: parsed.data.jobTitle },
          })
        : await tx.user.create({ data: { name: parsed.data.name, email: parsed.data.email, jobTitle: parsed.data.jobTitle, role: parsed.data.role, status: "INVITED" } });

      await tx.organizationMember.create({
        data: {
          organizationId: parsed.data.organizationId,
          userId: employee.id,
          role: parsed.data.role,
          status: employee.status === "ACTIVE" ? "ACTIVE" : "INVITED",
          department: parsed.data.department,
          joinedAt: employee.status === "ACTIVE" ? new Date() : null,
        },
      });

      await reconcileAccountAccess(tx, employee.id);

      if (team) {
        await tx.teamMember.create({ data: { teamId: team.id, userId: employee.id, role: parsed.data.role === "TEAM_LEAD" ? "LEAD" : "MEMBER" } });
        if (parsed.data.role === "TEAM_LEAD") await tx.team.update({ where: { id: team.id }, data: { managerId: employee.id } });
      }

      await tx.activityLog.create({
        data: { organizationId: parsed.data.organizationId, actorId: actor.id, action: "employee.invited", entityType: "user", entityId: employee.id, metadata: { role: parsed.data.role, department: parsed.data.department } },
      });

      return { id: employee.id, email: employee.email, needsPasswordSetup: !employee.passwordHash };
    });
  } catch (error) {
    return employeeActionError(error);
  }

  if (employee.needsPasswordSetup) {
    try {
      const result = await sendPasswordSetupOrReset(employee.email);
      if (result !== "sent" && result !== "logged" && result !== "not_eligible") console.warn(`Employee password setup email not sent (${result}). Configure the auth mailer and local test recipient allowlist if applicable.`);
    }
    catch (error) { console.error("Employee password setup email could not be sent.", error instanceof Error ? error.message : "unknown error"); }
  }

  revalidatePath("/dashboard/employees");
  redirect(`/dashboard/employees/${employee.id}`);
}

export async function updateEmployee(
  employeeId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = employeeUpdateSchema.safeParse({
    organizationId: field(formData, "organizationId"),
    name: field(formData, "name"),
    jobTitle: field(formData, "jobTitle"),
    department: field(formData, "department"),
    role: field(formData, "role"),
    teamId: field(formData, "teamId"),
    status: field(formData, "status"),
  });

  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  const { user: actor, membership: actorMembership } = await requireOrganizationPermission(
    parsed.data.organizationId,
    "members:manage",
  );
  if (employeeId === actor.id && parsed.data.status === "SUSPENDED") {
    return { message: "You cannot deactivate your own account." };
  }
  const actorRole = actorMembership?.role ?? actor.role;
  if (!canAssignEmployeeRole(actorRole, parsed.data.role)) {
    return { message: "You cannot change this employee or assign this role." };
  }

  const membershipStatus = parsed.data.status;

  try {
    await prisma.$transaction(async (tx) => {
      await lockTransaction(tx, employeeId);
      const membershipKey = { organizationId: parsed.data.organizationId, userId: employeeId };
      const currentMembership = await tx.organizationMember.findUnique({
        where: { organizationId_userId: membershipKey },
        select: { role: true, status: true },
      });
      if (!currentMembership) throw new EmployeeInputError("Employee was not found.");
      if (!canManageEmployeeRole(actorRole, currentMembership.role)) {
        throw new EmployeeInputError("You cannot change this employee or assign this role.");
      }

      // Suspending an existing lead keeps their roster, as does Deactivate account.
      const suspendingLead = membershipStatus === "SUSPENDED" && currentMembership.role === "TEAM_LEAD" && parsed.data.role === "TEAM_LEAD";
      if (parsed.data.role === "TEAM_LEAD" && !suspendingLead && (membershipStatus !== "ACTIVE" || !parsed.data.teamId)) {
        throw new EmployeeInputError("An active team lead must be assigned to a team.", "teamId");
      }
      const team = parsed.data.teamId
        ? await tx.team.findFirst({ where: { id: parsed.data.teamId, organizationId: parsed.data.organizationId }, select: { id: true, managerId: true } })
        : null;
      if (parsed.data.teamId && !team) throw new EmployeeInputError("Choose a team from this organization.", "teamId");
      if (parsed.data.role === "TEAM_LEAD" && !suspendingLead && team?.managerId && team.managerId !== employeeId) {
        throw new EmployeeInputError("This team already has a lead. Change its lead from Team Management first.", "teamId");
      }

      const currentTeam = await tx.teamMember.findFirst({
        where: { userId: employeeId, team: { organizationId: parsed.data.organizationId } },
        orderBy: employeeTeamOrder,
        select: { teamId: true },
      });
      const placementChanged = currentMembership.role !== parsed.data.role
        || currentTeam?.teamId !== team?.id
        || (parsed.data.role === "TEAM_LEAD" && team?.managerId !== employeeId);

      const closed = membershipStatus !== "ACTIVE" ? await closeDeactivatedMemberSessions(tx, parsed.data.organizationId, employeeId) : null;
      await tx.user.update({
        where: { id: employeeId },
        data: {
          name: parsed.data.name,
          jobTitle: parsed.data.jobTitle ?? null,
          ...(currentMembership.status !== membershipStatus ? { authVersion: { increment: 1 } } : {}),
        },
      });
      await tx.organizationMember.update({
        where: { organizationId_userId: membershipKey },
        data: { role: parsed.data.role, status: membershipStatus, department: parsed.data.department ?? null },
      });
      await reconcileAccountAccess(tx, employeeId);

      if (!suspendingLead && placementChanged) {
        await tx.teamMember.deleteMany({ where: { userId: employeeId, team: { organizationId: parsed.data.organizationId } } });
        await tx.team.updateMany({
          where: { organizationId: parsed.data.organizationId, managerId: employeeId, ...(parsed.data.role === "TEAM_LEAD" && team ? { id: { not: team.id } } : {}) },
          data: { managerId: null },
        });
        if (team) {
          await tx.teamMember.create({ data: { teamId: team.id, userId: employeeId, role: parsed.data.role === "TEAM_LEAD" ? "LEAD" : "MEMBER" } });
          if (parsed.data.role === "TEAM_LEAD") await tx.team.update({ where: { id: team.id }, data: { managerId: employeeId } });
        }
      }

      await tx.activityLog.create({
        data: { organizationId: parsed.data.organizationId, actorId: actor.id, action: "employee.updated", entityType: "user", entityId: employeeId, metadata: { role: parsed.data.role, status: parsed.data.status, department: parsed.data.department, ...closed } },
      });
    });
  } catch (error) {
    return employeeActionError(error);
  }

  revalidatePath("/dashboard/employees");
  revalidatePath(`/dashboard/employees/${employeeId}`);
  return { success: true, message: "Employee details saved." };
}

export async function deactivateEmployee(
  organizationId: string,
  employeeId: string,
) {
  const { user: actor, membership: actorMembership } = await requireOrganizationPermission(organizationId, "members:manage");
  if (actor.id === employeeId) throw new Error("You cannot deactivate your own account.");

  const target = await prisma.user.findFirst({
    where: { id: employeeId, organizationMembers: { some: { organizationId } } },
    select: { organizationMembers: { where: { organizationId }, select: { role: true } } },
  });
  if (!target?.organizationMembers[0] || !canManageEmployeeRole(actorMembership?.role ?? actor.role, target.organizationMembers[0].role)) throw new Error("Unauthorized employee update.");

  await prisma.$transaction(async (tx) => {
    await lockTransaction(tx, employeeId);
    const closed = await closeDeactivatedMemberSessions(tx, organizationId, employeeId);
    await tx.user.update({ where: { id: employeeId }, data: { authVersion: { increment: 1 } } });
    await tx.organizationMember.update({
      where: { organizationId_userId: { organizationId, userId: employeeId } },
      data: { status: "SUSPENDED" },
    });
    await reconcileAccountAccess(tx, employeeId);
    await tx.activityLog.create({
      data: { organizationId, actorId: actor.id, action: "employee.deactivated", entityType: "user", entityId: employeeId, metadata: closed },
    });
  });

  revalidatePath("/dashboard/employees");
  revalidatePath(`/dashboard/employees/${employeeId}`);
}
