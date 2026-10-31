import type { MembershipStatus, UserRole } from "@prisma/client";

export const MANAGER_ROLES = [
  "SUPER_ADMIN",
  "PRODUCT_MANAGER",
  "TEAM_LEAD",
] as const satisfies readonly UserRole[];

export type Permission =
  | "organization:manage"
  | "organization:read"
  | "members:manage"
  | "teams:manage"
  | "tasks:manage"
  | "tasks:update-own"
  | "attendance:read-all"
  | "attendance:update-own"
  | "reports:read-all"
  | "reports:manage-own"
  | "leave:review"
  | "leave:manage-own";

const rolePermissions: Record<UserRole, readonly Permission[]> = {
  SUPER_ADMIN: [
    "organization:manage",
    "organization:read",
    "members:manage",
    "teams:manage",
    "tasks:manage",
    "tasks:update-own",
    "attendance:read-all",
    "attendance:update-own",
    "reports:read-all",
    "reports:manage-own",
    "leave:review",
    "leave:manage-own",
  ],
  PRODUCT_MANAGER: [
    "organization:read",
    "members:manage",
    "teams:manage",
    "tasks:manage",
    "tasks:update-own",
    "attendance:read-all",
    "attendance:update-own",
    "reports:read-all",
    "reports:manage-own",
    "leave:review",
    "leave:manage-own",
  ],
  TEAM_LEAD: [
    "organization:read",
    "teams:manage",
    "tasks:manage",
    "tasks:update-own",
    "attendance:read-all",
    "attendance:update-own",
    "reports:read-all",
    "reports:manage-own",
    "leave:review",
    "leave:manage-own",
  ],
  EMPLOYEE: [
    "organization:read",
    "tasks:update-own",
    "attendance:update-own",
    "reports:manage-own",
    "leave:manage-own",
  ],
};

export function hasPermission(role: UserRole, permission: Permission) {
  return rolePermissions[role].includes(permission);
}

type OrganizationAccess = {
  actorId: string;
  globalRole: UserRole;
  ownerId: string | null;
  membershipRole: UserRole | null;
  membershipStatus: MembershipStatus | null;
};

/**
 * Resolve the role that is valid inside a specific organization. A global
 * SUPER_ADMIN role is intentionally not a cross-tenant bypass: it only grants
 * access to organizations owned by that user. Active membership roles remain
 * the source of truth for every other organization.
 */
export function organizationRoleForAccess(access: OrganizationAccess): UserRole | null {
  if (access.globalRole === "SUPER_ADMIN" && access.ownerId === access.actorId) {
    return "SUPER_ADMIN";
  }

  if (access.membershipStatus === "ACTIVE" && access.membershipRole) {
    return access.membershipRole;
  }

  return null;
}

export function hasOrganizationPermission(access: OrganizationAccess, permission: Permission) {
  const organizationRole = organizationRoleForAccess(access);
  return organizationRole ? hasPermission(organizationRole, permission) : false;
}

export function isManagerRole(role: UserRole) {
  return (MANAGER_ROLES as readonly UserRole[]).includes(role);
}

export function dashboardPathForRole(role: UserRole) {
  return role === "EMPLOYEE" ? "/employee" : "/dashboard";
}
