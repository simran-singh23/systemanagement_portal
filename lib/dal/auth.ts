import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { dashboardPathForRole, hasOrganizationPermission, hasPermission, organizationRoleForAccess, type Permission } from "@/lib/permissions";
import { hasApprovedOrganizationAccess } from "@/lib/member-access";

export const getCurrentUser = cache(async () => {
  const session = await auth();
  if (!session?.user?.id) return null;
  return prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, name: true, email: true, image: true, role: true, status: true } });
});

export async function requireUser() { const user = await getCurrentUser(); if (!user || user.status !== "ACTIVE") redirect("/login"); return user; }
export async function requireSignedInUser() { const user = await getCurrentUser(); if (!user || user.status === "SUSPENDED") redirect("/login"); return user; }
export async function requireRole(allowedRoles: readonly UserRole[]) { const user = await requireUser(); if (!allowedRoles.includes(user.role)) redirect(dashboardPathForRole(user.role)); return user; }
export async function requirePermission(permission: Permission) { const user = await requireUser(); if (!hasPermission(user.role, permission)) redirect("/unauthorized"); return user; }

export async function requireOrganizationPermission(organizationId: string, permission: Permission) {
  const user = await requireUser();
  const [membership, organization] = await Promise.all([
    prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId: user.id } },
      select: { id: true, role: true, status: true },
    }),
    prisma.organization.findUnique({ where: { id: organizationId }, select: { ownerId: true } }),
  ]);

  if (!organization) redirect("/unauthorized");

  const access = {
    actorId: user.id,
    globalRole: user.role,
    ownerId: organization.ownerId,
    membershipRole: membership?.role ?? null,
    membershipStatus: membership?.status ?? null,
  };
  if (!hasOrganizationPermission(access, permission)) redirect("/unauthorized");

  const effectiveRole = organizationRoleForAccess(access)!;
  return { user, membership: membership?.status === "ACTIVE" ? { ...membership, role: effectiveRole } : null };
}

export async function requireCurrentOrganization(permission: Permission) {
  const user = await requireUser();
  const memberships = await prisma.organizationMember.findMany({ where: { userId: user.id, status: "ACTIVE" }, include: { organization: true }, orderBy: { createdAt: "asc" } });
  if (user.role === "SUPER_ADMIN") {
    const organization = await prisma.organization.findFirst({ where: { ownerId: user.id }, orderBy: { createdAt: "asc" } });
    if (organization) {
      const ownedMembership = memberships.find((item) => item.organizationId === organization.id);
      return { user, organization, membership: ownedMembership ? { ...ownedMembership, role: "SUPER_ADMIN" as const } : null };
    }
  }
  const membership = memberships.find((item) => hasPermission(item.role, permission));
  if (membership) return { user, organization: membership.organization, membership };
  if (!hasApprovedOrganizationAccess(memberships, false)) redirect("/pending-access");
  redirect("/unauthorized");
}
