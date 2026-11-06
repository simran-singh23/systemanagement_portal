import { dateKeyInZone, shiftDateKey, zonedParts } from "../../lib/date-time";
import { expect, login, test } from "./fixtures/employees";

test.skip(!process.env.TEST_DATABASE_URL, "Set a migrated local TEST_DATABASE_URL for organization policy tests.");

test("office and automation settings retain rejected edits and drive overnight attendance", async ({ page, employees }) => {
  const now = new Date();
  const timezone = Intl.supportedValuesOf("timeZone").find((zone) => {
    const hour = zonedParts(now, zone).hour;
    return hour >= 1 && hour <= 4;
  });
  expect(timezone).toBeDefined();
  await login(page, employees.owner);
  await page.goto("/dashboard/settings");
  const sections = page.getByRole("navigation", { name: "Settings sections" });
  await page.locator('select[name="timezone"]').selectOption(timezone!);
  await sections.getByRole("button", { name: "Office timings", exact: true }).click();
  const start = page.locator('input[name="workdayStart"]');
  const end = page.locator('input[name="workdayEnd"]');
  const save = page.getByRole("button", { name: "Save changes", exact: true });
  await start.fill("22:00");
  await end.fill("06:00");
  await save.click();
  await expect(page.getByText("Enable overnight shifts when office end is on the next day.", { exact: true })).toBeVisible();
  await expect(start).toHaveValue("22:00");
  await expect(end).toHaveValue("06:00");
  await expect(page.getByText("Unsaved policy changes")).toBeVisible();
  expect(await employees.prisma.organizationSettings.findUnique({ where: { organizationId: employees.organizationId } })).toMatchObject({ timezone: "UTC", overnightShiftEnabled: false });

  await page.locator('input[name="overnightShiftEnabled"]').check();
  await page.locator('input[name="checkInCutoffTime"]').fill("22:30");
  await sections.getByRole("button", { name: "Notifications", exact: true }).click();
  const reminder = page.locator('input[name="checkInReminderTime"]');
  await reminder.fill("23:00");
  await save.click();
  await expect(page.getByText(/Set the missing check-in cutoff/)).toBeVisible();
  await reminder.fill("21:30");
  await sections.getByRole("button", { name: "Break policies", exact: true }).click();
  await page.locator('input[name="allowedBreakTypes"][value="LUNCH"]').uncheck();
  await save.click();
  await expect(page.getByText(/Organization policies saved/)).toBeVisible();
  await sections.getByRole("button", { name: "Notifications", exact: true }).click();
  await page.reload();
  await expect(reminder).toHaveValue("21:30");
  expect(await employees.prisma.organizationSettings.findUnique({ where: { organizationId: employees.organizationId } })).toMatchObject({
    timezone, workdayStart: "22:00", workdayEnd: "06:00", overnightShiftEnabled: true, checkInCutoffTime: "22:30", checkInReminderTime: "21:30",
  });
  await page.goto("/dashboard/automations");
  await expect(page.getByText("22:00–06:00", { exact: true })).toBeVisible();
  await expect(page.getByText(timezone!, { exact: true })).toBeVisible();

  const task = await employees.prisma.task.create({ data: {
    organizationId: employees.organizationId,
    teamId: employees.teamId,
    assignedToId: employees.employee.id,
    createdById: employees.owner.id,
    title: "Overnight task work",
  } });
  await page.context().clearCookies();
  await login(page, employees.employee);
  await page.goto("/employee/attendance");
  await page.getByRole("button", { name: "Check in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Check out", exact: true })).toBeEnabled();
  const attendance = await employees.prisma.attendance.findFirstOrThrow({
    where: { organizationId: employees.organizationId, userId: employees.employee.id },
  });
  expect(attendance.status).toBe("LATE");
  const workDate = shiftDateKey(dateKeyInZone(attendance.checkInAt!, timezone!), -1);
  expect(attendance.attendanceDate.toISOString().slice(0, 10)).toBe(workDate);
  await page.goto("/employee/tasks");
  await expect(page.getByLabel("Session history date")).toHaveValue(workDate);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Task timer started.");
  await page.goto("/employee/attendance");
  await expect(page.locator('select[name="type"] option[value="LUNCH"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Start break", exact: true }).click();
  await expect(page.getByRole("button", { name: "End break", exact: true })).toBeVisible();
  expect(await employees.prisma.break.findFirst({ where: { attendanceId: attendance.id } })).toMatchObject({ type: "TEA" });
  expect(await employees.prisma.workSession.findFirst({ where: { taskId: task.id } })).toMatchObject({ attendanceId: attendance.id, endedAt: expect.any(Date) });
});

test("leave forms use saved leave types, notice, past-date and holiday policies", async ({ page, employees }) => {
  const today = dateKeyInZone(new Date(), "UTC");
  const past = shiftDateKey(today, -1);
  const holiday = shiftDateKey(today, 5);
  const nonWorkday = shiftDateKey(today, 2);
  await login(page, employees.owner);
  await page.goto("/dashboard/settings?section=leave");
  await page.locator('input[name="leaveAdvanceNoticeDays"]').fill("2");
  await page.locator('input[name="availableLeaveTypes"][value="SICK"]').uncheck();
  await page.locator('input[name="allowPastDateLeaveRequests"]').check();
  await page.getByRole("navigation", { name: "Settings sections" }).getByRole("button", { name: "Working days", exact: true }).click();
  await page.locator(`input[name="workDays"][value="${new Date(nonWorkday).getUTCDay()}"]`).uncheck();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText(/Organization policies saved/)).toBeVisible();
  await page.goto("/dashboard/settings?section=holidays");
  const date = page.locator('input[name="holidayDate"]');
  await date.fill(holiday);
  await page.route("**/dashboard/settings?section=holidays", async (route) => {
    const request = route.request();
    if (request.method() !== "POST" || !request.headers()["next-action"]) return route.continue();
    const body = request.postData();
    expect(body).toContain(holiday);
    return route.continue({ postData: body!.replace(holiday, "2099-02-30") });
  });
  await page.getByLabel("Holiday name").fill("Invalid date");
  await page.getByRole("button", { name: "Add holiday", exact: true }).click();
  await expect(page.getByText("Enter a future date and a holiday name.", { exact: true })).toBeVisible();
  expect(await employees.prisma.organizationHoliday.count({ where: { organizationId: employees.organizationId } })).toBe(0);
  await page.unrouteAll({ behavior: "wait" });
  await page.reload();
  await date.fill(holiday);
  await page.getByLabel("Holiday name").fill("Policy test holiday");
  await page.getByRole("button", { name: "Add holiday", exact: true }).click();
  await expect(page.getByText("Holiday added.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Policy test holiday", { exact: true })).toBeVisible();
  const expected = page.getByText("Expected", { exact: true }).locator("..");
  await page.goto(`/dashboard/reports?date=${holiday}`);
  await expect(expected).toHaveText("Expected0");
  await page.goto(`/dashboard/reports?date=${shiftDateKey(holiday, 1)}`);
  await expect(expected).not.toHaveText("Expected0");

  await page.context().clearCookies();
  await login(page, employees.employee);
  await page.goto("/employee/leave");
  await page.getByRole("button", { name: "Apply for leave", exact: true }).click();
  const form = page.getByRole("dialog");
  const start = form.locator('input[name="startDate"]');
  const end = form.locator('input[name="endDate"]');
  await expect(start).not.toHaveAttribute("min");
  await expect(form.locator('option[value="SICK"]')).toHaveCount(0);
  for (const [day, message] of [
    [today, "This request does not meet the organization’s minimum advance notice."],
    [nonWorkday, "The selected range contains no configured working days."],
    [holiday, "The selected range contains no configured working days."],
    [past, "Leave request submitted for review."],
  ]) {
    await start.fill(day);
    await end.fill(day);
    await form.locator('textarea[name="reason"]').fill("Verify the saved organization leave policy.");
    const submit = form.getByRole("button", { name: "Submit request", exact: true });
    await Promise.all([
      page.waitForResponse((response) => new URL(response.url()).pathname === "/employee/leave" && response.request().method() === "POST"),
      submit.click(),
    ]);
    await expect(submit).toBeEnabled();
    await expect(form.getByRole("status")).toHaveText(message);
  }
  const request = await employees.prisma.leaveRequest.findFirstOrThrow({ where: { organizationId: employees.organizationId, userId: employees.employee.id } });
  expect(request.startDate.toISOString().slice(0, 10)).toBe(past);
  expect(request.workingDays).toBe(1);
});

