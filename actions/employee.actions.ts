"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireOrganizationPermission } from "@/lib/dal/auth";
import { reconcileAccountAccess } from "@/lib/member-access";
import { durationMinutes } from "@/lib/date-time";
import { sendPasswordSetupOrReset } from "@/lib/password-account";
import { lockTransaction } from "@/lib/transaction-lock";
import {
  employeeSchema,
  employeeUpdateSchema,
  type FormState,
} from "@/lib/validations";

const field = (formData: FormData, name: string) => String(formData.get(name) ?? "");

async function closeDeactivatedMemberSessions(tx: Prisma.TransactionClient, organizationId: string, userId: string) {
  await lockTransaction(tx, userId);
  const now = new Date();
  const sessions = await tx.workSession.findMany({ where: { organizationId, userId, endedAt: null }, select: { id: true, attendanceId: true, startedAt: true } });
  const activeBreaks = await tx.break.findMany({ where: { organizationId, userId, endedAt: null }, select: { id: true, startedAt: true } });
  for (const item of activeBreaks) await tx.break.update({ where: { id: item.id }, data: { endedAt: now, durationMins: durationMinutes(item.startedAt, now) } });
  for (const item of sessions) await tx.workSession.update({ where: { id: item.id }, data: { endedAt: now, durationMins: durationMinutes(item.startedAt, now) } });
  const attendanceIds = [...new Set(sessions.map((item) => item.attendanceId))];
  if (attendanceIds.length) await tx.attendance.updateMany({ where: { id: { in: attendanceIds }, organizationId, userId, checkOutAt: null }, data: { checkOutAt: now } });
  return { sessionsClosed: sessions.length, breaksClosed: activeBreaks.length };
}

function mayAssignRole(actorRole: UserRole, targetRole: UserRole) {
  if (actorRole === "SUPER_ADMIN") return true;
  if (actorRole === "PRODUCT_MANAGER") return targetRole === "TEAM_LEAD" || targetRole === "EMPLOYEE";
  return false;
}

