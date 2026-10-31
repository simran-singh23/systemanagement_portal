import assert from "node:assert/strict";
import test from "node:test";
import { dashboardPathForRole, hasOrganizationPermission, hasPermission, organizationRoleForAccess } from "./permissions";

test("role permissions keep employee operations scoped", () => {
  assert.equal(hasPermission("EMPLOYEE", "tasks:update-own"), true);
  assert.equal(hasPermission("EMPLOYEE", "tasks:manage"), false);
  assert.equal(hasPermission("EMPLOYEE", "members:manage"), false);
  assert.equal(hasPermission("TEAM_LEAD", "tasks:manage"), true);
  assert.equal(hasPermission("PRODUCT_MANAGER", "members:manage"), true);
});

test("active organization membership role is authoritative", () => {
  const access = {
    actorId: "user-1",
    globalRole: "EMPLOYEE" as const,
    ownerId: "owner-1",
    membershipRole: "PRODUCT_MANAGER" as const,
    membershipStatus: "ACTIVE" as const,
  };

  assert.equal(organizationRoleForAccess(access), "PRODUCT_MANAGER");
  assert.equal(hasOrganizationPermission(access, "tasks:manage"), true);
});

test("suspended membership cannot authorize organization access", () => {
  const access = {
    actorId: "user-1",
    globalRole: "PRODUCT_MANAGER" as const,
    ownerId: "owner-1",
    membershipRole: "PRODUCT_MANAGER" as const,
    membershipStatus: "SUSPENDED" as const,
  };

  assert.equal(organizationRoleForAccess(access), null);
  assert.equal(hasOrganizationPermission(access, "tasks:manage"), false);
});

test("an authenticated user without organization membership is not authorized", () => {
  const access = {
    actorId: "user-without-membership",
    globalRole: "EMPLOYEE" as const,
    ownerId: "organization-owner",
    membershipRole: null,
    membershipStatus: null,
  };

  assert.equal(organizationRoleForAccess(access), null);
  assert.equal(hasOrganizationPermission(access, "organization:read"), false);
});

test("an active employee membership grants only the employee workspace permissions", () => {
  const access = {
    actorId: "employee-1",
    globalRole: "EMPLOYEE" as const,
    ownerId: "organization-owner",
    membershipRole: "EMPLOYEE" as const,
    membershipStatus: "ACTIVE" as const,
  };

  assert.equal(dashboardPathForRole("EMPLOYEE"), "/employee");
  assert.equal(hasOrganizationPermission(access, "organization:read"), true);
  assert.equal(hasOrganizationPermission(access, "tasks:update-own"), true);
  assert.equal(hasOrganizationPermission(access, "tasks:manage"), false);
});

test("SUPER_ADMIN cannot use an unrelated organization as a tenant bypass", () => {
  const access = {
    actorId: "admin-1",
    globalRole: "SUPER_ADMIN" as const,
    ownerId: "another-user",
    membershipRole: null,
    membershipStatus: null,
  };

  assert.equal(organizationRoleForAccess(access), null);
  assert.equal(hasOrganizationPermission(access, "organization:manage"), false);
});

test("SUPER_ADMIN owner can manage their own organization", () => {
  const access = {
    actorId: "admin-1",
    globalRole: "SUPER_ADMIN" as const,
    ownerId: "admin-1",
    membershipRole: null,
    membershipStatus: null,
  };

  assert.equal(organizationRoleForAccess(access), "SUPER_ADMIN");
  assert.equal(hasOrganizationPermission(access, "organization:manage"), true);
});

test("organization ownership cannot be downgraded by a stale employee membership", () => {
  assert.equal(organizationRoleForAccess({ actorId: "owner-1", globalRole: "SUPER_ADMIN", ownerId: "owner-1", membershipRole: "EMPLOYEE", membershipStatus: "ACTIVE" }), "SUPER_ADMIN");
});
