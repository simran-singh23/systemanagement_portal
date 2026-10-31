import { randomUUID } from "node:crypto";
import { test as base, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../../lib/password";
import { assertSafeTestDatabaseUrl } from "../helpers/test-database";

const password = "TeamFlow-workflow-test-123";
type Backend = { prisma: PrismaClient; organizationId: string; employeeId: string; employeeEmail: string; managerEmail: string; taskId: string };

const test = base.extend<{ backend: Backend }>({
  backend: async ({}, run) => {
    const connectionString = assertSafeTestDatabaseUrl(process.env.TEST_DATABASE_URL);
    const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    const suffix = randomUUID();
    const passwordHash = await hashPassword(password);
    const manager = await prisma.user.create({ data: { name: "Workflow manager", email: `manager-${suffix}@teamflow.test`, role: "SUPER_ADMIN", status: "ACTIVE", emailVerified: new Date(), passwordHash } });
    const employee = await prisma.user.create({ data: { name: "Workflow employee", email: `employee-${suffix}@teamflow.test`, role: "EMPLOYEE", status: "ACTIVE", emailVerified: new Date(), passwordHash } });
    let organizationId: string | undefined;
    try {
      const organization = await prisma.organization.create({ data: {
        name: "Workflow test", slug: `workflow-${suffix}`, ownerId: manager.id,
        members: { create: [{ userId: manager.id, role: "SUPER_ADMIN", status: "ACTIVE" }, { userId: employee.id, role: "EMPLOYEE", status: "ACTIVE" }] },
        settings: { create: { timezone: "UTC", workDays: [0, 1, 2, 3, 4, 5, 6], allowReportBeforeCheckout: false } },
      } });
      organizationId = organization.id;
      const team = await prisma.team.create({ data: { organizationId, name: "Workflow team", managerId: manager.id, members: { create: { userId: employee.id } } } });
      const task = await prisma.task.create({ data: { organizationId, teamId: team.id, createdById: manager.id, assignedToId: employee.id, title: "Verify backend workday", status: "TODO" } });
      await run({ prisma, organizationId, employeeId: employee.id, employeeEmail: employee.email, managerEmail: manager.email, taskId: task.id });
    } finally {
      if (organizationId) {
        await prisma.break.deleteMany({ where: { organizationId } });
        await prisma.workSession.deleteMany({ where: { organizationId } });
        await prisma.dailyReport.deleteMany({ where: { organizationId } });
        await prisma.attendance.deleteMany({ where: { organizationId } });
        await prisma.leaveRequest.deleteMany({ where: { organizationId } });
        await prisma.organization.delete({ where: { id: organizationId } });
      }
      await prisma.user.deleteMany({ where: { id: { in: [manager.id, employee.id] } } });
      await prisma.$disconnect();
    }
  },
});

test.describe.configure({ mode: "default" });
test.skip(!process.env.TEST_DATABASE_URL, "Set an explicit migrated local TEST_DATABASE_URL to run real backend workflows.");
test.setTimeout(90_000);

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/(employee|dashboard)$/, { timeout: 20_000 });
}