function mayManageTarget(actorRole: UserRole, targetRole: UserRole) {
  if (actorRole === "SUPER_ADMIN") return true;
  if (actorRole === "PRODUCT_MANAGER") return targetRole === "TEAM_LEAD" || targetRole === "EMPLOYEE";
  return false;
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
  if (!mayAssignRole(actorRole, parsed.data.role)) {
    return { message: "You cannot assign this role." };
  }

  const existing = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, status: true, organizationMembers: { where: { organizationId: parsed.data.organizationId }, select: { role: true, status: true } } },
  });

  if (existing?.organizationMembers[0]?.status === "SUSPENDED") {
    return { message: "This person already belongs to the organization and is deactivated. Reactivate them from their employee profile." };
  }

  if (existing?.organizationMembers[0] && !mayManageTarget(actorRole, existing.organizationMembers[0].role)) {
    return { message: "You cannot add or modify this account." };
  }

  const employee = await prisma.$transaction(async (tx) => {
    const employee = await tx.user.upsert({
      where: { email: parsed.data.email },
      update: {
        name: parsed.data.name,
        jobTitle: parsed.data.jobTitle,
      },
      create: {
        name: parsed.data.name,
        email: parsed.data.email,
        jobTitle: parsed.data.jobTitle,
        role: parsed.data.role,
        status: "INVITED",
      },
    });

    await tx.organizationMember.upsert({
      where: {
        organizationId_userId: {
          organizationId: parsed.data.organizationId,
          userId: employee.id,
        },
      },
      update: {
        role: parsed.data.role,
        department: parsed.data.department,
      },
      create: {
        organizationId: parsed.data.organizationId,
        userId: employee.id,
        role: parsed.data.role,
        status: employee.status === "ACTIVE" ? "ACTIVE" : "INVITED",
        department: parsed.data.department,
        joinedAt: employee.status === "ACTIVE" ? new Date() : null,
      },
    });

    await reconcileAccountAccess(tx, employee.id);

    if (parsed.data.teamId) {
      const team = await tx.team.findFirst({
        where: { id: parsed.data.teamId, organizationId: parsed.data.organizationId },
        select: { id: true },
      });
      if (!team) throw new Error("Selected team is not part of this organization.");
      await tx.teamMember.upsert({
        where: { teamId_userId: { teamId: team.id, userId: employee.id } },
        update: { role: parsed.data.role === "TEAM_LEAD" ? "LEAD" : "MEMBER" },
        create: { teamId: team.id, userId: employee.id, role: parsed.data.role === "TEAM_LEAD" ? "LEAD" : "MEMBER" },
      });
    }

    await tx.activityLog.create({
      data: {
        organizationId: parsed.data.organizationId,
        actorId: actor.id,
        action: "employee.invited",
        entityType: "user",
        entityId: employee.id,
        metadata: { role: parsed.data.role, department: parsed.data.department },
      },
    });

    return { id: employee.id, email: employee.email, needsPasswordSetup: !employee.passwordHash };
  });

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
  const target = await prisma.user.findFirst({
    where: {
      id: employeeId,
      organizationMembers: { some: { organizationId: parsed.data.organizationId } },
    },
    select: { id: true, organizationMembers: { where: { organizationId: parsed.data.organizationId }, select: { role: true } } },
  });

  if (!target) return { message: "Employee was not found." };
  if (target.id === actor.id && parsed.data.status === "SUSPENDED") {
    return { message: "You cannot deactivate your own account." };
  }
  const actorRole = actorMembership?.role ?? actor.role;
  if (!target.organizationMembers[0] || !mayManageTarget(actorRole, target.organizationMembers[0].role) || !mayAssignRole(actorRole, parsed.data.role)) {
    return { message: "You cannot change this employee or assign this role." };
  }

  const membershipStatus = parsed.data.status === "SUSPENDED" ? "SUSPENDED" : parsed.data.status === "INVITED" ? "INVITED" : "ACTIVE";

  await prisma.$transaction(async (tx) => {
    const closed = membershipStatus === "SUSPENDED" ? await closeDeactivatedMemberSessions(tx, parsed.data.organizationId, employeeId) : null;
    await tx.user.update({
      where: { id: employeeId },
      data: { name: parsed.data.name, jobTitle: parsed.data.jobTitle },
    });
    await tx.organizationMember.update({
      where: { organizationId_userId: { organizationId: parsed.data.organizationId, userId: employeeId } },
      data: { role: parsed.data.role, status: membershipStatus, department: parsed.data.department },
    });
    await reconcileAccountAccess(tx, employeeId);

    await tx.teamMember.deleteMany({
      where: { userId: employeeId, team: { organizationId: parsed.data.organizationId } },
    });
    if (parsed.data.teamId) {
      const team = await tx.team.findFirst({
        where: { id: parsed.data.teamId, organizationId: parsed.data.organizationId },
        select: { id: true },
      });
      if (!team) throw new Error("Selected team is not part of this organization.");
      await tx.teamMember.create({
        data: { teamId: team.id, userId: employeeId, role: parsed.data.role === "TEAM_LEAD" ? "LEAD" : "MEMBER" },
      });
    }

    await tx.activityLog.create({
      data: {
        organizationId: parsed.data.organizationId,
        actorId: actor.id,
        action: "employee.updated",
        entityType: "user",
        entityId: employeeId,
        metadata: { role: parsed.data.role, status: parsed.data.status, department: parsed.data.department, ...closed },
      },
    });
  });

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
  if (!target?.organizationMembers[0] || !mayManageTarget(actorMembership?.role ?? actor.role, target.organizationMembers[0].role)) throw new Error("Unauthorized employee update.");

  await prisma.$transaction(async (tx) => {
    const closed = await closeDeactivatedMemberSessions(tx, organizationId, employeeId);
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
