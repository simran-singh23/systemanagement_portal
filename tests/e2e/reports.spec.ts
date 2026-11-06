import type { Locator, Page, Request } from "@playwright/test";
import { databaseDate, dateKeyInZone, shiftDateKey, zonedDateTimeToUtc, zonedParts } from "../../lib/date-time";
import { expect, login, test } from "./fixtures/tasks";

test.skip(!process.env.TEST_DATABASE_URL, "Set a migrated local TEST_DATABASE_URL for report tests.");

const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const actionPost = (request: Request) => request.method() === "POST" && Boolean(request.headers()["next-action"]);

async function capture(page: Page, control: Locator) {
  const [request] = await Promise.all([page.waitForRequest(actionPost), control.click()]);
  return request;
}

async function replay(page: Page, request: Request, replace?: [string, string]) {
  const body = request.postData()!;
  const response = await page.request.post(request.url(), {
    headers: { "next-action": request.headers()["next-action"], "content-type": request.headers()["content-type"], origin: new URL(request.url()).origin },
    data: replace ? body.replace(...replace) : body,
    maxRedirects: 0,
  });
  return response.text();
}

test("report drafts retain edits, submission locks, and permitted revisions stop after review", async ({ page, tasks }) => {
  const { prisma, organizationId, employee, manager, teamId } = tasks;
  const now = new Date();
  const date = dateKeyInZone(now, "Asia/Kolkata");
  const key = { organizationId, userId: employee.id, reportDate: databaseDate(date) };
  const report = () => prisma.dailyReport.findUniqueOrThrow({ where: { organizationId_userId_reportDate: key }, include: { pulse: true } });
  await login(page, employee);
  await page.goto("/employee/reports");
  const summary = page.getByLabel("Today’s work summary");
  const notes = page.getByLabel("Additional notes", { exact: true });
  const status = page.getByRole("status");
  await summary.fill("Prepared the first report draft for review.");
  await notes.fill("Remove this note before submitting.");
  await button(page, "Submit daily report").click();
  await expect(status).toHaveText("A verified attendance record is required before submission.");
  await expect(summary).toHaveValue("Prepared the first report draft for review.");

  const draft = await capture(page, button(page, "Save draft"));
  await expect(status).toHaveText("Draft saved.");
  expect(await report()).toMatchObject({ status: "DRAFT", additionalNotes: "Remove this note before submitting.", pulse: { mood: "NORMAL" } });
  await page.reload();
  await expect(notes).toHaveValue("Remove this note before submitting.");
  await page.getByText("Progress was constrained", { exact: true }).click();
  const blocker = page.getByLabel("Work blocker description");
  await blocker.fill("   ");
  await button(page, "Save draft").click();
  await expect(page.getByText("Describe the work blocker when pulse is blocked.", { exact: true })).toBeVisible();
  await expect(summary).toHaveValue("Prepared the first report draft for review.");
  expect((await report()).pulse?.mood).toBe("NORMAL");

  await blocker.fill("Waiting for access to the test service.");
  await notes.fill("");
  await summary.fill("Completed the report and recorded the access blocker.");
  await button(page, "Save draft").click();
  await expect(status).toHaveText("Draft saved.");
  expect(await report()).toMatchObject({ additionalNotes: null, pulse: { mood: "BLOCKED", note: "Waiting for access to the test service.", teamId } });
  await expect(page.getByRole("radio", { name: /^Blocked/ })).toBeChecked();
  await prisma.attendance.create({ data: { organizationId, userId: employee.id, attendanceDate: key.reportDate, checkInAt: new Date(now.getTime() - 60 * 60_000), checkOutAt: now, status: "PRESENT" } });
  const submission = await capture(page, button(page, "Submit daily report"));
  await expect(page.getByRole("heading", { name: "Submitted report" })).toBeVisible();
  const submitted = await report();
  expect(submitted).toMatchObject({ status: "SUBMITTED", submittedAt: expect.any(Date), pulse: { mood: "BLOCKED" } });
  expect(await replay(page, draft)).toContain("This report is already submitted and read-only.");

  await prisma.organizationSettings.update({ where: { organizationId }, data: { allowReportEditingAfterSubmission: true } });
  await prisma.teamMember.delete({ where: { teamId_userId: { teamId, userId: employee.id } } });
  await prisma.teamMember.create({ data: { teamId: tasks.otherTeamId, userId: employee.id } });
  await page.reload();
  expect(await replay(page, submission)).toContain("Save a revision to make changes.");
  await summary.fill("Revised the report after the service became available.");
  await page.getByText("No major blockers", { exact: true }).click();
  const revision = await capture(page, button(page, "Save revision"));
  await expect(status).toHaveText("Submitted report revised.");
  expect(await report()).toMatchObject({ submittedAt: submitted.submittedAt, status: "SUBMITTED", pulse: { id: submitted.pulse!.id, teamId, mood: "SMOOTH", note: null } });
  expect(await prisma.notification.count({ where: { relatedEntityId: submitted.id, userId: manager.id, type: "REPORT_SUBMITTED", title: "Report requires attention" } })).toBe(1);

  await page.context().clearCookies();
  await login(page, manager);
  await page.goto(`/dashboard/reports/${submitted.id}`);
  await page.route("**/dashboard/reports/*", async (route) => {
    if (!actionPost(route.request())) return route.continue();
    const currentVersion = (await report()).updatedAt.toISOString();
    await route.continue({ postData: route.request().postData()!.replace(currentVersion, submitted.updatedAt.toISOString()) });
  });
  await button(page, "Mark as reviewed").click();
  await expect(status).toContainText("The report changed.");
  await page.unrouteAll({ behavior: "wait" });
  const review = await capture(page, button(page, "Mark as reviewed"));
  await expect(page.getByText("Reviewed by Task manager.", { exact: true })).toBeVisible();
  expect(await replay(page, review)).toContain("This report has already been reviewed.");
  expect(await report()).toMatchObject({ status: "REVIEWED", reviewedById: manager.id, reviewedAt: expect.any(Date), submittedAt: submitted.submittedAt });
  expect(await prisma.notification.count({ where: { relatedEntityId: submitted.id, userId: employee.id, type: "REPORT_REVIEWED" } })).toBe(1);
  expect(await prisma.activityLog.count({ where: { entityId: submitted.id, action: "daily_report.reviewed" } })).toBe(1);

  await page.context().clearCookies();
  await login(page, employee);
  await page.goto(`/employee/reports?date=${date}`);
  await expect(page.getByRole("heading", { name: "Reviewed report" })).toBeVisible();
  expect(await replay(page, revision)).toContain("This report is already submitted and read-only.");
  expect((await report()).summary).toBe("Revised the report after the service became available.");
});

