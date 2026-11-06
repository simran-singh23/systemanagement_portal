import { createHash, randomBytes, randomUUID } from "node:crypto";
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
  const email = `New-${randomUUID()}@TEAMFLOW.TEST`;
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Department").fill("Engineering");
  await page.getByLabel("Primary team").selectOption(employees.openTeamId);
  await page.getByRole("button", { name: "Invite employee", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/employees\/(?!new$)[^/?]+$/);

  const user = await employees.prisma.user.findUniqueOrThrow({ where: { email: email.toLowerCase() }, include: { organizationMembers: true, teamMembers: true } });
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
  const team = page.locator('select[name="teamId"]');
  await team.evaluate((element, id) => (element as HTMLSelectElement).add(new Option("Foreign team", id)), employees.foreignTeamId);
  await team.selectOption(employees.foreignTeamId);
  await page.getByRole("button", { name: "Invite employee", exact: true }).click();
  await expect(page.getByText("Choose a team from this organization.")).toBeVisible();
  expect(await employees.prisma.user.count({ where: { email: forgedEmail } })).toBe(0);
  expect(await employees.prisma.organizationMember.count({ where: { organizationId: employees.organizationId, user: { email: forgedEmail } } })).toBe(0);

  await page.goto("/dashboard/employees/new");
  await page.locator('input[name="organizationId"]').evaluate((input, id) => {
    (input as HTMLInputElement).value = id;
  }, employees.secondOrganizationId);
  await page.getByLabel("Full name").fill("Forged organization employee");
  const forgedOrgEmail = `forged-org-${Date.now()}@teamflow.test`;
  await page.getByLabel("Work email").fill(forgedOrgEmail);
  await page.getByRole("button", { name: "Invite employee", exact: true }).click();
  await expect(page).toHaveURL(/\/unauthorized$/);
  expect(await employees.prisma.user.count({ where: { email: forgedOrgEmail } })).toBe(0);

  await page.goto(`/dashboard/employees/${employees.employee.id}`);
  const role = page.locator('select[name="role"]');
  await role.evaluate((element) => (element as HTMLSelectElement).add(new Option("Super admin", "SUPER_ADMIN")));
  await role.selectOption("SUPER_ADMIN");
  await page.getByRole("button", { name: "Save employee", exact: true }).click();
  await expect(page.getByText(/Invalid option|Invalid input/)).toBeVisible();
  expect((await employees.prisma.organizationMember.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: employees.organizationId, userId: employees.employee.id } } })).role).toBe("EMPLOYEE");

  await page.goto(`/dashboard/employees/${employees.foreignEmployee.id}`);
  await expect(page.getByText(/could not be found/i)).toBeVisible();
});

