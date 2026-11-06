import { randomUUID } from "node:crypto";
import { test as base, expect, type Page } from "@playwright/test";
import { PrismaClient, type UserRole } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../../../lib/password";
import { assertSafeTestDatabaseUrl } from "../../helpers/test-database";

const password = "TeamFlow-task-workflow-123";
type Actor = { id: string; email: string };
type TasksFixture = {
  prisma: PrismaClient; organizationId: string; foreignOrganizationId: string;
  owner: Actor; manager: Actor; lead: Actor; employee: Actor; otherEmployee: Actor; suspended: Actor;
  foreignEmployee: Actor;
  teamId: string; otherTeamId: string; taskId: string; otherTaskId: string; foreignTaskId: string;
};

export const test = base.extend<{ tasks: TasksFixture }>({
  page: async ({ page }, run) => {
    const segments = randomUUID().replaceAll("-", "").match(/.{4}/g)!.slice(0, 6);
    await page.setExtraHTTPHeaders({ "x-real-ip": `2001:db8:${segments.join(":")}` });
    await run(page);
  },
  tasks: async ({}, run) => {
    const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: assertSafeTestDatabaseUrl(process.env.TEST_DATABASE_URL) }) });
    const passwordHash = await hashPassword(password);
    const suffix = randomUUID();
    const users: string[] = [];
    const organizations: string[] = [];
    const actor = async (name: string, role: UserRole, status: "ACTIVE" | "SUSPENDED" = "ACTIVE") => {
      const user = await prisma.user.create({ data: { name, email: `${name.replaceAll(" ", "-").toLowerCase()}-${suffix}@teamflow.test`, role, status, emailVerified: new Date(), passwordHash } });
      users.push(user.id);
      return user;
    };
    try {
      const owner = await actor("Task owner", "SUPER_ADMIN");
      const manager = await actor("Task manager", "PRODUCT_MANAGER");
      const lead = await actor("Task lead", "TEAM_LEAD");
      const employee = await actor("Task employee", "EMPLOYEE");
      const otherEmployee = await actor("Other employee", "EMPLOYEE");
      const suspended = await actor("Suspended employee", "EMPLOYEE", "SUSPENDED");
      const foreignEmployee = await actor("Foreign employee", "EMPLOYEE");
      const organization = await prisma.organization.create({ data: {
        name: "Task workflow", slug: `tasks-${suffix}`, ownerId: owner.id,
        members: { create: [owner, manager, lead, employee, otherEmployee, suspended].map((user) => ({ userId: user.id, role: user.role, status: "ACTIVE" })) },
        settings: { create: { timezone: "Asia/Kolkata", workDays: [0, 1, 2, 3, 4, 5, 6] } },
      } });
      organizations.push(organization.id);
      const foreign = await prisma.organization.create({ data: { name: "Foreign organization", slug: `foreign-${suffix}`, ownerId: owner.id } });
      organizations.push(foreign.id);
      await prisma.organizationMember.create({ data: { organizationId: foreign.id, userId: foreignEmployee.id, role: "EMPLOYEE", status: "ACTIVE" } });
      const team = await prisma.team.create({ data: { organizationId: organization.id, name: "Delivery team", managerId: lead.id, members: { create: [lead, employee, otherEmployee, suspended].map((user) => ({ userId: user.id })) } } });
      const otherTeam = await prisma.team.create({ data: { organizationId: organization.id, name: "Other team", managerId: manager.id, members: { create: { userId: otherEmployee.id } } } });
      const task = await prisma.task.create({ data: { organizationId: organization.id, teamId: team.id, title: "Task workflow item", createdById: manager.id, assignedToId: employee.id, status: "TODO", position: 0 } });
      const otherTask = await prisma.task.create({ data: { organizationId: organization.id, teamId: otherTeam.id, title: "Other team private item", createdById: manager.id, assignedToId: otherEmployee.id, status: "TODO", position: 1 } });
      const foreignTask = await prisma.task.create({ data: { organizationId: foreign.id, title: "Foreign private task", createdById: owner.id, status: "TODO" } });
      await run({ prisma, organizationId: organization.id, foreignOrganizationId: foreign.id, owner, manager, lead, employee, otherEmployee, suspended, foreignEmployee, teamId: team.id, otherTeamId: otherTeam.id, taskId: task.id, otherTaskId: otherTask.id, foreignTaskId: foreignTask.id });
    } finally {
      await prisma.break.deleteMany({ where: { organizationId: { in: organizations } } });
      await prisma.workSession.deleteMany({ where: { organizationId: { in: organizations } } });
      await prisma.dailyReport.deleteMany({ where: { organizationId: { in: organizations } } });
      await prisma.attendance.deleteMany({ where: { organizationId: { in: organizations } } });
      await prisma.organization.deleteMany({ where: { id: { in: organizations } } });
      await prisma.user.deleteMany({ where: { id: { in: users } } });
      await prisma.$disconnect();
    }
  },
});

export async function login(page: Page, actor: Actor) {
  await page.goto("/login");
  if (new URL(page.url()).pathname !== "/login") {
    await page.getByRole("button", { name: "Sign out", exact: true }).first().click();
    await expect(page).toHaveURL(/\/login(?:\?|$)/);
  }
  await page.getByLabel("Work email").fill(actor.email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/(employee|dashboard)$/, { timeout: 20_000 });
}

export { expect };
