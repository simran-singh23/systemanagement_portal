import type { Prisma, UserRole } from "@prisma/client";

const managerRoles: UserRole[] = ["SUPER_ADMIN", "PRODUCT_MANAGER", "TEAM_LEAD"];

export function searchAccessScopes(role: UserRole, actorId: string, organizationId: string) {
  const manager = managerRoles.includes(role);
  const taskScope: Prisma.TaskWhereInput = role === "TEAM_LEAD" ? { team: { managerId: actorId } } : manager ? {} : { assignedToId: actorId };
  const userScope: Prisma.UserWhereInput = role === "TEAM_LEAD" ? { teamMembers: { some: { team: { organizationId, managerId: actorId } } } } : manager ? {} : { id: actorId };
  return { manager, taskScope, userScope };
}