test("manager role and team changes stay in one organization and synchronize team leadership", async ({ page, employees }) => {
  const attendance = await employees.prisma.attendance.create({ data: { organizationId: employees.organizationId, userId: employees.multiOrgEmployee.id, attendanceDate: new Date("2026-11-04T00:00:00.000Z"), checkInAt: new Date() } });
  const task = await employees.prisma.task.create({ data: { organizationId: employees.organizationId, createdById: employees.manager.id, assignedToId: employees.multiOrgEmployee.id, title: "Preserve cross-team work history", status: "IN_PROGRESS" } });
  const session = await employees.prisma.workSession.create({ data: { organizationId: employees.organizationId, userId: employees.multiOrgEmployee.id, attendanceId: attendance.id, taskId: task.id, startedAt: new Date() } });
  await login(page, employees.manager);
  await page.goto(`/dashboard/employees/${employees.multiOrgEmployee.id}`);
  await page.locator('select[name="role"]').selectOption("TEAM_LEAD");
  await page.locator('select[name="teamId"]').selectOption(employees.openTeamId);
  await page.getByRole("button", { name: "Save employee", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Employee details saved.");

  expect((await employees.prisma.organizationMember.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: employees.organizationId, userId: employees.multiOrgEmployee.id } } })).role).toBe("TEAM_LEAD");
  expect((await employees.prisma.team.findUniqueOrThrow({ where: { id: employees.openTeamId } })).managerId).toBe(employees.multiOrgEmployee.id);
  expect((await employees.prisma.teamMember.findUniqueOrThrow({ where: { teamId_userId: { teamId: employees.openTeamId, userId: employees.multiOrgEmployee.id } } })).role).toBe("LEAD");
  expect((await employees.prisma.task.findUniqueOrThrow({ where: { id: task.id } })).assignedToId).toBe(employees.multiOrgEmployee.id);
  expect((await employees.prisma.workSession.findUniqueOrThrow({ where: { id: session.id } })).endedAt).toBeNull();
  expect(await employees.prisma.organizationMember.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: employees.secondOrganizationId, userId: employees.multiOrgEmployee.id } } })).toMatchObject({ role: "PRODUCT_MANAGER", status: "ACTIVE" });

  await page.locator('select[name="role"]').selectOption("EMPLOYEE");
  await page.locator('select[name="teamId"]').selectOption("");
  await page.getByRole("button", { name: "Save employee", exact: true }).click();
  await expect.poll(async () => (await employees.prisma.team.findUniqueOrThrow({ where: { id: employees.openTeamId } })).managerId).toBeNull();
  expect(await employees.prisma.teamMember.findUnique({ where: { teamId_userId: { teamId: employees.openTeamId, userId: employees.multiOrgEmployee.id } } })).toBeNull();
  expect((await employees.prisma.task.findUniqueOrThrow({ where: { id: task.id } })).assignedToId).toBe(employees.multiOrgEmployee.id);
  expect((await employees.prisma.workSession.findUniqueOrThrow({ where: { id: session.id } })).endedAt).toBeNull();
  expect(await employees.prisma.organizationMember.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: employees.secondOrganizationId, userId: employees.multiOrgEmployee.id } } })).toMatchObject({ role: "PRODUCT_MANAGER", status: "ACTIVE" });
});

test("team leads and employees cannot replay an owner's employee-management action", async ({ page, employees }) => {
  await login(page, employees.owner);
  await page.goto("/dashboard/employees");
  await expect(page.getByRole("heading", { name: "Employees", exact: true })).toBeVisible();
  await page.goto(`/dashboard/employees/${employees.employee.id}`);
  await page.getByLabel("Department", { exact: true }).fill("Operations");
  const [saveRequest] = await Promise.all([
    page.waitForRequest((request) => request.method() === "POST" && Boolean(request.headers()["next-action"])),
    page.getByRole("button", { name: "Save employee", exact: true }).click(),
  ]);
  await expect(page.getByRole("status")).toHaveText("Employee details saved.");
  const where = { organizationId_userId: { organizationId: employees.organizationId, userId: employees.employee.id } };
  expect((await employees.prisma.organizationMember.findUniqueOrThrow({ where })).department).toBe("Operations");
  await employees.prisma.organizationMember.update({ where, data: { department: "Engineering" } });

  const headers = saveRequest.headers();
  const data = saveRequest.postDataBuffer();
  expect(data).not.toBeNull();
  for (const actor of [employees.lead, employees.employee]) {
    await page.context().clearCookies();
    await login(page, actor);
    await page.goto("/dashboard/employees/new");
    await expect(page).toHaveURL(actor.role === "TEAM_LEAD" ? "/unauthorized" : "/employee");
    const denied = await page.request.post(saveRequest.url(), {
      data: data!,
      headers: { "next-action": headers["next-action"], "content-type": headers["content-type"], origin: new URL(saveRequest.url()).origin },
      maxRedirects: 0,
    });
    const redirect = denied.headers()["x-action-redirect"] ?? denied.headers().location;
    expect(redirect).toContain(actor.role === "TEAM_LEAD" ? "/unauthorized" : "/employee");
    expect((await employees.prisma.organizationMember.findUniqueOrThrow({ where })).department).toBe("Engineering");
  }
  expect(await employees.prisma.organizationMember.count({ where: { organizationId: employees.organizationId } })).toBe(5);
});

