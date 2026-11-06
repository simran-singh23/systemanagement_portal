import type { Prisma, UserRole } from "@prisma/client";

export const employeeTeamOrder: Prisma.TeamMemberOrderByWithRelationInput[] = [
  { role: "asc" }, // LEAD comes before MEMBER in the database enum.
  { joinedAt: "asc" },
  { id: "asc" },
];

export function canAssignEmployeeRole(actorRole: UserRole, targetRole: UserRole) {
  if (targetRole === "SUPER_ADMIN") return false;
  if (actorRole === "SUPER_ADMIN") return true;
  return actorRole === "PRODUCT_MANAGER" && (targetRole === "TEAM_LEAD" || targetRole === "EMPLOYEE");
}

export function canManageEmployeeRole(actorRole: UserRole, existingRole: UserRole) {
  return canAssignEmployeeRole(actorRole, existingRole);
}
