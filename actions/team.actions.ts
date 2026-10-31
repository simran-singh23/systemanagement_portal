"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOrganizationPermission } from "@/lib/dal/auth";
import { reconcileAccountAccess } from "@/lib/member-access";
import { teamSchema, type FormState } from "@/lib/validations";

const field = (formData: FormData, name: string) => String(formData.get(name) ?? "");

function parseTeam(formData: FormData) {
  return teamSchema.safeParse({
    organizationId: field(formData, "organizationId"),
    name: field(formData, "name"),
    description: field(formData, "description"),
    color: field(formData, "color") || "#2563EB",
    managerId: field(formData, "managerId"),
    memberIds: formData.getAll("memberIds").map(String),
  });
}

export async function createTeam(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = parseTeam(formData);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  const { user: actor, membership: actorMembership } = await requireOrganizationPermission(parsed.data.organizationId, "teams:manage");
  if ((actorMembership?.role ?? actor.role) === "TEAM_LEAD") return { message: "Only administrators and product managers can create teams." };

  const team = await prisma.$transaction(async (tx) => {
    const validMembers = await tx.organizationMember.findMany({
      where: {
        organizationId: parsed.data.organizationId,
        userId: { in: [...parsed.data.memberIds, ...(parsed.data.managerId ? [parsed.data.managerId] : [])] },
        status: "ACTIVE",
      },
      select: { userId: true, role: true },
    });
    const validIds = new Set(validMembers.map((member) => member.userId));
    if (parsed.data.managerId && !validIds.has(parsed.data.managerId)) throw new Error("Selected team lead is not an active member.");

    const created = await tx.team.create({
      data: {
        organizationId: parsed.data.organizationId,
        name: parsed.data.name,
        description: parsed.data.description,
        color: parsed.data.color,
        managerId: parsed.data.managerId,
      },
    });

    const memberIds = [...new Set(parsed.data.memberIds.filter((id) => validIds.has(id)))];
    if (parsed.data.managerId && !memberIds.includes(parsed.data.managerId)) memberIds.push(parsed.data.managerId);
    if (memberIds.length) {
      await tx.teamMember.createMany({
        data: memberIds.map((userId) => ({
          teamId: created.id,
          userId,
          role: userId === parsed.data.managerId ? "LEAD" : "MEMBER",
        })),
      });
    }

    if (parsed.data.managerId) {
      const lead = validMembers.find((member) => member.userId === parsed.data.managerId);
      if (lead?.role === "EMPLOYEE") {
        await tx.organizationMember.update({ where: { organizationId_userId: { organizationId: parsed.data.organizationId, userId: parsed.data.managerId } }, data: { role: "TEAM_LEAD" } });
        await reconcileAccountAccess(tx, parsed.data.managerId);
      }
    }

    await tx.activityLog.create({
      data: { organizationId: parsed.data.organizationId, actorId: actor.id, action: "team.created", entityType: "team", entityId: created.id, metadata: { name: created.name } },
    });
    return created;
  });

  revalidatePath("/dashboard/teams");
  redirect(`/dashboard/teams/${team.id}`);
}

export async function updateTeam(
  teamId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = parseTeam(formData);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  const { user: actor, membership: actorMembership } = await requireOrganizationPermission(parsed.data.organizationId, "teams:manage");
  const actorRole = actorMembership?.role ?? actor.role;
  const currentTeam = await prisma.team.findFirst({
    where: { id: teamId, organizationId: parsed.data.organizationId },
    select: { managerId: true },
  });
  if (!currentTeam) return { message: "Team was not found." };
  if (actorRole === "TEAM_LEAD" && currentTeam.managerId !== actor.id) {
    return { message: "Team leads can only update their own team." };
  }
  if (actorRole === "TEAM_LEAD" && parsed.data.managerId !== currentTeam.managerId) {
    return { message: "Only administrators and product managers can change team leadership." };
  }

  await prisma.$transaction(async (tx) => {
    const validMembers = await tx.organizationMember.findMany({
      where: {
        organizationId: parsed.data.organizationId,
        userId: { in: [...parsed.data.memberIds, ...(parsed.data.managerId ? [parsed.data.managerId] : [])] },
        status: "ACTIVE",
      },
      select: { userId: true, role: true },
    });
    const validIds = new Set(validMembers.map((member) => member.userId));
    if (parsed.data.managerId && !validIds.has(parsed.data.managerId)) throw new Error("Selected team lead is not active.");

    await tx.team.update({
      where: { id: teamId },
      data: { name: parsed.data.name, description: parsed.data.description, color: parsed.data.color, managerId: parsed.data.managerId },
    });
    await tx.teamMember.deleteMany({ where: { teamId } });
    const memberIds = [...new Set(parsed.data.memberIds.filter((id) => validIds.has(id)))];
    if (parsed.data.managerId && !memberIds.includes(parsed.data.managerId)) memberIds.push(parsed.data.managerId);
    if (memberIds.length) {
      await tx.teamMember.createMany({
        data: memberIds.map((userId) => ({ teamId, userId, role: userId === parsed.data.managerId ? "LEAD" : "MEMBER" })),
      });
    }

    if (parsed.data.managerId) {
      const lead = validMembers.find((member) => member.userId === parsed.data.managerId);
      if (lead?.role === "EMPLOYEE") {
        await tx.organizationMember.update({ where: { organizationId_userId: { organizationId: parsed.data.organizationId, userId: parsed.data.managerId } }, data: { role: "TEAM_LEAD" } });
        await reconcileAccountAccess(tx, parsed.data.managerId);
      }
    }

    await tx.activityLog.create({
      data: { organizationId: parsed.data.organizationId, actorId: actor.id, action: "team.updated", entityType: "team", entityId: teamId, metadata: { name: parsed.data.name } },
    });
  });

  revalidatePath("/dashboard/teams");
  revalidatePath(`/dashboard/teams/${teamId}`);
  return { success: true, message: "Team settings saved." };
}
