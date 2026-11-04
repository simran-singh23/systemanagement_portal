import { randomUUID } from "node:crypto";
import { test as base, expect, type Page } from "@playwright/test";
import { PrismaClient, type UserRole } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../../../lib/password";
import { assertSafeTestDatabaseUrl } from "../../helpers/test-database";

const password = "TeamFlow-employee-test-123";
type Actor = { id: string; email: string; role: UserRole };
type EmployeeFixture = {
  prisma: PrismaClient;
  organizationId: string;
  secondOrganizationId: string;
  owner: Actor;
  manager: Actor;
  lead: Actor;
  employee: Actor;
  multiOrgEmployee: Actor;
  foreignEmployee: Actor;
  teamId: string;
  openTeamId: string;
  foreignTeamId: string;
};

export const test = base.extend<{ employees: EmployeeFixture }>({
  page: async ({ page }, run) => {
    const segments = randomUUID().replaceAll("-", "").match(/.{4}/g)!.slice(0, 6);
    await page.setExtraHTTPHeaders({ "x-real-ip": `2001:db8:${segments.join(":")}` });
    await run(page);
  },
  employees: async ({}, run) => {
    const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: assertSafeTestDatabaseUrl(process.env.TEST_DATABASE_URL) }) });
    const suffix = randomUUID();
    const passwordHash = await hashPassword(password);
    const userIds: string[] = [];
    const organizationIds: string[] = [];
    const actor = async (name: string, role: UserRole): Promise<Actor> => {
      const user = await prisma.user.create({ data: { name, email: `${name.replaceAll(" ", "-").toLowerCase()}-${suffix}@teamflow.test`, role, status: "ACTIVE", emailVerified: new Date(), passwordHash } });
      userIds.push(user.id);
      return { id: user.id, email: user.email, role };
    };

    try {
      const owner = await actor("Employee owner", "SUPER_ADMIN");
      const manager = await actor("Employee manager", "PRODUCT_MANAGER");
      const lead = await actor("Employee lead", "TEAM_LEAD");
      const employee = await actor("Lifecycle employee", "EMPLOYEE");
      const multiOrgEmployee = await actor("Multi org employee", "EMPLOYEE");
      const foreignEmployee = await actor("Foreign lifecycle employee", "EMPLOYEE");
      const secondOwner = await actor("Second organization owner", "SUPER_ADMIN");
      const organization = await prisma.organization.create({ data: {
        name: "Employee lifecycle test",
        slug: `employee-lifecycle-${suffix}`,
        ownerId: owner.id,
        members: { create: [owner, manager, lead, employee, multiOrgEmployee].map((user) => ({ userId: user.id, role: user.role, status: "ACTIVE" })) },
        settings: { create: { timezone: "UTC", workDays: [0, 1, 2, 3, 4, 5, 6] } },
      } });
      organizationIds.push(organization.id);
      const secondOrganization = await prisma.organization.create({ data: {
        name: "Second employee organization",
        slug: `employee-lifecycle-second-${suffix}`,
        ownerId: secondOwner.id,
        members: { create: [
          { userId: secondOwner.id, role: "SUPER_ADMIN", status: "ACTIVE" },
          { userId: multiOrgEmployee.id, role: "PRODUCT_MANAGER", status: "ACTIVE" },
          { userId: foreignEmployee.id, role: "EMPLOYEE", status: "ACTIVE" },
        ] },
        settings: { create: { timezone: "UTC", workDays: [0, 1, 2, 3, 4, 5, 6] } },
      } });
      organizationIds.push(secondOrganization.id);
      const team = await prisma.team.create({ data: { organizationId: organization.id, name: "Lifecycle team", managerId: lead.id, members: { create: [{ userId: lead.id, role: "LEAD" }, { userId: employee.id, role: "MEMBER" }] } } });
      const openTeam = await prisma.team.create({ data: { organizationId: organization.id, name: "Open lifecycle team" } });
      const foreignTeam = await prisma.team.create({ data: { organizationId: secondOrganization.id, name: "Foreign lifecycle team" } });

      await run({
        prisma,
        organizationId: organization.id,
        secondOrganizationId: secondOrganization.id,
        owner,
        manager,
        lead,
        employee,
        multiOrgEmployee,
        foreignEmployee,
        teamId: team.id,
        openTeamId: openTeam.id,
        foreignTeamId: foreignTeam.id,
      });
    } finally {
      await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.$disconnect();
    }
  },
});

export async function login(page: Page, actor: Actor, loginPassword = password) {
  await page.goto("/login");
  await page.getByLabel("Work email").fill(actor.email);
  await page.getByLabel("Password", { exact: true }).fill(loginPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/(employee|dashboard)$/, { timeout: 20_000 });
}

export { expect, password };
