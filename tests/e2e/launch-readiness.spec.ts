import AxeBuilder from "@axe-core/playwright";
import { databaseDate, dateKeyInZone, shiftDateKey } from "../../lib/date-time";
import { expect, login, test } from "./fixtures/tasks";

test.skip(!process.env.TEST_DATABASE_URL, "Set a migrated local TEST_DATABASE_URL for launch checks.");

for (const width of [390, 1440]) {
  test(`employee and manager core screens are usable at ${width}px`, async ({ page, tasks }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    const accessibilityIssues: unknown[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const actors = [
      { user: tasks.employee, paths: ["/employee", "/employee/tasks", "/employee/attendance", "/employee/reports", "/employee/leave", "/employee/analytics", "/notifications"] },
      { user: tasks.manager, paths: ["/dashboard", "/dashboard/tasks", "/dashboard/tasks/board", "/dashboard/attendance", "/dashboard/reports", "/dashboard/teams", "/dashboard/employees", "/dashboard/leave", "/dashboard/time-tracking", "/dashboard/analytics"] },
    ];
    for (const { user, paths } of actors) {
      await page.context().clearCookies();
      await login(page, user);
      for (const path of paths) {
        await page.goto(path);
        const main = page.locator("#main-content");
        await expect(main).toBeVisible();
        await expect(main.getByRole("heading", { level: 1 }).first()).toBeVisible();
        await expect(main.getByText("Something went wrong", { exact: true })).toHaveCount(0);
        if (path === "/dashboard/attendance") await expect(main.getByText("Suspended employee", { exact: true })).toHaveCount(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), path).toBe(true);
        const findings = await new AxeBuilder({ page }).include("#main-content").withTags(["wcag2a", "wcag2aa"]).analyze();
        const blockers = findings.violations.filter((item) => item.impact === "critical" || item.impact === "serious");
        accessibilityIssues.push(...blockers.map((item) => ({ path, id: item.id, elements: item.nodes.map((node) => node.target) })));
        if (width === 390 && (path === "/employee/tasks" || path === "/dashboard/attendance")) {
          const menu = page.getByRole("button", { name: "Open navigation", exact: true });
          await menu.click();
          await expect(page.getByRole("dialog", { name: "Primary navigation" })).toBeVisible();
          await page.keyboard.press("Escape");
          await expect(page.getByRole("dialog", { name: "Primary navigation" })).toHaveCount(0);
          await expect(menu).toBeFocused();
        }
        if (path === "/employee/tasks" || path === "/dashboard/attendance") {
          await page.screenshot({ path: testInfo.outputPath(`${path.replaceAll("/", "-")}-${width}.png`), fullPage: true });
        }
      }
    }
    expect(errors).toEqual([]);
    expect(accessibilityIssues).toEqual([]);
  });
}