test("profile-only saves preserve other team memberships and show the latest result", async ({ page, employees }) => {
  const userId = employees.employee.id;
  const primaryKey = { teamId: employees.teamId, userId };
  const secondaryKey = { teamId: employees.openTeamId, userId };
  const primary = await employees.prisma.teamMember.findUniqueOrThrow({ where: { teamId_userId: primaryKey } });
  const secondary = await employees.prisma.teamMember.create({ data: {
    ...secondaryKey,
    joinedAt: new Date(primary.joinedAt.getTime() + 1_000),
  } });
  await login(page, employees.manager);
  await page.goto(`/dashboard/employees/${userId}`);
  const team = page.locator('select[name="teamId"]');
  const role = page.locator('select[name="role"]');
  const save = page.getByRole("button", { name: "Save employee", exact: true });
  const success = page.getByRole("status").filter({ hasText: "Employee details saved." });
  await expect(team).toHaveValue(employees.teamId);
  await page.getByLabel("Job title").fill("Operations specialist");
  await page.getByLabel("Department", { exact: true }).fill("Operations");
  await save.click();
  await expect(success).toBeVisible();
  await expect(page.getByText("Operations specialist · Operations", { exact: true })).toBeVisible();
  expect(await employees.prisma.teamMember.findUnique({ where: { teamId_userId: primaryKey } })).toMatchObject({ id: primary.id });
  expect(await employees.prisma.teamMember.findUnique({ where: { teamId_userId: secondaryKey } })).toMatchObject({ id: secondary.id });

  let releaseSave!: () => void;
  const canSubmit = new Promise<void>((resolve) => { releaseSave = resolve; });
  await page.route(`**/dashboard/employees/${userId}`, async (route) => {
    if (route.request().method() === "POST") await canSubmit;
    await route.continue();
  });
  try {
    await role.selectOption("TEAM_LEAD");
    await team.selectOption("");
    await save.click();
    await expect(page.getByRole("button", { name: "Saving…", exact: true })).toBeDisabled();
    await expect(success).toHaveCount(0);
  } finally {
    releaseSave();
  }
  const validation = page.getByText("An active team lead must be assigned to a team.", { exact: true });
  await expect(validation).toBeVisible();
  await expect(success).toHaveCount(0);
  await role.selectOption("EMPLOYEE");
  await team.selectOption(employees.teamId);
  await page.getByLabel("Job title").clear();
  await page.getByLabel("Department", { exact: true }).clear();
  await save.click();
  await expect(success).toBeVisible();
  await expect(validation).toHaveCount(0);
  const saved = await employees.prisma.organizationMember.findUniqueOrThrow({
    where: { organizationId_userId: { organizationId: employees.organizationId, userId } },
    include: { user: { select: { jobTitle: true } } },
  });
  expect(saved).toMatchObject({ role: "EMPLOYEE", department: null, user: { jobTitle: null } });
  expect(await employees.prisma.teamMember.findUnique({ where: { teamId_userId: secondaryKey } })).toMatchObject({ id: secondary.id });
});

