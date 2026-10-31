import { test, expect, login } from "./fixtures/tasks";

test.skip(!process.env.TEST_DATABASE_URL, "Set a migrated local TEST_DATABASE_URL for task workflows.");
test.setTimeout(90_000);
test.use({ actionTimeout: 10_000 });

test("manager creates and edits a task with organization-local deadlines", async ({ page, tasks }) => {
  await tasks.prisma.organizationSettings.update({ where: { organizationId: tasks.organizationId }, data: { timezone: "America/New_York" } });
  await login(page, tasks.manager);
  await page.goto("/dashboard/tasks?create=1");
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Task title", { exact: true }).fill("Manager-created delivery");
  await dialog.getByLabel("Description", { exact: true }).fill("Task created through the real manager form.");
  await dialog.getByRole("combobox", { name: "Team", exact: true }).selectOption(tasks.teamId);
  await dialog.getByRole("combobox", { name: "Assigned employee", exact: true }).selectOption(tasks.employee.id);
  await dialog.getByLabel("Start date", { exact: true }).fill("2026-11-02T09:00");
  await dialog.getByLabel("Due date", { exact: true }).fill("2026-11-02T18:00");
  await dialog.getByLabel("Estimated hours", { exact: true }).fill("2.5");
  await dialog.getByRole("button", { name: "Create task", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("created successfully");
  const task = await tasks.prisma.task.findFirstOrThrow({ where: { organizationId: tasks.organizationId, title: "Manager-created delivery" } });
  expect(task.assignedToId).toBe(tasks.employee.id);
  expect(task.startAt?.toISOString()).toBe("2026-11-02T14:00:00.000Z");
  expect(task.dueAt?.toISOString()).toBe("2026-11-02T23:00:00.000Z");
  expect(task.estimatedMins).toBe(150);
  expect(await tasks.prisma.notification.count({ where: { userId: tasks.employee.id, type: "TASK_ASSIGNED", relatedEntityId: task.id } })).toBe(1);
  await page.goto(`/dashboard/tasks?edit=${task.id}`);
  await expect(dialog.getByLabel("Due date", { exact: true })).toHaveValue("2026-11-02T18:00");
  await dialog.getByRole("combobox", { name: "Priority", exact: true }).selectOption("URGENT");
  await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(dialog.getByRole("status")).toHaveText("Task changes saved.");
  const saved = await tasks.prisma.task.findUniqueOrThrow({ where: { id: task.id } });
  expect(saved.priority).toBe("URGENT");
  expect(saved.dueAt?.toISOString()).toBe(task.dueAt?.toISOString());
});

test("notification task links open details and discussion edits persist", async ({ page, tasks }) => {
  await login(page, tasks.manager);
  await page.goto(`/dashboard/tasks?task=${tasks.taskId}`);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Task workflow item", exact: true })).toBeVisible();
  await dialog.getByPlaceholder("Add context, ask a question, or record a decision…").fill("Manager handoff comment");
  await dialog.getByRole("button", { name: "Post comment", exact: true }).click();
  await expect(dialog.getByText("Manager handoff comment", { exact: true })).toBeVisible();
  const comment = dialog.getByRole("article").filter({ hasText: "Manager handoff comment" });
  await comment.getByRole("button", { name: "Edit", exact: true }).click();
  await comment.locator("textarea").fill("Updated manager handoff");
  await comment.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(async () => (await tasks.prisma.taskComment.findFirstOrThrow({ where: { taskId: tasks.taskId } })).body).toBe("Updated manager handoff");
  await page.reload();
  await expect(dialog.getByText("Updated manager handoff", { exact: true })).toBeVisible();
  page.once("dialog", (confirmation) => confirmation.accept());
  await dialog.getByRole("article").filter({ hasText: "Updated manager handoff" }).getByRole("button", { name: "Delete", exact: true }).click();
  await expect.poll(() => tasks.prisma.taskComment.count({ where: { taskId: tasks.taskId } })).toBe(0);
});

test("board reflects edited task data after client navigation and moves persist", async ({ page, context, tasks }) => {
  await login(page, tasks.manager);
  await page.goto("/dashboard/tasks/board");
  const editor = await context.newPage();
  await editor.goto(`/dashboard/tasks?edit=${tasks.taskId}`);
  await editor.getByLabel("Task title", { exact: true }).fill("Revised board task");
  await editor.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(editor.getByRole("dialog").getByRole("status")).toHaveText("Task changes saved.");
  await page.getByRole("button", { name: "Task workflow item", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Revised board task", exact: true })).toBeVisible();
  await page.getByRole("dialog").getByRole("link", { name: "Close", exact: true }).click();
  const card = page.getByRole("article").filter({ has: page.getByRole("button", { name: "Revised board task", exact: true }) });
  await expect(card).toBeVisible();
  await card.getByLabel("Move task status").selectOption("REVIEW");
  await expect.poll(async () => (await tasks.prisma.task.findUniqueOrThrow({ where: { id: tasks.taskId } })).status).toBe("REVIEW");
  await page.reload();
  await expect(card.getByLabel("Move task status")).toHaveValue("REVIEW");
});

test("running timers block reassignment and archive with recoverable feedback", async ({ page, tasks }) => {
  const attendance = await tasks.prisma.attendance.create({ data: { organizationId: tasks.organizationId, userId: tasks.employee.id, attendanceDate: new Date("2026-10-31"), checkInAt: new Date() } });
  await tasks.prisma.workSession.createMany({ data: [
    { organizationId: tasks.organizationId, userId: tasks.employee.id, attendanceId: attendance.id, startedAt: new Date() },
    { organizationId: tasks.organizationId, userId: tasks.employee.id, attendanceId: attendance.id, taskId: tasks.taskId, startedAt: new Date() },
  ] });
  await login(page, tasks.manager);
  await page.goto(`/dashboard/tasks?edit=${tasks.taskId}`);
  await page.getByRole("dialog").getByRole("combobox", { name: "Assigned employee", exact: true }).selectOption(tasks.otherEmployee.id);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("status")).toContainText("Pause the running task timer");
  expect((await tasks.prisma.task.findUniqueOrThrow({ where: { id: tasks.taskId } })).assignedToId).toBe(tasks.employee.id);
  await page.goto("/dashboard/tasks");
  const row = page.getByRole("row").filter({ hasText: "Task workflow item" });
  page.once("dialog", (confirmation) => confirmation.accept());
  await row.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(row.getByRole("status")).toContainText("Pause the running task timer");
  await expect(page.getByRole("heading", { name: "Task Management", exact: true })).toBeVisible();
  expect((await tasks.prisma.task.findUniqueOrThrow({ where: { id: tasks.taskId } })).archivedAt).toBeNull();
  await tasks.prisma.workSession.updateMany({ where: { taskId: tasks.taskId, endedAt: null }, data: { endedAt: new Date(), durationMins: 0 } });
  page.once("dialog", (confirmation) => confirmation.accept());
  await row.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(row).toHaveCount(0);
  expect((await tasks.prisma.task.findUniqueOrThrow({ where: { id: tasks.taskId } })).archivedAt).not.toBeNull();
  expect(await tasks.prisma.activityLog.count({ where: { entityId: tasks.taskId, action: "task.archived" } })).toBe(1);
});

test("suspended accounts cannot receive task assignments even with an active membership", async ({ page, tasks }) => {
  await login(page, tasks.manager);
  await page.goto("/dashboard/tasks?create=1");
  const form = page.getByRole("dialog");
  const assignee = form.getByRole("combobox", { name: "Assigned employee", exact: true });
  await expect(assignee.locator(`option[value="${tasks.suspended.id}"]`)).toHaveCount(0);
  await form.getByLabel("Task title", { exact: true }).fill("Invalid suspended assignment");
  await assignee.evaluate((element, id) => { (element as HTMLSelectElement).add(new Option("Forged suspended account", id)); }, tasks.suspended.id);
  await assignee.selectOption(tasks.suspended.id);
  await form.getByRole("button", { name: "Create task", exact: true }).click();
  await expect(form.getByRole("status")).toContainText("active organization member");
  expect(await tasks.prisma.task.count({ where: { organizationId: tasks.organizationId, title: "Invalid suspended assignment" } })).toBe(0);
});

test("team leads cannot move another team's task through a modified board request", async ({ page, tasks }) => {
  await login(page, tasks.lead);
  await page.goto("/dashboard/tasks/board");
  await expect(page.getByRole("button", { name: "Other team private item", exact: true })).toHaveCount(0);
  await page.route("**/dashboard/tasks/board", async (route) => {
    const request = route.request();
    if (request.method() !== "POST" || !request.headers()["next-action"]) return route.continue();
    const args = JSON.parse(request.postData()!);
    expect(args[0].taskId).toBe(tasks.taskId);
    args[0].taskId = tasks.otherTaskId;
    return route.continue({ postData: JSON.stringify(args) });
  });
  await page.getByRole("article").filter({ has: page.getByRole("button", { name: "Task workflow item", exact: true }) }).getByLabel("Move task status").selectOption("REVIEW");
  await expect(page.getByText("You can move tasks only for the team you lead.", { exact: true })).toBeVisible();
  expect((await tasks.prisma.task.findUniqueOrThrow({ where: { id: tasks.taskId } })).status).toBe("TODO");
  expect((await tasks.prisma.task.findUniqueOrThrow({ where: { id: tasks.otherTaskId } })).status).toBe("TODO");
  await page.goto(`/dashboard/tasks?task=${tasks.foreignTaskId}`);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("employees can discuss only assigned tasks and cannot skip workflow transitions", async ({ page, tasks }) => {
  await login(page, tasks.employee);
  await page.goto(`/employee/tasks?task=${tasks.taskId}`);
  const dialog = page.getByRole("dialog");
  const status = dialog.getByLabel("Task status");
  await status.selectOption("BLOCKED");
  await dialog.getByRole("button", { name: "Update", exact: true }).click();
  await expect(dialog.getByText("Task status updated.", { exact: true })).toBeVisible();
  await status.evaluate((element) => (element as HTMLSelectElement).add(new Option("Forged completed", "COMPLETED")));
  await status.selectOption("COMPLETED");
  await dialog.getByRole("button", { name: "Update", exact: true }).click();
  await expect(dialog.getByText(/through the next valid workflow step/)).toBeVisible();
  expect((await tasks.prisma.task.findUniqueOrThrow({ where: { id: tasks.taskId } })).status).toBe("BLOCKED");
  const comment = dialog.locator("form").filter({ has: page.getByRole("button", { name: "Post comment", exact: true }) });
  await comment.locator('input[name="taskId"]').evaluate((element, id) => { (element as HTMLInputElement).value = id; }, tasks.otherTaskId);
  await comment.getByRole("textbox").fill("Unauthorized discussion attempt");
  await comment.getByRole("button", { name: "Post comment", exact: true }).click();
  await expect(comment.getByRole("status")).toHaveText("You do not have access to this task discussion.");
  expect(await tasks.prisma.taskComment.count({ where: { taskId: tasks.otherTaskId } })).toBe(0);
  await page.goto(`/employee/tasks?task=${tasks.otherTaskId}`);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("reassignment changes both employee queues and preserves task history", async ({ page, tasks }) => {
  await login(page, tasks.manager);
  await page.goto(`/dashboard/tasks?edit=${tasks.taskId}`);
  await page.getByRole("dialog").getByRole("combobox", { name: "Assigned employee", exact: true }).selectOption(tasks.otherEmployee.id);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("status")).toHaveText("Task changes saved.");
  expect((await tasks.prisma.task.findUniqueOrThrow({ where: { id: tasks.taskId } })).assignedToId).toBe(tasks.otherEmployee.id);
  expect(await tasks.prisma.notification.count({ where: { userId: tasks.otherEmployee.id, type: "TASK_ASSIGNED", relatedEntityId: tasks.taskId } })).toBe(1);
  await page.context().clearCookies();
  await login(page, tasks.employee);
  await page.goto("/employee/tasks");
  await expect(page.getByRole("link", { name: "Task workflow item", exact: true })).toHaveCount(0);
  await page.context().clearCookies();
  await login(page, tasks.otherEmployee);
  await page.goto(`/employee/tasks?task=${tasks.taskId}`);
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Task workflow item", exact: true })).toBeVisible();
});

test("keyboard board reordering persists after reload", async ({ page, tasks }) => {
  await login(page, tasks.manager);
  await page.goto("/dashboard/tasks/board");
  const handle = page.getByRole("button", { name: "Move Task workflow item", exact: true });
  await handle.focus();
  await handle.press("Space");
  await expect(handle).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("status")).toContainText(`was moved over droppable area ${tasks.taskId}`);
  await handle.press("ArrowDown");
  await expect(page.getByRole("status")).toContainText(`was moved over droppable area ${tasks.otherTaskId}`);
  await handle.press("Space");
  await expect.poll(async () => (await tasks.prisma.task.findUniqueOrThrow({ where: { id: tasks.taskId } })).position).toBe(1);
  await page.reload();
  const column = page.locator("section").filter({ has: page.getByRole("heading", { name: "To do", exact: true }) });
  await expect(column.getByRole("article").first().getByRole("button", { name: "Other team private item", exact: true })).toBeVisible();
});

test("board moves recover from a failed request and block overlapping saves", async ({ page, tasks }) => {
  await login(page, tasks.manager);
  await page.goto("/dashboard/tasks/board");
  const card = page.getByRole("article").filter({ has: page.getByRole("button", { name: "Task workflow item", exact: true }) });
  await page.route("**/dashboard/tasks/board", (route) => route.request().method() === "POST" ? route.abort("failed") : route.continue());
  await card.getByLabel("Move task status").selectOption("REVIEW");
  await expect(page.getByText("Task move failed. Please try again.", { exact: true })).toBeVisible();
  await expect(card.getByLabel("Move task status")).toHaveValue("TODO");
  await page.unroute("**/dashboard/tasks/board");
  let release!: () => void;
  const waitForRelease = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/dashboard/tasks/board", async (route) => {
    if (route.request().method() === "POST") await waitForRelease;
    await route.continue();
  });
  await card.getByLabel("Move task status").selectOption("REVIEW");
  try {
    await expect(page.getByRole("article").filter({ has: page.getByRole("button", { name: "Other team private item", exact: true }) }).getByLabel("Move task status")).toBeDisabled();
  } finally { release(); }
  await expect.poll(async () => (await tasks.prisma.task.findUniqueOrThrow({ where: { id: tasks.taskId } })).status).toBe("REVIEW");
});

test("a stale editor cannot overwrite another manager's saved task changes", async ({ page, context, tasks }) => {
  await login(page, tasks.manager);
  await page.goto(`/dashboard/tasks?edit=${tasks.taskId}`);
  const second = await context.newPage();
  await second.goto(`/dashboard/tasks?edit=${tasks.taskId}`);
  await second.getByLabel("Task title", { exact: true }).fill("Latest manager decision");
  await second.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(second.getByRole("dialog").getByRole("status")).toHaveText("Task changes saved.");
  await page.getByLabel("Description", { exact: true }).fill("An edit based on the outdated task");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("status")).toContainText("changed while you were editing");
  expect((await tasks.prisma.task.findUniqueOrThrow({ where: { id: tasks.taskId } })).title).toBe("Latest manager decision");
});

test("pointer drag moves a task to an empty column and persists the result", async ({ page, tasks }) => {
  await login(page, tasks.manager);
  await page.goto("/dashboard/tasks/board");
  const handle = page.getByRole("button", { name: "Move Task workflow item", exact: true });
  const column = page.locator("section").filter({ has: page.getByRole("heading", { name: "In progress", exact: true }) });
  await column.scrollIntoViewIfNeeded();
  const target = await column.boundingBox();
  const source = await handle.boundingBox();
  expect(source).not.toBeNull();
  expect(target).not.toBeNull();
  await page.mouse.move(source!.x + source!.width / 2, source!.y + source!.height / 2);
  await page.mouse.down();
  await page.mouse.move(source!.x + source!.width / 2, source!.y + source!.height / 2 + 12, { steps: 3 });
  await expect(handle).toHaveAttribute("aria-pressed", "true");
  await page.mouse.move(target!.x + target!.width / 2, target!.y + 120, { steps: 12 });
  await expect(page.getByRole("article").filter({ has: page.getByRole("button", { name: "Task workflow item", exact: true }) }).getByLabel("Move task status")).toHaveValue("IN_PROGRESS");
  await page.mouse.up();
  await expect.poll(async () => (await tasks.prisma.task.findUniqueOrThrow({ where: { id: tasks.taskId } })).status).toBe("IN_PROGRESS");
  await page.reload();
  await expect(column.getByRole("button", { name: "Task workflow item", exact: true })).toBeVisible();
});

test("employees cannot edit another author's task comment", async ({ page, tasks }) => {
  const managerComment = await tasks.prisma.taskComment.create({ data: { taskId: tasks.taskId, authorId: tasks.manager.id, body: "Manager-owned decision" } });
  await login(page, tasks.employee);
  await page.goto(`/employee/tasks?task=${tasks.taskId}`);
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("Add context, ask a question, or record a decision…").fill("Employee response");
  await dialog.getByRole("button", { name: "Post comment", exact: true }).click();
  const ownComment = dialog.getByRole("article").filter({ hasText: "Employee response" });
  await expect(ownComment).toBeVisible();
  await ownComment.getByRole("button", { name: "Edit", exact: true }).click();
  await ownComment.locator('input[name="commentId"]').evaluate((element, id) => { (element as HTMLInputElement).value = id; }, managerComment.id);
  await ownComment.getByRole("textbox").fill("Forged manager decision");
  await ownComment.getByRole("button", { name: "Save", exact: true }).click();
  await expect(ownComment.getByText("You can edit only your own comments.", { exact: true })).toBeVisible();
  expect((await tasks.prisma.taskComment.findUniqueOrThrow({ where: { id: managerComment.id } })).body).toBe("Manager-owned decision");
});

test("timer status changes append tasks to the destination board column", async ({ page, tasks }) => {
  await tasks.prisma.task.update({ where: { id: tasks.otherTaskId }, data: { status: "IN_PROGRESS", position: 0 } });
  await tasks.prisma.task.create({ data: { organizationId: tasks.organizationId, createdById: tasks.manager.id, title: "Previously completed task", status: "COMPLETED", position: 0, completedAt: new Date() } });
  await login(page, tasks.employee);
  await page.goto("/employee/attendance");
  await page.getByRole("button", { name: "Check in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Check out", exact: true })).toBeEnabled();
  await page.goto("/employee/tasks");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect.poll(async () => (await tasks.prisma.task.findUniqueOrThrow({ where: { id: tasks.taskId } })).status).toBe("IN_PROGRESS");
  expect((await tasks.prisma.task.findUniqueOrThrow({ where: { id: tasks.taskId } })).position).toBe(1);
  await page.getByRole("button", { name: "Finish task", exact: true }).click();
  await expect.poll(async () => (await tasks.prisma.task.findUniqueOrThrow({ where: { id: tasks.taskId } })).status).toBe("COMPLETED");
  expect((await tasks.prisma.task.findUniqueOrThrow({ where: { id: tasks.taskId } })).position).toBe(1);
});

test("finishing one task allows starting the next task without a page reload", async ({ page, tasks }) => {
  await tasks.prisma.task.update({ where: { id: tasks.otherTaskId }, data: { assignedToId: tasks.employee.id, teamId: tasks.teamId } });
  await login(page, tasks.employee);
  await page.goto("/employee/attendance");
  await page.getByRole("button", { name: "Check in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Check out", exact: true })).toBeEnabled();
  await page.goto("/employee/tasks");
  await page.getByRole("combobox", { name: "Assigned task", exact: true }).selectOption(tasks.taskId);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("button", { name: "Finish task", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Finish task", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Assigned task", exact: true })).toHaveValue(tasks.otherTaskId);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect.poll(async () => (await tasks.prisma.task.findUniqueOrThrow({ where: { id: tasks.otherTaskId } })).status).toBe("IN_PROGRESS");
});