test("a saved checkout requirement is enforced by daily report submission", async ({ page, employees }) => {
  await login(page, employees.owner);
  await page.goto("/dashboard/settings?section=reports");
  await page.locator('input[name="allowReportBeforeCheckout"]').uncheck();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText(/Organization policies saved/)).toBeVisible();
  await page.reload();
  await expect(page.locator('input[name="allowReportBeforeCheckout"]')).not.toBeChecked();

  await page.context().clearCookies();
  await login(page, employees.employee);
  await page.goto("/employee/attendance");
  await page.getByRole("button", { name: "Check in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Check out", exact: true })).toBeEnabled();
  await page.goto("/employee/reports");
  await page.getByLabel("Today’s work summary").fill("Report from a workday with a saved checkout requirement.");
  await page.getByRole("button", { name: "Submit daily report", exact: true }).click();
  await expect(page.getByText("Your organization requires checkout before report submission.", { exact: true })).toBeVisible();
  expect(await employees.prisma.dailyReport.count({ where: { organizationId: employees.organizationId } })).toBe(0);
  await page.goto("/employee/attendance");
  await page.getByRole("button", { name: "Check out", exact: true }).click();
  await expect.poll(() => employees.prisma.attendance.count({ where: { organizationId: employees.organizationId, userId: employees.employee.id, checkOutAt: { not: null } } })).toBe(1);
  await page.goto("/employee/reports");
  await page.getByLabel("Today’s work summary").fill("Report after checkout under the saved organization policy.");
  await page.getByRole("button", { name: "Submit daily report", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Submitted report", exact: true })).toBeVisible();
});
