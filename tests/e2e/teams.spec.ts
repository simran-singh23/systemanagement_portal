import { test, expect, login } from "./fixtures/tasks";

test.skip(!process.env.TEST_DATABASE_URL, "Set a dedicated migrated local TEST_DATABASE_URL for team workflows.");
test.setTimeout(90_000);

test("product managers create teams and persist leadership, membership, and audit events", async ({ page, tasks }) => {
  await login(page, tasks.manager);
  await page.goto("/dashboard/teams/new");
  await page.locator('input[name="name"]').fill("Customer Success");
  await page.locator('input[name="color"]').fill("#1f7a52");
  await page.locator('textarea[name="description"]').fill("Customer onboarding and support.");
  await page.locator('select[name="managerId"]').selectOption(tasks.employee.id);
  await page.locator(`input[name="memberIds"][value="${tasks.otherEmployee.id}"]`).check();
  await page.getByRole("button", { name: "Create team", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/teams\/(?!new$)[^/?]+$/);
  await expect(page.getByRole("heading", { name: "Customer Success", exact: true })).toBeVisible();

  const team = await tasks.prisma.team.findFirstOrThrow({ where: { organizationId: tasks.organizationId, name: "Customer Success" }, include: { members: true } });
  expect(team.managerId).toBe(tasks.employee.id);
  expect(team.color).toBe("#1f7a52");
  expect(new Set(team.members.map((member) => member.userId))).toEqual(new Set([tasks.employee.id, tasks.otherEmployee.id]));
  expect((await tasks.prisma.organizationMember.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: tasks.organizationId, userId: tasks.employee.id } } })).role).toBe("TEAM_LEAD");
  expect(await tasks.prisma.activityLog.count({ where: { organizationId: tasks.organizationId, entityId: team.id, action: "team.created" } })).toBe(1);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Customer Success", exact: true })).toBeVisible();
  await expect(page.locator('input[name="color"]')).toHaveValue("#1f7a52");
  await expect(page.getByRole("complementary").filter({ hasText: "Current roster" }).getByText("Other employee", { exact: true })).toBeVisible();

  await page.context().clearCookies();
  await login(page, tasks.owner);
  await page.goto(`/dashboard/teams/${team.id}`);
  const description = page.locator('textarea[name="description"]');
  await expect(description).toHaveValue("Customer onboarding and support.");
  await description.clear();
  await description.fill("Customer onboarding, support, and operations.");
  await expect(description).toHaveValue("Customer onboarding, support, and operations.");
  await page.getByRole("button", { name: "Save team", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Team settings saved. Existing task assignments and work sessions were preserved.");
  expect((await tasks.prisma.team.findUniqueOrThrow({ where: { id: team.id } })).description).toBe("Customer onboarding, support, and operations.");
  expect(await tasks.prisma.activityLog.count({ where: { organizationId: tasks.organizationId, entityId: team.id, action: "team.updated" } })).toBe(1);

  await description.clear();
  await page.getByRole("button", { name: "Save team", exact: true }).click();
  await expect.poll(async () => (await tasks.prisma.team.findUniqueOrThrow({ where: { id: team.id } })).description).toBeNull();
  await page.reload();
  await expect(description).toHaveValue("");
});

