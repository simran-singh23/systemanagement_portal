"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireOrganizationPermission } from "@/lib/dal/auth";
import { reconcileAccountAccess } from "@/lib/member-access";
import { teamSchema, type FormState } from "@/lib/validations";

const field = (formData: FormData, name: string) => String(formData.get(name) ?? "");

class TeamInputError extends Error {
  constructor(message: string, readonly fieldName?: string) {
    super(message);
  }
}

function parseTeam(formData: FormData) {
  const memberIds = formData.getAll("memberIds").map(String);
  const parsed = teamSchema.safeParse({
    organizationId: field(formData, "organizationId"),
    name: field(formData, "name"),
    description: field(formData, "description"),
    color: field(formData, "color") || "#2563EB",
    managerId: field(formData, "managerId"),
    memberIds,
  });
  if (!parsed.success) return { success: false as const, errors: { errors: parsed.error.flatten().fieldErrors } };
  if (new Set(memberIds).size !== memberIds.length) {
    return { success: false as const, errors: { errors: { memberIds: ["Remove duplicate team member selections."] } } };
  }
  return parsed;
}

async function validateActiveParticipants(
  tx: Prisma.TransactionClient,
  organizationId: string,
  memberIds: string[],
  managerId?: string,
) {
  const requestedIds = [...new Set([...memberIds, ...(managerId ? [managerId] : [])])];
  const participants = requestedIds.length ? await tx.organizationMember.findMany({
    where: {
      organizationId,
      userId: { in: requestedIds },
      status: "ACTIVE",
      user: { status: "ACTIVE" },
    },
    select: { userId: true, role: true },
  }) : [];
  const validIds = new Set(participants.map((participant) => participant.userId));

  if (managerId && !validIds.has(managerId)) {
    throw new TeamInputError("Choose an active team lead from this organization.", "managerId");
  }
  const invalidMembers = memberIds.filter((userId) => !validIds.has(userId));
  if (invalidMembers.length) {
    throw new TeamInputError("One or more selected members are inactive or do not belong to this organization. Refresh the page and choose active members.", "memberIds");
  }
}

async function persistTeamMembers(
  tx: Prisma.TransactionClient,
  teamId: string,
  memberIds: string[],
  managerId?: string,
) {
  const desiredIds = new Set(memberIds);
  if (managerId) desiredIds.add(managerId);
  const desired = [...desiredIds];

  if (desired.length) {
    await tx.teamMember.deleteMany({ where: { teamId, userId: { notIn: desired } } });
  } else {
    await tx.teamMember.deleteMany({ where: { teamId } });
  }

  for (const userId of desired) {
    await tx.teamMember.upsert({
      where: { teamId_userId: { teamId, userId } },
      update: { role: userId === managerId ? "LEAD" : "MEMBER" },
      create: { teamId, userId, role: userId === managerId ? "LEAD" : "MEMBER" },
    });
  }
}

async function synchronizeTeamLeadRoles(
  tx: Prisma.TransactionClient,
  organizationId: string,
  previousManagerId: string | null,
  managerId?: string,
) {
  const changedUsers = new Set([previousManagerId, managerId].filter((id): id is string => Boolean(id)));
  if (!changedUsers.size) return;
  const memberships = await tx.organizationMember.findMany({
    where: { organizationId, userId: { in: [...changedUsers] }, status: "ACTIVE" },
    select: { userId: true, role: true },
  });
  for (const userId of changedUsers) {
    const membership = memberships.find((candidate) => candidate.userId === userId);
    if (userId === managerId) {
      if (membership?.role === "EMPLOYEE") {
        await tx.organizationMember.update({ where: { organizationId_userId: { organizationId, userId } }, data: { role: "TEAM_LEAD" } });
        await reconcileAccountAccess(tx, userId);
      }
      continue;
    }

    if (membership?.role === "TEAM_LEAD") {
      const remainingLedTeams = await tx.team.count({ where: { organizationId, managerId: userId } });
      if (!remainingLedTeams) {
        await tx.organizationMember.update({ where: { organizationId_userId: { organizationId, userId } }, data: { role: "EMPLOYEE" } });
        await reconcileAccountAccess(tx, userId);
      }
    }
  }
}

function isUniqueConstraintError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

function actionError(error: unknown): FormState {
  if (error instanceof TeamInputError) {
    return error.fieldName ? { errors: { [error.fieldName]: [error.message] } } : { message: error.message };
  }
  if (isUniqueConstraintError(error)) return { errors: { name: ["A team with this name already exists in this organization."] } };
  return { message: "Team settings could not be saved. Refresh the page and try again." };
}

