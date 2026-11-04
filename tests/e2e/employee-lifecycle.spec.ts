import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { test, expect, login, password } from "./fixtures/employees";

const newPassword = "TeamFlow-employee-updated-123";

async function createPasswordToken(prisma: PrismaClient, userId: string, purpose: "INITIAL_SETUP" | "PASSWORD_RESET", token: string, expiresAt = new Date(Date.now() + 30 * 60_000)) {
  await prisma.passwordToken.deleteMany({ where: { userId, purpose } });
  await prisma.passwordToken.create({ data: { userId, purpose, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt } });
}

test.describe.configure({ mode: "default" });
test.skip(!process.env.TEST_DATABASE_URL, "Set an explicit migrated local TEST_DATABASE_URL to run employee lifecycle workflows.");
test.setTimeout(90_000);

test("manager invites a normalized employee and persists the invited membership and team placement", async ({ page, employees }) => {
  await login(page, employees.manager);
  await page.goto("/dashboard/employees/new");
  await page.getByLabel("Full name").fill("New Lifecycle Employee");
  await page.getByLabel("Work email").fill(`New-${Date.now()}@TEAMFLOW.TEST`);
  await page.getByLabel("Department").fill("Engineering");
  await page.getByLabel("Primary team").selectOption(employees.openTeamId);
  await page.getByRole("button", { name: "Invite employee", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/employees\//);

  const user = await employees.prisma.user.findFirstOrThrow({ where: { name: "New Lifecycle Employee" }, include: { organizationMembers: true, teamMembers: true } });
  expect(user.email).toMatch(/^new-\d+@teamflow\.test$/);
  expect(user.status).toBe("INVITED");
  expect(user.organizationMembers).toHaveLength(1);
  expect(user.organizationMembers[0]).toMatchObject({ organizationId: employees.organizationId, role: "EMPLOYEE", status: "INVITED", department: "Engineering", joinedAt: null });
  expect(user.teamMembers).toHaveLength(1);
  expect(user.teamMembers[0]).toMatchObject({ teamId: employees.openTeamId, role: "MEMBER" });
  expect(await employees.prisma.passwordToken.count({ where: { userId: user.id, purpose: "INITIAL_SETUP" } })).toBe(1);
  expect(await employees.prisma.activityLog.findFirstOrThrow({ where: { organizationId: employees.organizationId, actorId: employees.manager.id, entityId: user.id, action: "employee.invited" } })).toBeTruthy();
});

test("duplicate email matching ignores case and directs managers to the existing employee profile", async ({ page, employees }) => {
  await login(page, employees.manager);
  await page.goto("/dashboard/employees/new");
  await page.getByLabel("Full name").fill("Duplicate attempt");
  await page.getByLabel("Work email").fill(employees.employee.email.toUpperCase());
  await page.getByRole("button", { name: "Invite employee", exact: true }).click();
  await expect(page.getByText("This person already has an employee profile. Open that profile to edit their access.", { exact: true })).toBeVisible();
  expect(await employees.prisma.user.count({ where: { email: { equals: employees.employee.email, mode: "insensitive" } } })).toBe(1);
  expect((await employees.prisma.organizationMember.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: employees.organizationId, userId: employees.employee.id } } })).status).toBe("ACTIVE");
});

