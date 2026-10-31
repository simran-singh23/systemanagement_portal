import type { Prisma, UserRole, UserStatus } from "@prisma/client";
import { hasOrganizationPermission, type Permission } from "@/lib/permissions";

type MembershipAccess = { role: UserRole; status: "ACTIVE" | "INVITED" | "SUSPENDED" };

const roleRank: Record<UserRole, number> = { EMPLOYEE: 0, TEAM_LEAD: 1, PRODUCT_MANAGER: 2, SUPER_ADMIN: 3 };

export function accountAccessForMemberships(memberships: readonly MembershipAccess[], ownsOrganization: boolean, currentStatus: UserStatus) {
  if (ownsOrganization) return { role: "SUPER_ADMIN" as UserRole, status: "ACTIVE" as UserStatus };
  const active = memberships.filter((membership) => membership.status === "ACTIVE");
  const role = active.reduce<UserRole>((highest, membership) => roleRank[membership.role] > roleRank[highest] ? membership.role : highest, "EMPLOYEE");
  const status: UserStatus = active.length ? "ACTIVE" : memberships.some((membership) => membership.status === "INVITED") ? "INVITED" : memberships.length ? "SUSPENDED" : currentStatus;
  return { role, status };
}

export function hasApprovedOrganizationAccess(
  memberships: readonly Pick<MembershipAccess, "status">[],
  ownsOrganization: boolean,
) {
  return ownsOrganization || memberships.some((membership) => membership.status === "ACTIVE");
}

export async function reconcileAccountAccess(tx: Prisma.TransactionClient, userId: string) {
  const [user, memberships, ownedCount] = await Promise.all([
    tx.user.findUniqueOrThrow({ where: { id: userId }, select: { status: true } }),
    tx.organizationMember.findMany({ where: { userId }, select: { role: true, status: true } }),
    tx.organization.count({ where: { ownerId: userId } }),
  ]);
  const access = accountAccessForMemberships(memberships, ownedCount > 0, user.status);
  await tx.user.update({ where: { id: userId }, data: access });
  return access;
}

export async function assertActiveOrganizationAccess(tx: Prisma.TransactionClient, organizationId: string, userId: string, permission: Permission) {
  const [membership, organization, user] = await Promise.all([
    tx.organizationMember.findUnique({ where: { organizationId_userId: { organizationId, userId } }, select: { role: true, status: true } }),
    tx.organization.findUnique({ where: { id: organizationId }, select: { ownerId: true } }),
    tx.user.findUnique({ where: { id: userId }, select: { role: true, status: true } }),
  ]);
  if (!organization || !user || user.status !== "ACTIVE" || !hasOrganizationPermission({ actorId: userId, globalRole: user.role, ownerId: organization.ownerId, membershipRole: membership?.role ?? null, membershipStatus: membership?.status ?? null }, permission)) throw new Error("ORGANIZATION_ACCESS_REVOKED");
}