test("analytics tables and CSV match known work sessions and reject forged scopes", async ({ page, tasks }) => {
  const { prisma, organizationId, employee, manager, lead } = tasks;
  const date = shiftDateKey(dateKeyInZone(new Date(), "Asia/Kolkata"), -2);
  const start = new Date(`${date}T04:00:00Z`);
  const end = new Date(start.getTime() + 8 * 3_600_000);
  const owner = { organizationId, userId: employee.id };
  const attendance = await prisma.attendance.create({ data: { ...owner, attendanceDate: databaseDate(date), checkInAt: start, checkOutAt: end, status: "PRESENT" } });
  const office = await prisma.workSession.create({ data: { ...owner, attendanceId: attendance.id, startedAt: start, endedAt: end, durationMins: 480 } });
  await prisma.break.create({ data: { ...owner, attendanceId: attendance.id, workSessionId: office.id, type: "LUNCH", startedAt: new Date(start.getTime() + 3 * 3_600_000), endedAt: new Date(start.getTime() + 3.5 * 3_600_000), durationMins: 30 } });
  await prisma.workSession.create({ data: { ...owner, attendanceId: attendance.id, taskId: tasks.taskId, startedAt: start, endedAt: new Date(start.getTime() + 2 * 3_600_000), durationMins: 120 } });
  await prisma.dailyReport.create({ data: { ...owner, attendanceId: attendance.id, reportDate: databaseDate(date), summary: "Known analytics fixture report.", status: "SUBMITTED", submittedAt: end } });
  const range = new URLSearchParams({ preset: "custom", start: date, end: date });
  const csv = async (dataset: string, extra = "") => {
    const response = await page.request.get(`/api/analytics/export?dataset=${dataset}&${range}${extra}`);
    expect(response.ok()).toBe(true);
    expect(response.headers()["cache-control"]).toContain("no-store");
    return response.text();
  };
  await login(page, manager);
  await page.goto(`/dashboard/analytics?${range}`);
  await page.getByRole("button", { name: "hours", exact: true }).click();
  const row = page.getByRole("row").filter({ hasText: "Task employee" });
  await expect(row).toContainText("8.0h");
  await expect(row).toContainText("7.5h");
  await expect(row).toContainText("2.0h");
  await expect(row).toContainText("5.5h");
  const hours = await csv("hours");
  expect(hours).toContain('"8","7.5","2","5.5"');
  expect(hours).not.toContain("Foreign employee");
  expect(hours).not.toContain("Suspended employee");
  const attendanceCsv = await csv("attendance");
  expect(attendanceCsv).toContain('"Task employee","Delivery team","Unassigned","1","1","0","0","0"');
  const reports = await csv("reports");
  expect(reports).toContain('"Task employee","Delivery team","Unassigned","1","1","0","0"');
  await page.getByRole("textbox", { name: "Search summary rows" }).fill("Other employee");
  const filtered = await page.request.get((await page.getByRole("link", { name: "CSV", exact: true }).getAttribute("href"))!);
  expect(await filtered.text()).not.toContain("Task employee");
  expect(await filtered.text()).toContain("Other employee");
  await prisma.user.update({ where: { id: employee.id }, data: { name: ' =SUM(1,2) "quoted"' } });
  expect(await csv("hours")).toContain('"\' =SUM(1,2) ""quoted"""');
  expect((await page.request.get(`/api/analytics/export?dataset=hours&${range}&team=${tasks.foreignOrganizationId}`)).status()).toBe(403);
  expect((await page.request.get("/api/analytics/export?dataset=hours&preset=custom&start=2026-02-30&end=2026-03-01")).status()).toBe(400);

  await page.context().clearCookies();
  await login(page, lead);
  expect((await page.request.get(`/api/analytics/export?dataset=hours&${range}&team=${tasks.otherTeamId}`)).status()).toBe(403);
  await page.context().clearCookies();
  await login(page, employee);
  expect(await csv("hours", "&personal=0")).not.toContain("Other employee");
  expect((await page.request.get(`/api/analytics/export?dataset=hours&${range}&employee=${tasks.otherEmployee.id}`)).status()).toBe(403);
});