test("inviting an existing case-variant account reuses that account without changing its other membership", async ({ page, employees }) => {
  const originalEmail = employees.foreignEmployee.email;
  const mixedCaseEmail = originalEmail.toUpperCase();
  await employees.prisma.user.update({ where: { id: employees.foreignEmployee.id }, data: { email: mixedCaseEmail } });
  await login(page, employees.manager);
  await page.goto("/dashboard/employees/new");
  await page.getByLabel("Full name").fill("Attempted overwrite");
  await page.getByLabel("Work email").fill(originalEmail);
  await page.getByLabel("Department").fill("Product");
  await page.getByRole("button", { name: "Invite employee", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/dashboard/employees/${employees.foreignEmployee.id}$`));
  expect(await employees.prisma.user.count({ where: { email: { equals: originalEmail, mode: "insensitive" } } })).toBe(1);
  expect(await employees.prisma.user.findUniqueOrThrow({ where: { id: employees.foreignEmployee.id } })).toMatchObject({ email: originalEmail, name: "Attempted overwrite" });
  expect(await employees.prisma.organizationMember.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: employees.secondOrganizationId, userId: employees.foreignEmployee.id } } })).toMatchObject({ role: "EMPLOYEE", status: "ACTIVE" });
  expect(await employees.prisma.organizationMember.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: employees.organizationId, userId: employees.foreignEmployee.id } } })).toMatchObject({ role: "EMPLOYEE", status: "ACTIVE", department: "Product" });
});

test("forged cross-organization team and membership IDs are rejected without partial writes", async ({ page, employees }) => {
  await login(page, employees.manager);
  await page.goto("/dashboard/employees/new");
  await page.getByLabel("Full name").fill("Forged team employee");
  const forgedEmail = `forged-${Date.now()}@teamflow.test`;
  await page.getByLabel("Work email").fill(forgedEmail);
  const team = page.getByLabel("Primary team");
  await team.evaluate((element, id) => (element as HTMLSelectElement).add(new Option("Foreign team", id)), employees.foreignTeamId);
  await team.selectOption(employees.foreignTeamId);
  await page.getByRole("button", { name: "Invite employee", exact: true }).click();
  await expect(page.getByText("Choose a team from this organization.")).toBeVisible();
  expect(await employees.prisma.user.count({ where: { email: forgedEmail } })).toBe(0);
  expect(await employees.prisma.organizationMember.count({ where: { organizationId: employees.organizationId, user: { email: forgedEmail } } })).toBe(0);

  await page.goto("/dashboard/employees/new");
  await page.locator('input[name="organizationId"]').fill(employees.secondOrganizationId);
  await page.getByLabel("Full name").fill("Forged organization employee");
  const forgedOrgEmail = `forged-org-${Date.now()}@teamflow.test`;
  await page.getByLabel("Work email").fill(forgedOrgEmail);
  await page.getByRole("button", { name: "Invite employee", exact: true }).click();
  await expect(page).not.toHaveURL(/\/dashboard\/employees\/[a-z0-9]+$/);
  expect(await employees.prisma.user.count({ where: { email: forgedOrgEmail } })).toBe(0);

  await page.goto(`/dashboard/employees/${employees.employee.id}`);
  const role = page.getByLabel("Role", { exact: true });
  await role.evaluate((element) => (element as HTMLSelectElement).add(new Option("Super admin", "SUPER_ADMIN")));
  await role.selectOption("SUPER_ADMIN");
  await page.getByRole("button", { name: "Save employee", exact: true }).click();
  await expect(page.getByText(/Invalid option|Invalid input/)).toBeVisible();
  expect((await employees.prisma.organizationMember.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: employees.organizationId, userId: employees.employee.id } } })).role).toBe("EMPLOYEE");

  const response = await page.goto(`/dashboard/employees/${employees.foreignEmployee.id}`);
  expect(response?.status()).toBe(404);
});

test("manager role and team changes stay in one organization and synchronize team leadership", async ({ page, employees }) => {
  const attendance = await employees.prisma.attendance.create({ data: { organizationId: employees.organizationId, userId: employees.multiOrgEmployee.id, attendanceDate: new Date("2026-11-04T00:00:00.000Z"), checkInAt: new Date() } });
  const task = await employees.prisma.task.create({ data: { organizationId: employees.organizationId, createdById: employees.manager.id, assignedToId: employees.multiOrgEmployee.id, title: "Preserve cross-team work history", status: "IN_PROGRESS" } });
  const session = await employees.prisma.workSession.create({ data: { organizationId: employees.organizationId, userId: employees.multiOrgEmployee.id, attendanceId: attendance.id, taskId: task.id, startedAt: new Date() } });
  await login(page, employees.manager);
  await page.goto(`/dashboard/employees/${employees.multiOrgEmployee.id}`);
  await page.getByLabel("Role", { exact: true }).selectOption("TEAM_LEAD");
  await page.getByLabel("Primary team", { exact: true }).selectOption(employees.openTeamId);
  await page.getByRole("button", { name: "Save employee", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Employee details saved.");

  expect((await employees.prisma.organizationMember.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: employees.organizationId, userId: employees.multiOrgEmployee.id } } })).role).toBe("TEAM_LEAD");
  expect((await employees.prisma.team.findUniqueOrThrow({ where: { id: employees.openTeamId } })).managerId).toBe(employees.multiOrgEmployee.id);
  expect((await employees.prisma.teamMember.findUniqueOrThrow({ where: { teamId_userId: { teamId: employees.openTeamId, userId: employees.multiOrgEmployee.id } } })).role).toBe("LEAD");
  expect((await employees.prisma.task.findUniqueOrThrow({ where: { id: task.id } })).assignedToId).toBe(employees.multiOrgEmployee.id);
  expect((await employees.prisma.workSession.findUniqueOrThrow({ where: { id: session.id } })).endedAt).toBeNull();
  expect(await employees.prisma.organizationMember.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: employees.secondOrganizationId, userId: employees.multiOrgEmployee.id } } })).toMatchObject({ role: "PRODUCT_MANAGER", status: "ACTIVE" });

  await page.getByLabel("Role", { exact: true }).selectOption("EMPLOYEE");
  await page.getByLabel("Primary team", { exact: true }).selectOption("");
  await page.getByRole("button", { name: "Save employee", exact: true }).click();
  expect((await employees.prisma.team.findUniqueOrThrow({ where: { id: employees.openTeamId } })).managerId).toBeNull();
  expect(await employees.prisma.teamMember.findUnique({ where: { teamId_userId: { teamId: employees.openTeamId, userId: employees.multiOrgEmployee.id } } })).toBeNull();
  expect((await employees.prisma.task.findUniqueOrThrow({ where: { id: task.id } })).assignedToId).toBe(employees.multiOrgEmployee.id);
  expect((await employees.prisma.workSession.findUniqueOrThrow({ where: { id: session.id } })).endedAt).toBeNull();
  expect(await employees.prisma.organizationMember.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: employees.secondOrganizationId, userId: employees.multiOrgEmployee.id } } })).toMatchObject({ role: "PRODUCT_MANAGER", status: "ACTIVE" });
});

test("team leads and employees cannot open or submit employee-management mutations", async ({ page, employees }) => {
  for (const actor of [employees.lead, employees.employee]) {
    await login(page, actor);
    await page.goto("/dashboard/employees/new");
    await expect(page).not.toHaveURL(/\/dashboard\/employees\/new/);
    await page.context().clearCookies();
  }
  await login(page, employees.owner);
  await page.goto("/dashboard/employees");
  await expect(page.getByRole("heading", { name: "Employees", exact: true })).toBeVisible();
  await page.goto(`/dashboard/employees/${employees.employee.id}`);
  await page.getByLabel("Department", { exact: true }).fill("Operations");
  await page.getByRole("button", { name: "Save employee", exact: true }).click();
  expect((await employees.prisma.organizationMember.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: employees.organizationId, userId: employees.employee.id } } })).department).toBe("Operations");
  expect(await employees.prisma.organizationMember.count({ where: { organizationId: employees.organizationId } })).toBe(5);
});

test("reactivation invalidates old JWTs without changing another organization's membership", async ({ page, browser, employees }) => {
  const employeeContext = await browser.newContext();
  const employeePage = await employeeContext.newPage();
  try {
    await login(employeePage, employees.multiOrgEmployee);
    const before = await employees.prisma.user.findUniqueOrThrow({ where: { id: employees.multiOrgEmployee.id }, select: { authVersion: true } });

    await login(page, employees.manager);
    await page.goto(`/dashboard/employees/${employees.multiOrgEmployee.id}`);
    await page.getByLabel("Account status", { exact: true }).selectOption("SUSPENDED");
    await page.getByRole("button", { name: "Save employee", exact: true }).click();
    const suspended = await employees.prisma.organizationMember.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: employees.organizationId, userId: employees.multiOrgEmployee.id } } });
    expect(suspended.status).toBe("SUSPENDED");
    expect((await employees.prisma.user.findUniqueOrThrow({ where: { id: employees.multiOrgEmployee.id }, select: { authVersion: true, status: true } }))).toMatchObject({ authVersion: before.authVersion + 1, status: "ACTIVE" });
    expect(await employees.prisma.organizationMember.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: employees.secondOrganizationId, userId: employees.multiOrgEmployee.id } } })).toMatchObject({ role: "PRODUCT_MANAGER", status: "ACTIVE" });
    await employeePage.goto("/employee");
    await expect(employeePage).toHaveURL(/\/login/);

    await page.getByLabel("Account status", { exact: true }).selectOption("ACTIVE");
    await page.getByRole("button", { name: "Save employee", exact: true }).click();
    expect((await employees.prisma.organizationMember.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: employees.organizationId, userId: employees.multiOrgEmployee.id } } })).status).toBe("ACTIVE");
    expect(await employees.prisma.organizationMember.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: employees.secondOrganizationId, userId: employees.multiOrgEmployee.id } } })).toMatchObject({ role: "PRODUCT_MANAGER", status: "ACTIVE" });
    await login(employeePage, employees.multiOrgEmployee);
  } finally {
    await employeeContext.close();
  }
});

test("one-time setup links activate one membership, reject repeat and expired submissions, then allow sign-in", async ({ page, employees }) => {
  const tokenUser = await employees.prisma.user.create({ data: { name: "Token setup employee", email: `token-setup-${Date.now()}@teamflow.test`, role: "EMPLOYEE", status: "INVITED" } });
  await employees.prisma.organizationMember.create({ data: { organizationId: employees.organizationId, userId: tokenUser.id, role: "EMPLOYEE", status: "INVITED" } });
  const token = randomBytes(32).toString("base64url");
  await createPasswordToken(employees.prisma, tokenUser.id, "INITIAL_SETUP", token);
  await page.goto(`/set-password?token=${encodeURIComponent(token)}`);
  await page.getByLabel("New password", { exact: true }).fill(newPassword);
  await page.getByLabel("Confirm password", { exact: true }).fill(newPassword);
  await page.getByRole("button", { name: "Save password", exact: true }).click();
  await expect(page).toHaveURL(/\/login\?password=updated/);
  expect((await employees.prisma.organizationMember.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: employees.organizationId, userId: tokenUser.id } } })).status).toBe("ACTIVE");
  const saved = await employees.prisma.user.findUniqueOrThrow({ where: { id: tokenUser.id }, select: { status: true, emailVerified: true, passwordHash: true } });
  expect(saved.status).toBe("ACTIVE");
  expect(saved.emailVerified).not.toBeNull();
  expect(saved.passwordHash).not.toBe(newPassword);

  await page.goto(`/set-password?token=${encodeURIComponent(token)}`);
  await page.getByLabel("New password", { exact: true }).fill("TeamFlow-employee-repeat-123");
  await page.getByLabel("Confirm password", { exact: true }).fill("TeamFlow-employee-repeat-123");
  await page.getByRole("button", { name: "Save password", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("invalid or has expired");
  await login(page, { id: tokenUser.id, email: tokenUser.email, role: "EMPLOYEE" }, newPassword);

  const expiredUser = await employees.prisma.user.create({ data: { name: "Expired setup employee", email: `expired-setup-${Date.now()}@teamflow.test`, role: "EMPLOYEE", status: "INVITED" } });
  await employees.prisma.organizationMember.create({ data: { organizationId: employees.organizationId, userId: expiredUser.id, role: "EMPLOYEE", status: "INVITED" } });
  const expiredToken = randomBytes(32).toString("base64url");
  await createPasswordToken(employees.prisma, expiredUser.id, "INITIAL_SETUP", expiredToken, new Date(Date.now() - 1_000));
  await page.goto(`/set-password?token=${encodeURIComponent(expiredToken)}`);
  await page.getByLabel("New password", { exact: true }).fill(newPassword);
  await page.getByLabel("Confirm password", { exact: true }).fill(newPassword);
  await page.getByRole("button", { name: "Save password", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("invalid or has expired");
  expect((await employees.prisma.organizationMember.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: employees.organizationId, userId: expiredUser.id } } })).status).toBe("INVITED");
});

test("setup link fails closed when the account has multiple pending organization invitations", async ({ page, employees }) => {
  const user = await employees.prisma.user.create({ data: { name: "Ambiguous invite", email: `ambiguous-${Date.now()}@teamflow.test`, role: "EMPLOYEE", status: "INVITED" } });
  await employees.prisma.organizationMember.createMany({ data: [
    { organizationId: employees.organizationId, userId: user.id, role: "EMPLOYEE", status: "INVITED" },
    { organizationId: employees.secondOrganizationId, userId: user.id, role: "EMPLOYEE", status: "INVITED" },
  ] });
  const token = randomBytes(32).toString("base64url");
  await createPasswordToken(employees.prisma, user.id, "INITIAL_SETUP", token);
  await page.goto(`/set-password?token=${encodeURIComponent(token)}`);
  await page.getByLabel("New password", { exact: true }).fill(newPassword);
  await page.getByLabel("Confirm password", { exact: true }).fill(newPassword);
  await page.getByRole("button", { name: "Save password", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("invalid or has expired");
  expect(await employees.prisma.organizationMember.count({ where: { userId: user.id, status: "ACTIVE" } })).toBe(0);
  expect((await employees.prisma.passwordToken.findFirstOrThrow({ where: { userId: user.id } })).consumedAt).toBeNull();
});

test("password reset and authenticated password change reject old credentials and revoke existing sessions", async ({ page, browser, employees }) => {
  const staleContext = await browser.newContext();
  const stalePage = await staleContext.newPage();
  try {
    await login(stalePage, employees.employee);
    const before = await employees.prisma.user.findUniqueOrThrow({ where: { id: employees.employee.id }, select: { authVersion: true, passwordHash: true } });
    const resetToken = randomBytes(32).toString("base64url");
    await createPasswordToken(employees.prisma, employees.employee.id, "PASSWORD_RESET", resetToken);
    await page.goto(`/reset-password?token=${encodeURIComponent(resetToken)}`);
    await page.getByLabel("New password", { exact: true }).fill(newPassword);
    await page.getByLabel("Confirm password", { exact: true }).fill(newPassword);
    await page.getByRole("button", { name: "Save password", exact: true }).click();
    await expect(page).toHaveURL(/\/login\?password=updated/);
    const afterReset = await employees.prisma.user.findUniqueOrThrow({ where: { id: employees.employee.id }, select: { authVersion: true, passwordHash: true } });
    expect(afterReset.authVersion).toBe(before.authVersion + 1);
    expect(afterReset.passwordHash).not.toBe(before.passwordHash);
    await stalePage.goto("/employee");
    await expect(stalePage).toHaveURL(/\/login/);
    await page.goto("/login");
    await page.getByLabel("Work email").fill(employees.employee.email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Email or password is incorrect" })).toBeVisible();
    await login(page, employees.employee, newPassword);
    await page.goto("/account/security");
    await page.getByLabel("Current password").fill(password);
    await page.getByLabel("New password", { exact: true }).fill("TeamFlow-employee-next-123");
    await page.getByLabel("Confirm new password").fill("TeamFlow-employee-next-123");
    await page.getByRole("button", { name: "Update password", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Current password is incorrect");
    expect((await employees.prisma.user.findUniqueOrThrow({ where: { id: employees.employee.id }, select: { authVersion: true } })).authVersion).toBe(afterReset.authVersion);

    await page.getByLabel("Current password").fill(newPassword);
    await page.getByRole("button", { name: "Update password", exact: true }).click();
    await expect(page).toHaveURL(/\/login\?password=updated/);
    expect((await employees.prisma.user.findUniqueOrThrow({ where: { id: employees.employee.id }, select: { authVersion: true } })).authVersion).toBe(afterReset.authVersion + 1);
    await page.goto("/login");
    await page.getByLabel("Work email").fill(employees.employee.email);
    await page.getByLabel("Password", { exact: true }).fill(newPassword);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Email or password is incorrect" })).toBeVisible();
    await login(page, employees.employee, "TeamFlow-employee-next-123");
  } finally {
    await staleContext.close();
  }
});