test("replacing a suspended lead drops their former leadership role without restoring access", async ({ page, tasks }) => {
  const formerLead = { organizationId: tasks.organizationId, userId: tasks.lead.id };
  await tasks.prisma.organizationMember.update({ where: { organizationId_userId: formerLead }, data: { status: "SUSPENDED" } });
  await tasks.prisma.user.update({ where: { id: tasks.lead.id }, data: { status: "SUSPENDED" } });
  await login(page, tasks.manager);
  await page.goto(`/dashboard/teams/${tasks.teamId}`);
  await page.locator('select[name="managerId"]').selectOption(tasks.otherEmployee.id);
  await page.locator(`input[name="memberIds"][value="${tasks.lead.id}"]`).uncheck();
  await page.locator(`input[name="memberIds"][value="${tasks.suspended.id}"]`).uncheck();
  await page.getByRole("button", { name: "Save team", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Team settings saved.");
  expect(await tasks.prisma.organizationMember.findUnique({ where: { organizationId_userId: formerLead } })).toMatchObject({
    role: "EMPLOYEE",
    status: "SUSPENDED",
  });
  expect(await tasks.prisma.user.findUnique({ where: { id: tasks.lead.id } })).toMatchObject({ status: "SUSPENDED" });
  expect(await tasks.prisma.team.findUnique({ where: { id: tasks.teamId } })).toMatchObject({ managerId: tasks.otherEmployee.id });
});

test("team update rejects duplicates and inactive or cross-organization members without partial writes", async ({ page, tasks }) => {
  await login(page, tasks.manager);
  await page.goto(`/dashboard/teams/${tasks.teamId}`);
  await page.locator(`input[name="memberIds"][value="${tasks.suspended.id}"]`).uncheck();
  const teamName = page.locator('input[name="name"]');
  await teamName.fill("Other team");
  await page.getByRole("button", { name: "Save team", exact: true }).click();
  await expect(page.getByText("A team with this name already exists in this organization.", { exact: true })).toBeVisible();
  expect((await tasks.prisma.team.findUniqueOrThrow({ where: { id: tasks.teamId } })).name).toBe("Delivery team");

  await teamName.fill("Delivery team");
  await page.locator(`input[name="memberIds"][value="${tasks.suspended.id}"]`).check();
  await page.getByRole("button", { name: "Save team", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "inactive or do not belong to this organization" })).toBeVisible();
  expect((await tasks.prisma.team.findUniqueOrThrow({ where: { id: tasks.teamId } })).name).toBe("Delivery team");
  await page.locator(`input[name="memberIds"][value="${tasks.suspended.id}"]`).uncheck();

  await page.reload();
  await page.locator(`input[name="memberIds"][value="${tasks.suspended.id}"]`).uncheck();
  await page.locator("form").filter({ has: page.getByRole("button", { name: "Save team", exact: true }) }).evaluate((form, userId) => {
    const forged = document.createElement("input");
    forged.type = "hidden";
    forged.name = "memberIds";
    forged.value = userId;
    form.append(forged);
  }, tasks.foreignEmployee.id);
  await page.getByRole("button", { name: "Save team", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "inactive or do not belong to this organization" })).toBeVisible();
  expect((await tasks.prisma.team.findUniqueOrThrow({ where: { id: tasks.teamId }, include: { members: true } })).members.some((member) => member.userId === tasks.foreignEmployee.id)).toBe(false);

  await page.locator('input[name="memberIds"][type="hidden"]').evaluate((node) => node.remove());
});

