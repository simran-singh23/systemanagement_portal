import type { Page, Request } from "@playwright/test";
import { databaseDate, dateKeyInZone, durationMinutes, shiftDateKey } from "../../lib/date-time";
import { expect, login, test } from "./fixtures/tasks";

test.skip(!process.env.TEST_DATABASE_URL, "Set a migrated local TEST_DATABASE_URL for attendance tests.");

const actionPost = (request: Request) => request.method() === "POST" && Boolean(request.headers()["next-action"]);

async function captureAction(page: Page, submit: () => Promise<void>) {
  const [request] = await Promise.all([page.waitForRequest(actionPost), submit()]);
  return request;
}

async function replayAction(page: Page, request: Request) {
  const headers = request.headers();
  const response = await page.request.post(request.url(), {
    headers: { "next-action": headers["next-action"], "content-type": headers["content-type"], origin: new URL(request.url()).origin },
    data: request.postDataBuffer()!,
    maxRedirects: 0,
  });
  return response.text();
}

test("an older workday closes in place and concurrent check-ins create one new session", async ({ page, tasks }) => {
  const { prisma, organizationId, employee } = tasks;
  const userId = employee.id;
  const now = new Date();
  const today = dateKeyInZone(now, "Asia/Kolkata");
  const previous = shiftDateKey(today, -1);
  const startedAt = new Date(now.getTime() - 90 * 60_000);
  await prisma.organizationSettings.update({ where: { organizationId }, data: { workDays: [0, 1, 2, 3, 4, 5, 6] } });
  const attendance = await prisma.attendance.create({ data: { organizationId, userId, attendanceDate: databaseDate(previous), checkInAt: startedAt, status: "PRESENT" } });
  const office = await prisma.workSession.create({ data: { organizationId, userId, attendanceId: attendance.id, startedAt } });
  const activeBreak = await prisma.break.create({ data: {
    organizationId, userId, attendanceId: attendance.id, workSessionId: office.id,
    type: "TEA", startedAt: new Date(now.getTime() - 7 * 60_000),
  } });
  await login(page, employee);
  await page.goto("/employee/attendance");
  await expect(page.getByText(/An earlier workday is still open/)).toBeVisible();
  await expect(page.locator(`time[datetime="${previous}"]`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Check in", exact: true })).toBeDisabled();
  const oldCheckout = await captureAction(page, () => page.getByRole("button", { name: "Check out", exact: true }).click());
  await expect(page.getByRole("status")).toContainText("Checked out.");
  const closed = await prisma.workSession.findUniqueOrThrow({ where: { id: office.id } });
  const endedBreak = await prisma.break.findUniqueOrThrow({ where: { id: activeBreak.id } });
  expect(closed.durationMins).toBe(durationMinutes(startedAt, closed.endedAt));
  expect(endedBreak.endedAt).toEqual(closed.endedAt);
  expect(endedBreak.durationMins).toBe(durationMinutes(endedBreak.startedAt, endedBreak.endedAt));
  expect(await prisma.attendance.findUnique({ where: { id: attendance.id } })).toMatchObject({
    attendanceDate: databaseDate(previous), checkOutAt: closed.endedAt, status: "HALF_DAY",
  });

  let duplicate: Promise<string> | undefined;
  await page.route("**/employee/attendance", async (route) => {
    if (!actionPost(route.request())) return route.continue();
    duplicate = replayAction(page, route.request());
    await route.continue();
  });
  await page.getByRole("button", { name: "Check in", exact: true }).click();
  const status = page.getByRole("status");
  await expect(status).toContainText(/Checked in successfully|Checked in\. Your arrival|You are already checked in\./);
  await page.unrouteAll({ behavior: "wait" });
  const replies = [await status.innerText(), await duplicate!];
  expect(replies.filter((body) => /Checked in successfully|Checked in\. Your arrival/.test(body))).toHaveLength(1);
  expect(replies.filter((body) => body.includes("You are already checked in."))).toHaveLength(1);
  expect(await replayAction(page, oldCheckout)).toContain("That work session is already closed or unavailable.");
  const current = await prisma.workSession.findMany({ where: { organizationId, userId, taskId: null, endedAt: null }, include: { attendance: true } });
  expect(current).toHaveLength(1);
  expect(current[0].attendance.attendanceDate).toEqual(databaseDate(dateKeyInZone(current[0].startedAt, "Asia/Kolkata")));
  expect(await prisma.activityLog.count({ where: { organizationId, actorId: userId, action: "attendance.checked_in" } })).toBe(1);
});

test("repeated task and break cycles show the latest result and reject a stale stop", async ({ page, tasks }) => {
  const { prisma, organizationId, employee, taskId } = tasks;
  const userId = employee.id;
  const startedAt = new Date(Date.now() - 15 * 60_000);
  const attendanceDate = databaseDate(dateKeyInZone(startedAt, "Asia/Kolkata"));
  const attendance = await prisma.attendance.create({ data: { organizationId, userId, attendanceDate, checkInAt: startedAt, status: "PRESENT" } });
  await prisma.workSession.create({ data: { organizationId, userId, attendanceId: attendance.id, startedAt } });
  await prisma.organizationSettings.update({ where: { organizationId }, data: { maxBreakMins: 5 } });
  await login(page, employee);
  await page.goto("/employee/tasks");
  const status = page.getByRole("status");
  const button = (name: string) => page.getByRole("button", { name, exact: true });
  await button("Start").click();
  await expect(status).toHaveText("Task timer started.");
  const oldPause = await captureAction(page, () => button("Pause").click());
  await expect(status).toHaveText("Task timer paused.");
  await button("Resume").click();
  await expect(status).toHaveText("Task timer resumed.");
  expect(await replayAction(page, oldPause)).toContain("The timer state changed in another request.");
  await button("Pause").click();
  await expect(status).toHaveText("Task timer paused.");
  await button("Resume").click();
  await expect(status).toHaveText("Task timer resumed.");
  await button("Finish task").click();
  await expect(status).toHaveText("Task finished and timer stopped.");
  const segments = await prisma.workSession.findMany({ where: { taskId, userId }, orderBy: { startedAt: "asc" } });
  expect(segments).toHaveLength(3);
  for (const [index, segment] of segments.entries()) {
    expect(segment.attendanceId).toBe(attendance.id);
    expect(segment.endedAt!.getTime()).toBeGreaterThanOrEqual(segment.startedAt.getTime());
    expect(segment.durationMins).toBe(durationMinutes(segment.startedAt, segment.endedAt));
    if (index > 0) expect(segment.startedAt.getTime()).toBeGreaterThanOrEqual(segments[index - 1].endedAt!.getTime());
  }

  await page.goto("/employee/attendance");
  await button("Start break").click();
  await expect(status).toHaveText("Lunch started. Any running task was paused.");
  const first = await prisma.break.findFirstOrThrow({ where: { attendanceId: attendance.id, endedAt: null } });
  await prisma.break.update({ where: { id: first.id }, data: { startedAt: new Date(Date.now() - 5 * 60_000 - 10_000) } });
  const oldEnd = await captureAction(page, () => button("End break").click());
  await expect(status).toHaveText("Break ended. It exceeded the 5-minute organization limit.");
  await button("Start break").click();
  await expect(status).toHaveText("Lunch started. Any running task was paused.");
  expect(await replayAction(page, oldEnd)).toContain("The break state changed in another request.");
  expect(await prisma.break.count({ where: { attendanceId: attendance.id, endedAt: null } })).toBe(1);
  await button("End break").click();
  await expect(status).toHaveText("Break ended. Resume a task when you are ready.");
  const breaks = await prisma.break.findMany({ where: { attendanceId: attendance.id } });
  expect(breaks).toHaveLength(2);
  expect(breaks.every((item) => item.endedAt && item.durationMins === durationMinutes(item.startedAt, item.endedAt))).toBe(true);
});

test("holiday work is optional and approved leave blocks a forged check-in", async ({ page, tasks }) => {
  const { prisma, organizationId } = tasks;
  const date = databaseDate(dateKeyInZone(new Date(), "Asia/Kolkata"));
  await prisma.organizationHoliday.create({ data: { organizationId, holidayDate: date, name: "Office holiday" } });
  await prisma.leaveRequest.create({ data: {
    organizationId, userId: tasks.otherEmployee.id, startDate: date, endDate: date, type: "CASUAL",
    status: "APPROVED", reason: "Approved before the holiday was added.", workingDays: 1,
  } });
  await login(page, tasks.manager);
  await page.goto("/dashboard/attendance");
  await expect(page.getByText("Office holiday", { exact: true })).toBeVisible();
  await expect(page.locator("tbody").getByText("Holiday", { exact: true }).first()).toBeVisible();
  await page.context().clearCookies();
  await login(page, tasks.otherEmployee);
  await page.goto("/employee/attendance");
  await expect(page.getByText("You have approved leave for this workday.", { exact: true })).toBeVisible();
  const checkIn = page.getByRole("button", { name: "Check in", exact: true });
  await expect(checkIn).toBeDisabled();
  await checkIn.evaluate((element: HTMLButtonElement) => { element.disabled = false; });
  await checkIn.click();
  await expect(page.getByRole("status")).toContainText("You have approved leave");
  expect(await prisma.attendance.count({ where: { organizationId, userId: tasks.otherEmployee.id } })).toBe(0);

  await page.context().clearCookies();
  await login(page, tasks.employee);
  await page.goto("/employee/attendance");
  await expect(page.getByText("Office holiday · Check-in is optional.", { exact: true })).toBeVisible();
  await checkIn.click();
  await expect(page.getByRole("status")).toContainText("Checked in successfully");
  await page.getByRole("button", { name: "Check out", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Checked out successfully");
  expect(await prisma.attendance.findFirst({ where: { organizationId, userId: tasks.employee.id } })).toMatchObject({ status: "PRESENT", checkOutAt: expect.any(Date) });
});
