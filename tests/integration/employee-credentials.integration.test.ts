import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import type { UserRole } from "@prisma/client";
import { assertSafeTestDatabaseUrl } from "../helpers/test-database";

test("super-admin password provisioning", { skip: !process.env.TEST_DATABASE_URL && "Set a dedicated local TEST_DATABASE_URL." }, async (context) => {
  const originalDatabase = process.env.DATABASE_URL;
  process.env.DATABASE_URL = assertSafeTestDatabaseUrl(process.env.TEST_DATABASE_URL);
  const { prisma } = await import("../../lib/prisma");
  const { provisionInitialEmployeePassword } = await import("../../lib/employee-credentials");
  const { hashPassword, verifyPassword, authVersionAccepts } = await import("../../lib/password");
  const { dashboardPathForRole } = await import("../../lib/permissions");
  const password = "Admin-provisioned-test-password-123";
  const passwordHash = await hashPassword(password);
  const userIds: string[] = [];
  const organizationIds: string[] = [];

  async function fixture(role: UserRole = "EMPLOYEE") {
    const suffix = randomUUID();
    const owner = await prisma.user.create({ data: { email: `owner-${suffix}@teamflow.test`, name: "Provisioning owner", role: "SUPER_ADMIN" } });
    const person = await prisma.user.create({ data: { email: `employee-${suffix}@teamflow.test`, name: "Pending employee", role, status: "INVITED" } });
    userIds.push(owner.id, person.id);
    const org = await prisma.organization.create({ data: { name: "Password provisioning", slug: `credentials-${suffix}`, ownerId: owner.id, members: { create: [{ userId: owner.id, role: "SUPER_ADMIN", status: "ACTIVE" }, { userId: person.id, role, status: "INVITED" }] } } });
    organizationIds.push(org.id);
    return { owner, person, org, input: { organizationId: org.id, employeeId: person.id, actorId: owner.id, actorRole: "SUPER_ADMIN" as UserRole, passwordHash } };
  }

  try {
    await context.test("activation persists a password hash, clears setup links, and routes each assigned role", async () => {
      for (const role of ["EMPLOYEE", "TEAM_LEAD", "PRODUCT_MANAGER"] as const) {
        const f = await fixture(role);
        const token = randomUUID();
        await prisma.passwordToken.create({ data: { userId: f.person.id, purpose: "INITIAL_SETUP", tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 60_000) } });
        await prisma.$transaction((tx) => provisionInitialEmployeePassword(tx, f.input));
        const person = await prisma.user.findUniqueOrThrow({ where: { id: f.person.id }, include: { organizationMembers: true } });
        assert.equal(person.status, "ACTIVE"); assert.equal(person.role, role); assert.ok(person.emailVerified);
        assert.notEqual(person.passwordHash, password); assert.ok(await verifyPassword(person.passwordHash!, password));
        assert.equal(await verifyPassword(person.passwordHash!, "wrong-password"), false);
        assert.equal(person.organizationMembers[0].status, "ACTIVE"); assert.ok(person.organizationMembers[0].joinedAt);
        assert.equal(await prisma.passwordToken.count({ where: { userId: person.id } }), 0);
        assert.equal(authVersionAccepts(0, person.authVersion, false), false);
        assert.equal(dashboardPathForRole(person.role), role === "EMPLOYEE" ? "/employee" : "/dashboard");
        const event = await prisma.authSecurityEvent.findFirstOrThrow({ where: { userId: person.id, event: "admin_password_provisioned" } });
        assert(!JSON.stringify(event).includes(password));
        assert.equal(await prisma.activityLog.count({ where: { entityId: person.id, action: "employee.password_provisioned" } }), 1);
      }
    });

    await context.test("non-super-admin and cross-workspace attempts cannot create credentials", async () => {
      const f = await fixture();
      for (const actorRole of ["PRODUCT_MANAGER", "TEAM_LEAD", "EMPLOYEE"] as const) {
        await assert.rejects(prisma.$transaction((tx) => provisionInitialEmployeePassword(tx, { ...f.input, actorRole })), /Only a super admin/);
      }
      await assert.rejects(prisma.$transaction((tx) => provisionInitialEmployeePassword(tx, { ...f.input, organizationId: "another-workspace" })), /pending employee/);
      const person = await prisma.user.findUniqueOrThrow({ where: { id: f.person.id } });
      assert.equal(person.passwordHash, null); assert.equal(person.status, "INVITED");
    });

    await context.test("existing logins and shared accounts are never overwritten", async () => {
      const f = await fixture();
      await prisma.$transaction((tx) => provisionInitialEmployeePassword(tx, f.input));
      const differentHash = await hashPassword("Different-admin-password-123");
      await assert.rejects(prisma.$transaction((tx) => provisionInitialEmployeePassword(tx, { ...f.input, passwordHash: differentHash })), /pending employee/);
      assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: f.person.id } })).passwordHash, passwordHash);
      const shared = await fixture();
      await prisma.organizationMember.create({ data: { organizationId: f.org.id, userId: shared.person.id, role: "EMPLOYEE", status: "INVITED" } });
      await assert.rejects(prisma.$transaction((tx) => provisionInitialEmployeePassword(tx, shared.input)), /pending employee/);
      assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: shared.person.id } })).passwordHash, null);
    });

    await context.test("concurrent submissions activate a pending login only once", async () => {
      const f = await fixture();
      const results = await Promise.allSettled([prisma.$transaction((tx) => provisionInitialEmployeePassword(tx, f.input)), prisma.$transaction((tx) => provisionInitialEmployeePassword(tx, f.input))]);
      assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
      assert.equal(results.filter((result) => result.status === "rejected").length, 1);
      assert.equal(await prisma.authSecurityEvent.count({ where: { userId: f.person.id, event: "admin_password_provisioned" } }), 1);
    });
  } finally {
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await prisma.authSecurityEvent.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
    if (originalDatabase === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = originalDatabase;
  }
});