export async function createTeam(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = parseTeam(formData);
  if (!parsed.success) return parsed.errors;

  const { user: actor, membership: actorMembership } = await requireOrganizationPermission(parsed.data.organizationId, "teams:manage");
  if ((actorMembership?.role ?? actor.role) === "TEAM_LEAD") return { message: "Only administrators and product managers can create teams." };

  let team: { id: string };
  try {
    team = await prisma.$transaction(async (tx) => {
      await validateActiveParticipants(tx, parsed.data.organizationId, parsed.data.memberIds, parsed.data.managerId);
      const created = await tx.team.create({
        data: {
          organizationId: parsed.data.organizationId,
          name: parsed.data.name,
          description: parsed.data.description,
          color: parsed.data.color,
          managerId: parsed.data.managerId ?? null,
        },
        select: { id: true, name: true },
      });

      await persistTeamMembers(tx, created.id, parsed.data.memberIds, parsed.data.managerId);
      await synchronizeTeamLeadRoles(tx, parsed.data.organizationId, null, parsed.data.managerId);
      await tx.activityLog.create({
        data: { organizationId: parsed.data.organizationId, actorId: actor.id, action: "team.created", entityType: "team", entityId: created.id, metadata: { name: created.name, managerId: parsed.data.managerId ?? null, memberIds: [...new Set(parsed.data.memberIds)] } },
      });
      return created;
    });
  } catch (error) {
    return actionError(error);
  }

  revalidatePath("/dashboard/teams");
  redirect(`/dashboard/teams/${team.id}`);
}

export async function updateTeam(
  teamId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = parseTeam(formData);
  if (!parsed.success) return parsed.errors;

  const { user: actor, membership: actorMembership } = await requireOrganizationPermission(parsed.data.organizationId, "teams:manage");
  const actorRole = actorMembership?.role ?? actor.role;

  try {
    await prisma.$transaction(async (tx) => {
      const currentTeam = await tx.team.findFirst({
        where: { id: teamId, organizationId: parsed.data.organizationId },
        include: { members: { select: { userId: true } } },
      });
      if (!currentTeam) throw new TeamInputError("Team was not found.");
      if (actorRole === "TEAM_LEAD" && currentTeam.managerId !== actor.id) {
        throw new TeamInputError("Team leads can only update their own team.");
      }
      if (actorRole === "TEAM_LEAD" && parsed.data.managerId !== currentTeam.managerId) {
        throw new TeamInputError("Only administrators and product managers can change team leadership.", "managerId");
      }

      await validateActiveParticipants(tx, parsed.data.organizationId, parsed.data.memberIds, parsed.data.managerId);
      const previousManagerId = currentTeam.managerId;
      const allowedWhere = {
        id: teamId,
        organizationId: parsed.data.organizationId,
        ...(actorRole === "TEAM_LEAD" ? { managerId: actor.id } : {}),
      };
      const updated = await tx.team.updateMany({
        where: allowedWhere,
        data: { name: parsed.data.name, description: parsed.data.description, color: parsed.data.color, managerId: parsed.data.managerId ?? null },
      });
      if (updated.count !== 1) throw new TeamInputError("Team permissions or leadership changed. Refresh the page and try again.");

      await persistTeamMembers(tx, teamId, parsed.data.memberIds, parsed.data.managerId);
      await synchronizeTeamLeadRoles(tx, parsed.data.organizationId, previousManagerId, parsed.data.managerId);

      const beforeIds = currentTeam.members.map((member) => member.userId);
      const afterIds = [...new Set([...parsed.data.memberIds, ...(parsed.data.managerId ? [parsed.data.managerId] : [])])];
      const before = new Set(beforeIds);
      const after = new Set(afterIds);
      await tx.activityLog.create({
        data: {
          organizationId: parsed.data.organizationId,
          actorId: actor.id,
          action: "team.updated",
          entityType: "team",
          entityId: teamId,
          metadata: {
            name: parsed.data.name,
            previousManagerId,
            managerId: parsed.data.managerId ?? null,
            addedMemberIds: afterIds.filter((id) => !before.has(id)),
            removedMemberIds: beforeIds.filter((id) => !after.has(id)),
          },
        },
      });
    });
    revalidatePath("/dashboard/tasks");
    revalidatePath("/dashboard/employees");
    revalidatePath(`/dashboard/teams/${teamId}`);
    return { success: true, message: "Team settings saved. Existing task assignments and work sessions were preserved." };
  } catch (error) {
    return actionError(error);
  }
}