test("password login rejects wrong credentials and routes each role correctly", async ({ page, backend }) => {
  await page.goto("/login");
  await page.getByLabel("Work email").fill(backend.employeeEmail);
  await page.getByLabel("Password", { exact: true }).fill("incorrect-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Email or password is incorrect" })).toBeVisible();
  await login(page, backend.employeeEmail);
  await expect(page).toHaveURL(/\/employee$/);
  await page.goto("/dashboard/employees");
  await expect(page).not.toHaveURL(/\/dashboard\/employees/);
  await page.context().clearCookies();
  await login(page, backend.managerEmail);
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("employee workday persists check-in, timer, break, checkout and report", async ({ page, backend }) => {
  const { prisma, organizationId, employeeId, taskId } = backend;
  await login(page, backend.employeeEmail);
  await expect(page).toHaveURL(/\/employee$/);
  await page.goto("/employee/attendance");
  await page.getByRole("button", { name: "Check in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Check out", exact: true })).toBeEnabled();
  await expect.poll(() => prisma.attendance.count({ where: { organizationId, userId: employeeId, checkInAt: { not: null } } })).toBe(1);
  await page.reload();
  await expect(page.getByRole("button", { name: "Check in", exact: true })).toBeDisabled();

  await page.goto("/employee/tasks");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect.poll(() => prisma.workSession.count({ where: { taskId, endedAt: null } })).toBe(1);
  await expect.poll(async () => (await prisma.task.findUniqueOrThrow({ where: { id: taskId } })).status).toBe("IN_PROGRESS");

  await page.goto("/employee/attendance");
  await page.getByRole("button", { name: "Start break", exact: true }).click();
  await expect(page.getByRole("button", { name: "End break", exact: true })).toBeVisible();
  await expect.poll(() => prisma.workSession.count({ where: { taskId, endedAt: null } })).toBe(0);
  await expect.poll(() => prisma.break.count({ where: { organizationId, userId: employeeId, endedAt: null } })).toBe(1);
  await page.getByRole("button", { name: "End break", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start break", exact: true })).toBeVisible();

  await page.goto("/employee/tasks");
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(page.getByRole("button", { name: "Finish task", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Finish task", exact: true }).click();
  await expect.poll(async () => (await prisma.task.findUniqueOrThrow({ where: { id: taskId } })).status).toBe("COMPLETED");

  await page.goto("/employee/attendance");
  await page.getByRole("button", { name: "Check out", exact: true }).click();
  await expect(page.getByRole("button", { name: "Check out", exact: true })).toBeDisabled();
  await expect.poll(() => prisma.workSession.count({ where: { organizationId, userId: employeeId, endedAt: null } })).toBe(0);
  await expect.poll(() => prisma.break.count({ where: { organizationId, userId: employeeId, endedAt: null } })).toBe(0);

  await page.goto("/employee/reports");
  await page.getByLabel("Today’s work summary").fill("Verified check-in, task tracking, break handling and checkout.");
  await page.getByRole("button", { name: "Submit daily report", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Submitted report", exact: true })).toBeVisible();
  const report = await prisma.dailyReport.findFirstOrThrow({ where: { organizationId, userId: employeeId }, include: { tasks: true, pulse: true } });
  expect(report.status).toBe("SUBMITTED");
  expect(report.tasks.some((task) => task.taskId === taskId && task.completedToday)).toBe(true);
  expect(report.pulse?.mood).toBe("NORMAL");
  expect(await prisma.notification.count({ where: { organizationId, type: "REPORT_SUBMITTED" } })).toBeGreaterThan(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Submitted report", exact: true })).toBeVisible();
});

test("leave approval updates attendance and deactivation closes open employee sessions", async ({ page, backend }) => {
  const { prisma, organizationId, employeeId } = backend;
  await login(page, backend.employeeEmail);
  await page.goto("/employee/attendance");
  await page.getByRole("button", { name: "Check in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Check out", exact: true })).toBeEnabled();
  await page.goto("/employee/leave");
  await page.getByRole("button", { name: "Apply for leave", exact: true }).click();
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  await page.getByLabel("Start date", { exact: true }).fill(tomorrow);
  await page.getByLabel("End date", { exact: true }).fill(tomorrow);
  await page.getByLabel("Reason", { exact: true }).fill("Planned leave for the backend workflow verification.");
  await page.getByRole("button", { name: "Submit request", exact: true }).click();
  await expect.poll(() => prisma.leaveRequest.count({ where: { organizationId, userId: employeeId, status: "PENDING" } })).toBe(1);
  const request = await prisma.leaveRequest.findFirstOrThrow({ where: { organizationId, userId: employeeId } });
  await page.context().clearCookies();
  await login(page, backend.managerEmail);
  await page.goto(`/dashboard/leave?request=${request.id}`);
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect.poll(async () => (await prisma.leaveRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe("APPROVED");
  expect(await prisma.attendance.count({ where: { organizationId, userId: employeeId, status: "ON_LEAVE", leaveRequestId: request.id } })).toBe(1);

  await page.goto(`/dashboard/employees/${employeeId}`);
  await page.getByRole("button", { name: "Deactivate account", exact: true }).click();
  await expect.poll(async () => (await prisma.user.findUniqueOrThrow({ where: { id: employeeId } })).status).toBe("SUSPENDED");
  expect(await prisma.workSession.count({ where: { organizationId, userId: employeeId, endedAt: null } })).toBe(0);
  expect(await prisma.attendance.count({ where: { organizationId, userId: employeeId, checkInAt: { not: null }, checkOutAt: { not: null } } })).toBe(1);
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Work email").fill(backend.employeeEmail);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Email or password is incorrect" })).toBeVisible();
});