test("profile deactivation and reactivation preserve a team lead's other organization access and work history", async ({ page, browser, employees }) => {
  const userId = employees.multiOrgEmployee.id;
  const membershipKey = { organizationId: employees.organizationId, userId };
  await employees.prisma.organizationMember.update({
    where: { organizationId_userId: membershipKey },
    data: { role: "TEAM_LEAD" },
  });
  await employees.prisma.team.update({
    where: { id: employees.openTeamId },
    data: { managerId: userId, members: { create: { userId, role: "LEAD" } } },
  });
  const startedAt = new Date(Date.now() - 60_000);
  const attendance = await employees.prisma.attendance.create({
    data: { ...membershipKey, attendanceDate: new Date("2026-11-04T00:00:00.000Z"), checkInAt: startedAt },
  });
  const session = await employees.prisma.workSession.create({
    data: { ...membershipKey, attendanceId: attendance.id, startedAt },
  });
  const task = await employees.prisma.task.create({
    data: { organizationId: employees.organizationId, teamId: employees.openTeamId, createdById: employees.manager.id, assignedToId: userId, title: "Team lead work in progress", status: "IN_PROGRESS" },
  });
  const timer = await employees.prisma.workSession.create({
    data: { ...membershipKey, attendanceId: attendance.id, taskId: task.id, startedAt },
  });
  const employeeContext = await browser.newContext();
  const employeePage = await employeeContext.newPage();
  try {
    await login(employeePage, employees.multiOrgEmployee);
    const before = await employees.prisma.user.findUniqueOrThrow({ where: { id: employees.multiOrgEmployee.id }, select: { authVersion: true } });

    await login(page, employees.manager);
    await page.goto(`/dashboard/employees/${employees.multiOrgEmployee.id}`);
    await page.locator('select[name="status"]').selectOption("SUSPENDED");
    await page.getByRole("button", { name: "Save employee", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Employee details saved.");
    const suspended = await employees.prisma.organizationMember.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: employees.organizationId, userId: employees.multiOrgEmployee.id } } });
    expect(suspended).toMatchObject({ status: "SUSPENDED", role: "TEAM_LEAD" });
    expect((await employees.prisma.workSession.findUniqueOrThrow({ where: { id: session.id } })).endedAt).not.toBeNull();
    expect((await employees.prisma.workSession.findUniqueOrThrow({ where: { id: timer.id } })).endedAt).not.toBeNull();
    expect((await employees.prisma.task.findUniqueOrThrow({ where: { id: task.id } })).assignedToId).toBe(userId);
    expect((await employees.prisma.attendance.findUniqueOrThrow({ where: { id: attendance.id } })).checkOutAt).not.toBeNull();
    expect((await employees.prisma.team.findUniqueOrThrow({ where: { id: employees.openTeamId } })).managerId).toBe(userId);
    expect((await employees.prisma.user.findUniqueOrThrow({ where: { id: employees.multiOrgEmployee.id }, select: { authVersion: true, status: true } }))).toMatchObject({ authVersion: before.authVersion + 1, status: "ACTIVE" });
    expect(await employees.prisma.organizationMember.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: employees.secondOrganizationId, userId: employees.multiOrgEmployee.id } } })).toMatchObject({ role: "PRODUCT_MANAGER", status: "ACTIVE" });
    await employeePage.goto("/employee");
    await expect(employeePage).toHaveURL(/\/login/);

    await page.reload();
    await page.locator('select[name="status"]').selectOption("ACTIVE");
    await page.getByRole("button", { name: "Save employee", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Employee details saved.");
    expect((await employees.prisma.organizationMember.findUniqueOrThrow({ where: { organizationId_userId: membershipKey } }))).toMatchObject({ status: "ACTIVE", role: "TEAM_LEAD" });
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
  await expect(page.getByRole("alert").filter({ hasText: "invalid or has expired" })).toBeVisible();
  await login(page, { id: tokenUser.id, email: tokenUser.email, role: "EMPLOYEE" }, newPassword);

  const expiredUser = await employees.prisma.user.create({ data: { name: "Expired setup employee", email: `expired-setup-${Date.now()}@teamflow.test`, role: "EMPLOYEE", status: "INVITED" } });
  await employees.prisma.organizationMember.create({ data: { organizationId: employees.organizationId, userId: expiredUser.id, role: "EMPLOYEE", status: "INVITED" } });
  const expiredToken = randomBytes(32).toString("base64url");
  await createPasswordToken(employees.prisma, expiredUser.id, "INITIAL_SETUP", expiredToken, new Date(Date.now() - 1_000));
  await page.goto(`/set-password?token=${encodeURIComponent(expiredToken)}`);
  await page.getByLabel("New password", { exact: true }).fill(newPassword);
  await page.getByLabel("Confirm password", { exact: true }).fill(newPassword);
  await page.getByRole("button", { name: "Save password", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "invalid or has expired" })).toBeVisible();
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
  await expect(page.getByRole("alert").filter({ hasText: "invalid or has expired" })).toBeVisible();
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
    await expect(page.getByRole("alert").filter({ hasText: "Current password is incorrect" })).toBeVisible();
    expect((await employees.prisma.user.findUniqueOrThrow({ where: { id: employees.employee.id }, select: { authVersion: true } })).authVersion).toBe(afterReset.authVersion);

    await page.getByLabel("Current password").fill(newPassword);
    await page.getByLabel("New password", { exact: true }).fill("TeamFlow-employee-next-123");
    await page.getByLabel("Confirm new password").fill("TeamFlow-employee-next-123");
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