test("changing team leadership preserves active task work and only updates changed membership rows", async ({ page, tasks }) => {
  const attendance = await tasks.prisma.attendance.create({ data: { organizationId: tasks.organizationId, userId: tasks.employee.id, attendanceDate: new Date("2026-11-04T00:00:00.000Z"), checkInAt: new Date() } });
  const session = await tasks.prisma.workSession.create({ data: { organizationId: tasks.organizationId, userId: tasks.employee.id, attendanceId: attendance.id, taskId: tasks.taskId, startedAt: new Date() } });
  const existingLeadMember = await tasks.prisma.teamMember.findUniqueOrThrow({ where: { teamId_userId: { teamId: tasks.teamId, userId: tasks.otherEmployee.id } } });

  await login(page, tasks.manager);
  await page.goto(`/dashboard/teams/${tasks.teamId}`);
  await page.locator('input[name="name"]').fill("Delivery and Operations");
  await page.locator('select[name="managerId"]').selectOption(tasks.otherEmployee.id);
  await page.locator(`input[name="memberIds"][value="${tasks.employee.id}"]`).uncheck();
  await page.locator(`input[name="memberIds"][value="${tasks.lead.id}"]`).uncheck();
  await page.locator(`input[name="memberIds"][value="${tasks.suspended.id}"]`).uncheck();
  await page.getByRole("button", { name: "Save team", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Existing task assignments and work sessions were preserved");

  const savedTeam = await tasks.prisma.team.findUniqueOrThrow({ where: { id: tasks.teamId }, include: { members: true } });
  expect(savedTeam.name).toBe("Delivery and Operations");
  expect(savedTeam.managerId).toBe(tasks.otherEmployee.id);
  expect(savedTeam.members.map((member) => member.userId)).toEqual([tasks.otherEmployee.id]);
  expect((await tasks.prisma.teamMember.findUniqueOrThrow({ where: { teamId_userId: { teamId: tasks.teamId, userId: tasks.otherEmployee.id } } })).joinedAt.getTime()).toBe(existingLeadMember.joinedAt.getTime());
  expect((await tasks.prisma.organizationMember.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: tasks.organizationId, userId: tasks.otherEmployee.id } } })).role).toBe("TEAM_LEAD");
  expect((await tasks.prisma.organizationMember.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: tasks.organizationId, userId: tasks.lead.id } } })).role).toBe("EMPLOYEE");
  expect((await tasks.prisma.task.findUniqueOrThrow({ where: { id: tasks.taskId } })).assignedToId).toBe(tasks.employee.id);
  expect((await tasks.prisma.workSession.findUniqueOrThrow({ where: { id: session.id } })).endedAt).toBeNull();
  const audit = await tasks.prisma.activityLog.findFirstOrThrow({ where: { organizationId: tasks.organizationId, entityId: tasks.teamId, action: "team.updated" }, orderBy: { createdAt: "desc" } });
  expect(audit.metadata).toMatchObject({ previousManagerId: tasks.lead.id, managerId: tasks.otherEmployee.id });
  expect(audit.metadata).toHaveProperty("removedMemberIds");

  await page.reload();
  await expect(page.getByRole("heading", { name: "Delivery and Operations", exact: true })).toBeVisible();

  await page.goto(`/dashboard/tasks?edit=${tasks.taskId}`);
  const taskDialog = page.getByRole("dialog");
  await expect(taskDialog.locator('select[name="assignedToId"]')).toHaveValue(tasks.employee.id);
  await expect(taskDialog.locator('select[name="assignedToId"]')).toContainText("existing assignment");
  await taskDialog.getByLabel("Task title", { exact: true }).fill("Preserved task assignment");
  await taskDialog.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(taskDialog.getByRole("status")).toHaveText("Task changes saved.");
  expect((await tasks.prisma.task.findUniqueOrThrow({ where: { id: tasks.taskId } })).assignedToId).toBe(tasks.employee.id);

  await page.goto("/dashboard/tasks?create=1");
  const createDialog = page.getByRole("dialog");
  await createDialog.locator('select[name="teamId"]').selectOption(tasks.teamId);
  const assignmentOptions = await createDialog.locator('select[name="assignedToId"]').locator("option").evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
  expect(assignmentOptions).not.toContain(tasks.employee.id);
});

test("team leads cannot edit another team's settings or change leadership with a forged form value", async ({ page, tasks }) => {
  await login(page, tasks.lead);
  await page.goto(`/dashboard/teams/${tasks.otherTeamId}`);
  await expect(page.getByRole("heading", { name: "Team settings", exact: true })).toHaveCount(0);
  await expect(page.getByText(/could not be found/i)).toBeVisible();

  await page.goto(`/dashboard/teams/${tasks.teamId}`);
  await page.locator(`input[name="memberIds"][value="${tasks.suspended.id}"]`).uncheck();
  await page.locator('input[name="managerId"]').evaluate((node, id) => { (node as HTMLInputElement).value = id; }, tasks.manager.id);
  await page.getByRole("button", { name: "Save team", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Only administrators and product managers can change team leadership" })).toBeVisible();
  expect((await tasks.prisma.team.findUniqueOrThrow({ where: { id: tasks.teamId } })).managerId).toBe(tasks.lead.id);
  await page.reload();
  await page.locator(`input[name="memberIds"][value="${tasks.suspended.id}"]`).uncheck();
  await page.locator('textarea[name="description"]').fill("A team lead managed update.");
  await page.getByRole("button", { name: "Save team", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Team settings saved. Existing task assignments and work sessions were preserved.");
  expect((await tasks.prisma.team.findUniqueOrThrow({ where: { id: tasks.teamId } })).description).toBe("A team lead managed update.");
});