test("overnight reports use the attendance workday and keep exact time and completion evidence", async ({ page, tasks }) => {
  const { prisma, organizationId, employee, manager, taskId, teamId } = tasks;
  const now = new Date();
  const timezone = Intl.supportedValuesOf("timeZone").find((zone) => {
    const hour = zonedParts(now, zone).hour;
    return hour >= 2 && hour <= 4;
  })!;
  const calendarDate = dateKeyInZone(now, timezone);
  const workday = shiftDateKey(calendarDate, -1);
  const at = (clock: string, nextDay = false) => zonedDateTimeToUtc(nextDay ? calendarDate : workday, clock, timezone);
  await prisma.organizationSettings.update({ where: { organizationId }, data: { timezone, overnightShiftEnabled: true, workdayStart: "22:00", workdayEnd: "06:00" } });
  const owner = { organizationId, userId: employee.id };
  const attendance = await prisma.attendance.create({ data: { ...owner, attendanceDate: databaseDate(workday), status: "PRESENT", checkInAt: at("22:00"), checkOutAt: at("02:00", true) } });
  const office = await prisma.workSession.create({ data: { ...owner, attendanceId: attendance.id, startedAt: at("22:00"), endedAt: at("02:00", true) } });
  await prisma.break.create({ data: { ...owner, attendanceId: attendance.id, workSessionId: office.id, type: "TEA", startedAt: at("23:50"), endedAt: at("00:10", true) } });
  await prisma.task.update({ where: { id: taskId }, data: { status: "COMPLETED", completedAt: at("01:00", true) } });
  await prisma.workSession.create({ data: { ...owner, attendanceId: attendance.id, taskId, startedAt: at("00:15", true), endedAt: at("01:00", true) } });
  const older = await prisma.task.create({ data: { organizationId, teamId, assignedToId: employee.id, createdById: manager.id, title: "Previous workday completion", status: "COMPLETED", completedAt: at("04:00") } });
  const note = "Verified the totals for work that crossed midnight.";
  await login(page, employee);
  await page.goto("/employee/reports");
  await expect(page.getByLabel("Report workday")).toHaveValue(workday);
  await expect(page.getByText("Task workflow item", { exact: true })).toBeVisible();
  await expect(page.getByText("0h 45m tracked", { exact: true })).toBeVisible();
  await expect(page.getByText("3h 40m", { exact: true })).toBeVisible();
  await expect(page.getByText(older.title, { exact: true })).toHaveCount(0);
  await page.getByLabel("Today’s work summary").fill(note);
  await button(page, "Submit daily report").click();
  await expect(page.getByRole("heading", { name: "Submitted report" })).toBeVisible();
  const report = await prisma.dailyReport.findFirstOrThrow({ where: owner, include: { tasks: true } });
  expect(report).toMatchObject({ reportDate: databaseDate(workday), attendanceId: attendance.id, snapshot: {
    provisional: false, hours: { officeMs: 240 * 60_000, breakMs: 20 * 60_000, netMs: 220 * 60_000, taskMs: 45 * 60_000, unallocatedMs: 175 * 60_000 },
  } });
  expect(report.tasks).toMatchObject([{ taskId, minutesSpent: 45, completedToday: true }]);

  await page.context().clearCookies();
  await login(page, manager);
  await page.goto("/dashboard/reports");
  await expect(page.getByLabel("Overview date")).toHaveValue(workday);
  await page.getByRole("link", { name: "Task employee", exact: true }).click();
  await expect(page.getByText(note, { exact: true })).toBeVisible();
  await expect(page.getByText("completed · 45m tracked", { exact: true })).toBeVisible();
});