test("search links open authorized tasks and notification filters refresh the current inbox", async ({ page, tasks }) => {
  const { prisma, organizationId, employee, manager, taskId } = tasks;
  const notification = await prisma.notification.create({ data: { organizationId, userId: employee.id, type: "TASK_ASSIGNED", title: "Launch task update", link: `/employee/tasks?task=${taskId}`, eventId: "launch-task" } });
  const read = await prisma.notification.create({ data: { organizationId, userId: employee.id, type: "SYSTEM", title: "Already read launch notice", readAt: new Date(), eventId: "launch-read" } });
  const privateNotice = await prisma.notification.create({ data: { organizationId, userId: tasks.otherEmployee.id, type: "SYSTEM", title: "Another employee private notice", eventId: "launch-private" } });
  await login(page, employee);
  const search = await page.request.get("/api/search?q=Task");
  expect(search.ok()).toBe(true);
  const results = await search.json();
  expect(JSON.stringify(results)).not.toContain(tasks.otherTaskId);
  expect(JSON.stringify(results)).not.toContain(tasks.foreignTaskId);
  await page.goto("/notifications");
  await expect(page.getByRole("button", { name: /Launch task update/ })).toBeVisible();
  await page.getByLabel("Read status").selectOption("READ");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByRole("button", { name: /Already read launch notice/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Launch task update/ })).toHaveCount(0);
  await page.goto("/notifications?read=UNREAD");
  const [markRead] = await Promise.all([
    page.waitForRequest((request) => request.method() === "POST" && Boolean(request.headers()["next-action"])),
    page.getByRole("button", { name: /Launch task update/ }).click(),
  ]);
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect.poll(async () => Boolean((await prisma.notification.findUniqueOrThrow({ where: { id: notification.id } })).readAt)).toBe(true);
  await page.goto("/notifications?read=UNREAD");
  await expect(page.getByRole("button", { name: /Launch task update/ })).toHaveCount(0);
  expect((await prisma.notification.findUniqueOrThrow({ where: { id: read.id } })).readAt).not.toBeNull();
  const summary = await page.request.get("/api/notifications/summary");
  expect((await summary.json()).unreadCount).toBe(0);
  const forged = await page.request.post(markRead.url(), {
    headers: { "next-action": markRead.headers()["next-action"], "content-type": markRead.headers()["content-type"], origin: new URL(markRead.url()).origin },
    data: markRead.postData()!.replace(notification.id, privateNotice.id),
  });
  expect(await forged.text()).toContain("This notification is unavailable.");
  expect((await prisma.notification.findUniqueOrThrow({ where: { id: privateNotice.id } })).readAt).toBeNull();
  await prisma.notification.createMany({ data: Array.from({ length: 14 }, (_, index) => ({ organizationId, userId: employee.id, type: "SYSTEM", title: `Launch batch ${index}`, eventId: `launch-batch:${index}` })) });
  await page.goto("/notifications?q=Launch+batch");
  await expect(page.locator("main").getByRole("button", { name: /Launch batch/ })).toHaveCount(12);
  await page.getByRole("link", { name: "Next", exact: true }).click();
  await expect(page.locator("main").getByRole("button", { name: /Launch batch/ })).toHaveCount(2);
  await page.getByRole("button", { name: "Mark all as read", exact: true }).click();
  await expect(page.getByText("Everything is read", { exact: true })).toBeVisible();
  expect((await (await page.request.get("/api/notifications/summary")).json()).unreadCount).toBe(0);
  await page.goto("/dashboard/employees");
  await expect(page).toHaveURL(/\/employee$/);

  await page.context().clearCookies();
  await login(page, manager);
  await page.getByRole("button", { name: "Open global search", exact: true }).click();
  await page.getByRole("textbox", { name: "Search TeamFlow" }).fill("Task workflow item");
  await page.getByRole("option", { name: /Task workflow item/ }).click();
  await expect(page).toHaveURL(new RegExp(`/dashboard/tasks\\?task=${taskId}`));
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("analytics pagination, sorting and empty filters agree with the export", async ({ page, tasks }) => {
  const { prisma, organizationId } = tasks;
  const created = await prisma.user.createManyAndReturn({ data: Array.from({ length: 9 }, (_, index) => ({
    name: `Launch export person ${index}`, email: `launch-export-${organizationId}-${index}@teamflow.test`, role: "EMPLOYEE", status: "ACTIVE",
  })), select: { id: true } });
  try {
    await prisma.organizationMember.createMany({ data: created.map((user) => ({ organizationId, userId: user.id, role: "EMPLOYEE", status: "ACTIVE" })) });
    await login(page, tasks.manager);
    await page.goto("/dashboard/analytics?preset=today");
    await expect(page.locator("tbody tr")).toHaveCount(8);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.locator("tbody tr")).toHaveCount(4);
    await page.getByRole("button", { name: "Previous", exact: true }).click();
    await page.getByRole("button", { name: "Employee ↑", exact: true }).click();
    const firstEmployee = await page.locator("tbody tr").first().locator("td").first().innerText();
    const exportUrl = (await page.getByRole("link", { name: "CSV", exact: true }).getAttribute("href"))!;
    const exported = await page.request.get(exportUrl);
    const lines = (await exported.text()).split("\r\n");
    expect(lines).toHaveLength(13);
    expect(lines[1]).toContain(firstEmployee);
    await page.getByRole("textbox", { name: "Search summary rows" }).fill("No matching launch employee");
    await expect(page.getByText("No matching summary rows.", { exact: true })).toBeVisible();
    const empty = await page.request.get((await page.getByRole("link", { name: "CSV", exact: true }).getAttribute("href"))!);
    expect((await empty.text()).split("\r\n")).toHaveLength(1);
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: created.map((user) => user.id) } } });
  }
});
