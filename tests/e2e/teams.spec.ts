import { test, expect, login } from "./fixtures/tasks";

test.skip(!process.env.TEST_DATABASE_URL, "Set a dedicated migrated local TEST_DATABASE_URL for team workflows.");
test.setTimeout(90_000);

test("product managers create teams and persist leadership, membership, and audit events", async ({ page, tasks }) => {
  await login(page, tasks.manager);
  await page.goto("/dashboard/teams/new");
  await page.getByLabel("Team name", { exact: true }).fill("Customer Success");
  await page.getByLabel("Description", { exact: true }).fill("Customer onboarding and support.");
  await page.getByLabel("Team lead", { exact: true }).selectOption(tasks.employee.id);
  await page.locator(`input[name="memberIds"][value="${tasks.otherEmployee.id}"]`).check();
  await page.getByRole("button", { name: "Create team", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/teams\/.+/);
  await expect(page.getByRole("heading", { name: "Customer Success", exact: true })).toBeVisible();

  const team = await tasks.prisma.team.findFirstOrThrow({ where: { organizationId: tasks.organizationId, name: "Customer Success" }, include: { members: true } });
  expect(team.managerId).toBe(tasks.employee.id);
  expect(new Set(team.members.map((member) => member.userId))).toEqual(new Set([tasks.employee.id, tasks.otherEmployee.id]));
  expect((await tasks.prisma.organizationMember.findUniqueOrThrow({ where: { organizationId_userId: { organizationId: tasks.organizationId, userId: tasks.employee.id } } })).role).toBe("TEAM_LEAD");
  expect(await tasks.prisma.activityLog.count({ where: { organizationId: tasks.organizationId, entityId: team.id, action: "team.created" } })).toBe(1);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Customer Success", exact: true })).toBeVisible();
  await expect(page.getByText("Other employee", { exact: true })).toBeVisible();

  await page.context().clearCookies();
  await login(page, tasks.owner);
  await page.goto(`/dashboard/teams/${team.id}`);
  await page.getByLabel("Description", { exact: true }).fill("Customer onboarding, support, and operations.");
  await page.getByRole("button", { name: "Save team", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Team settings saved. Existing task assignments and work sessions were preserved.");
  expect((await tasks.prisma.team.findUniqueOrThrow({ where: { id: team.id } })).description).toBe("Customer onboarding, support, and operations.");
  expect(await tasks.prisma.activityLog.count({ where: { organizationId: tasks.organizationId, entityId: team.id, action: "team.updated" } })).toBe(1);
});

test("team update rejects duplicates and inactive or cross-organization members without partial writes", async ({ page, tasks }) => {
  await login(page, tasks.manager);
  await page.goto(`/dashboard/teams/${tasks.teamId}`);
  await page.locator(`input[name="memberIds"][value="${tasks.suspended.id}"]`).uncheck();
  const teamName = page.getByLabel("Team name", { exact: true });
  await teamName.fill("Other team");
  await page.getByRole("button", { name: "Save team", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("A team with this name already exists");
  expect((await tasks.prisma.team.findUniqueOrThrow({ where: { id: tasks.teamId } })).name).toBe("Delivery team");

  await teamName.fill("Delivery team");
  await page.locator(`input[name="memberIds"][value="${tasks.suspended.id}"]`).check();
  await page.getByRole("button", { name: "Save team", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("inactive or do not belong to this organization");
  expect((await tasks.prisma.team.findUniqueOrThrow({ where: { id: tasks.teamId } })).name).toBe("Delivery team");
  await page.locator(`input[name="memberIds"][value="${tasks.suspended.id}"]`).uncheck();

  await page.locator("form").evaluate((form, userId) => {
    const forged = document.createElement("input");
    forged.type = "hidden";
    forged.name = "memberIds";
    forged.value = userId;
    form.append(forged);
  }, tasks.foreignEmployee.id);
  await page.getByRole("button", { name: "Save team", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("inactive or do not belong to this organization");
  expect((await tasks.prisma.team.findUniqueOrThrow({ where: { id: tasks.teamId }, include: { members: true } })).members.some((member) => member.userId === tasks.foreignEmployee.id)).toBe(false);

  await page.locator('input[name="memberIds"][type="hidden"]').evaluate((node) => node.remove());
});

test("changing team leadership preserves active task work and only updates changed membership rows", async ({ page, tasks }) => {
  const attendance = await tasks.prisma.attendance.create({ data: { organizationId: tasks.organizationId, userId: tasks.employee.id, attendanceDate: new Date("2026-11-04T00:00:00.000Z"), checkInAt: new Date() } });
  const session = await tasks.prisma.workSession.create({ data: { organizationId: tasks.organizationId, userId: tasks.employee.id, attendanceId: attendance.id, taskId: tasks.taskId, startedAt: new Date() } });
  const existingLeadMember = await tasks.prisma.teamMember.findUniqueOrThrow({ where: { teamId_userId: { teamId: tasks.teamId, userId: tasks.otherEmployee.id } } });

  await login(page, tasks.manager);
  await page.goto(`/dashboard/teams/${tasks.teamId}`);
  await page.getByLabel("Team name", { exact: true }).fill("Delivery and Operations");
  await page.getByLabel("Team lead", { exact: true }).selectOption(tasks.otherEmployee.id);
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
  await expect(taskDialog.getByLabel("Assigned employee", { exact: true })).toHaveValue(tasks.employee.id);
  await expect(taskDialog.getByLabel("Assigned employee", { exact: true })).toContainText("existing assignment");
  await taskDialog.getByLabel("Task title", { exact: true }).fill("Preserved task assignment");
  await taskDialog.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(taskDialog.getByRole("status")).toHaveText("Task changes saved.");
  expect((await tasks.prisma.task.findUniqueOrThrow({ where: { id: tasks.taskId } })).assignedToId).toBe(tasks.employee.id);

  await page.goto("/dashboard/tasks?create=1");
  const createDialog = page.getByRole("dialog");
  await createDialog.getByLabel("Team", { exact: true }).selectOption(tasks.teamId);
  const assignmentOptions = await createDialog.getByLabel("Assigned employee", { exact: true }).locator("option").evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
  expect(assignmentOptions).not.toContain(tasks.employee.id);
});

test("team leads cannot edit another team's settings or change leadership with a forged form value", async ({ page, tasks }) => {
  await login(page, tasks.lead);
  await page.goto(`/dashboard/teams/${tasks.otherTeamId}`);
  await expect(page.getByRole("heading", { name: "Team settings", exact: true })).toHaveCount(0);
  await expect(page.getByText(/not found/i)).toBeVisible();

  await page.goto(`/dashboard/teams/${tasks.teamId}`);
  await page.locator(`input[name="memberIds"][value="${tasks.suspended.id}"]`).uncheck();
  await page.locator('input[name="managerId"]').evaluate((node, id) => { (node as HTMLInputElement).value = id; }, tasks.manager.id);
  await page.getByRole("button", { name: "Save team", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Only administrators and product managers can change team leadership");
  expect((await tasks.prisma.team.findUniqueOrThrow({ where: { id: tasks.teamId } })).managerId).toBe(tasks.lead.id);
  await page.locator('input[name="managerId"]').evaluate((node, id) => { (node as HTMLInputElement).value = id; }, tasks.lead.id);
  await page.getByLabel("Description", { exact: true }).fill("A team lead managed update.");
  await page.getByRole("button", { name: "Save team", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Team settings saved. Existing task assignments and work sessions were preserved.");
  expect((await tasks.prisma.team.findUniqueOrThrow({ where: { id: tasks.teamId } })).description).toBe("A team lead managed update.");
});