test("manager counts use eligible employees and team leads cannot access or review another team's report", async ({ page, tasks }) => {
  const { prisma, organizationId, foreignOrganizationId, employee, otherEmployee, lead, manager, teamId } = tasks;
  const date = dateKeyInZone(new Date(), "Asia/Kolkata");
  const reportDate = databaseDate(date);
  await prisma.organizationSettings.update({ where: { organizationId }, data: { requireDailyReports: true } });
  await prisma.teamMember.delete({ where: { teamId_userId: { teamId, userId: otherEmployee.id } } });
  await prisma.team.create({ data: { organizationId: foreignOrganizationId, name: "Cross-organization managed team", managerId: lead.id, members: { create: { userId: otherEmployee.id } } } });
  await prisma.leaveRequest.create({ data: { organizationId, userId: otherEmployee.id, type: "CASUAL", status: "APPROVED", reason: "Leave for the selected workday.", startDate: reportDate, endDate: reportDate, workingDays: 1 } });
  const allowed = await prisma.dailyReport.create({ data: { organizationId, userId: employee.id, reportDate, summary: "Visible report for the lead’s team." } });
  const hidden = await prisma.dailyReport.create({ data: { organizationId, userId: otherEmployee.id, reportDate, status: "SUBMITTED", submittedAt: new Date(), summary: "Private report for the other team." } });
  await login(page, manager);
  await page.goto(`/dashboard/reports?date=${date}`);
  const metric = (label: string) => page.getByText(label, { exact: true }).locator("..");
  await expect(metric("Expected")).toContainText("2");
  await expect(metric("Missing")).toContainText("2");
  await expect(metric("Drafts")).toContainText("1");
  await expect(page.getByRole("link", { name: "Other employee", exact: true })).toBeVisible();
  const holiday = databaseDate(shiftDateKey(date, -1));
  await prisma.organizationHoliday.create({ data: { organizationId, holidayDate: holiday, name: "Report holiday" } });
  await page.goto(`/dashboard/reports?date=${holiday.toISOString().slice(0, 10)}`);
  await expect(metric("Expected")).toContainText("0");
  await expect(metric("Missing")).toContainText("0");

  await prisma.dailyReport.update({ where: { id: allowed.id }, data: { status: "SUBMITTED", submittedAt: new Date() } });
  await page.context().clearCookies();
  await login(page, lead);
  await page.goto(`/dashboard/reports?date=${date}`);
  await expect(metric("Missing")).toContainText("1");
  await expect(page.getByRole("link", { name: "Other employee", exact: true })).toHaveCount(0);
  await page.goto(`/dashboard/reports/${hidden.id}`);
  await expect(page.getByRole("heading", { name: "This page could not be found." })).toBeVisible();
  await expect(page.getByText(hidden.summary, { exact: true })).toHaveCount(0);
  await page.goto(`/dashboard/reports/${allowed.id}`);
  await page.route("**/dashboard/reports/*", async (route) => {
    if (!actionPost(route.request())) return route.continue();
    await route.continue({ postData: route.request().postData()!.replace(allowed.id, hidden.id) });
  });
  await button(page, "Mark as reviewed").click();
  await expect(page.getByRole("status")).toHaveText("The report could not be verified.");
  await page.unrouteAll({ behavior: "wait" });
  expect((await prisma.dailyReport.findUniqueOrThrow({ where: { id: hidden.id } })).status).toBe("SUBMITTED");
  await button(page, "Mark as reviewed").click();
  await expect(page.getByText("Reviewed by Task lead.", { exact: true })).toBeVisible();
});
