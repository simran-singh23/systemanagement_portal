import type { Locator, Page, Request } from "@playwright/test";
import { databaseDate, dateKeyInZone, shiftDateKey } from "../../lib/date-time";
import { expect, login, test } from "./fixtures/tasks";

test.skip(!process.env.TEST_DATABASE_URL, "Set a migrated local TEST_DATABASE_URL for leave decision tests.");

const day = (offset = 0) => shiftDateKey(dateKeyInZone(new Date(), "Asia/Kolkata"), offset);
const reviewUrl = (id: string) => `/dashboard/leave?request=${id}`;
const button = (page: Page | Locator, name: string) => page.getByRole("button", { name, exact: true });
const isAction = (request: Request) => request.method() === "POST" && Boolean(request.headers()["next-action"]);

async function submitAndCapture(page: Page, control: Locator) {
  const [request] = await Promise.all([page.waitForRequest(isAction), control.click()]);
  return request;
}

async function replay(page: Page, request: Request) {
  const response = await page.request.post(request.url(), {
    headers: { "next-action": request.headers()["next-action"], "content-type": request.headers()["content-type"], origin: new URL(request.url()).origin },
    data: request.postDataBuffer()!,
    maxRedirects: 0,
  });
  return response.text();
}

test("requests reject overlaps and support cancellation and rejection with a saved reviewer note", async ({ page, tasks }) => {
  const { prisma, organizationId, employee, manager } = tasks;
  const date = day(4);
  await login(page, employee);
  await page.goto("/employee/leave");
  await button(page, "Apply for leave").click();
  const dialog = page.getByRole("dialog");
  const submit = async (reason: string) => {
    await dialog.getByLabel("Start date", { exact: true }).fill(date);
    await dialog.getByLabel("End date", { exact: true }).fill(date);
    await dialog.getByLabel("Reason", { exact: true }).fill(reason);
    await button(dialog, "Submit request").click();
  };
  await submit("First request for these dates.");
  await expect(dialog.getByRole("status")).toHaveText("Leave request submitted for review.");
  await submit("Overlapping request for these dates.");
  await expect(dialog.getByRole("status")).toContainText("overlaps another pending or approved leave request");
  const first = await prisma.leaveRequest.findFirstOrThrow({ where: { organizationId } });
  expect(await prisma.leaveRequest.count({ where: { organizationId } })).toBe(1);

  await button(dialog, "Cancel").click();
  page.once("dialog", (confirmation) => confirmation.accept());
  const cancellation = await submitAndCapture(page, button(page, "Cancel request"));
  await expect(page.getByRole("row").filter({ hasText: first.reason })).toContainText("cancelled");
  expect(await replay(page, cancellation)).toContain("Only pending leave requests can be cancelled.");

  await button(page, "Apply for leave").click();
  await submit("Replacement request after cancellation.");
  await expect(dialog.getByRole("status")).toHaveText("Leave request submitted for review.");
  const second = await prisma.leaveRequest.findFirstOrThrow({ where: { organizationId, status: "PENDING" } });

  await page.context().clearCookies();
  await login(page, manager);
  await page.goto(reviewUrl(second.id));
  await dialog.getByRole("textbox", { name: "Decision notes" }).fill("Please choose a date with coverage.");
  const rejection = await submitAndCapture(page, button(dialog, "Reject"));
  await expect(dialog.getByText("Decision recorded")).toBeVisible();
  expect(await replay(page, rejection)).toContain("This request has already been reviewed or cancelled.");
  expect(await prisma.leaveRequest.findUniqueOrThrow({ where: { id: second.id } })).toMatchObject({
    status: "REJECTED", reviewedById: manager.id, reviewNote: "Please choose a date with coverage.", reviewedAt: expect.any(Date),
  });
  expect(await prisma.attendance.count({ where: { organizationId } })).toBe(0);
  expect(await prisma.activityLog.count({ where: { entityId: first.id, action: "leave.cancelled" } })).toBe(1);
  expect(await prisma.activityLog.count({ where: { entityId: second.id, action: "leave.rejected" } })).toBe(1);
  expect(await prisma.notification.count({ where: { userId: employee.id, relatedEntityId: second.id, title: "Leave request rejected" } })).toBe(1);

  await page.context().clearCookies();
  await login(page, employee);
  await page.goto("/employee/leave");
  await expect(page.getByRole("row").filter({ hasText: second.reason })).toContainText("Please choose a date with coverage.");
});

test("team leads can only review employees on teams they lead in the current organization", async ({ page, tasks }) => {
  const { prisma, organizationId, foreignOrganizationId, teamId, lead, employee, otherEmployee } = tasks;
  const date = databaseDate(day(4));
  await prisma.teamMember.delete({ where: { teamId_userId: { teamId, userId: otherEmployee.id } } });
  await prisma.organizationMember.createMany({ data: [
    { organizationId: foreignOrganizationId, userId: lead.id, role: "TEAM_LEAD", status: "ACTIVE" },
    { organizationId: foreignOrganizationId, userId: otherEmployee.id, role: "EMPLOYEE", status: "ACTIVE" },
  ] });
  await prisma.team.create({ data: { organizationId: foreignOrganizationId, name: "Foreign team led by the same lead", managerId: lead.id, members: { create: { userId: otherEmployee.id } } } });
  const base = { organizationId, type: "CASUAL" as const, startDate: date, endDate: date, workingDays: 1 };
  const allowed = await prisma.leaveRequest.create({ data: { ...base, userId: employee.id, reason: "Leave from the lead’s team." } });
  const privateRequest = await prisma.leaveRequest.create({ data: { ...base, userId: otherEmployee.id, reason: "Private leave from another team." } });
  const own = await prisma.leaveRequest.create({ data: { ...base, userId: lead.id, reason: "The lead’s own leave request." } });
  const dialog = page.getByRole("dialog");
  await login(page, lead);
  await page.goto(reviewUrl(privateRequest.id));
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText(privateRequest.reason, { exact: true })).toHaveCount(0);

  await page.goto(reviewUrl(allowed.id));
  const requestId = dialog.locator('input[name="leaveRequestId"]');
  await requestId.evaluate((element, id) => { (element as HTMLInputElement).value = id; }, privateRequest.id);
  await button(dialog, "Approve").click();
  await expect(dialog.getByRole("status")).toContainText("The decision could not be saved.");
  expect((await prisma.leaveRequest.findUniqueOrThrow({ where: { id: privateRequest.id } })).status).toBe("PENDING");

  await page.goto(reviewUrl(own.id));
  const approve = button(dialog, "Approve");
  await expect(approve).toBeDisabled();
  await approve.evaluate((element: HTMLButtonElement) => { element.disabled = false; });
  await approve.click();
  await expect(dialog.getByRole("status")).toHaveText("You cannot review your own leave request.");

  await page.goto(reviewUrl(allowed.id));
  await button(dialog, "Approve").click();
  await expect(dialog.getByText("Decision recorded")).toBeVisible();
  expect((await prisma.leaveRequest.findUniqueOrThrow({ where: { id: allowed.id } })).reviewedById).toBe(lead.id);
  expect(await prisma.attendance.count({ where: { organizationId, userId: employee.id, leaveRequestId: allowed.id, status: "ON_LEAVE" } })).toBe(1);
});

test("overlapping approvals resolve once and a new holiday can invalidate a pending request", async ({ page, browser, baseURL, tasks }) => {
  const { prisma, organizationId, employee, manager, owner } = tasks;
  const firstDate = databaseDate(day(4));
  const holiday = databaseDate(day(6));
  const base = { organizationId, userId: employee.id, type: "CASUAL" as const, workingDays: 1 };
  const first = await prisma.leaveRequest.create({ data: { ...base, startDate: firstDate, endDate: firstDate, reason: "First overlapping leave request." } });
  const second = await prisma.leaveRequest.create({ data: { ...base, startDate: firstDate, endDate: firstDate, reason: "Second overlapping leave request." } });
  const invalid = await prisma.leaveRequest.create({ data: { ...base, startDate: holiday, endDate: holiday, reason: "Pending leave for a newly added holiday." } });
  await prisma.organizationHoliday.create({ data: { organizationId, holidayDate: holiday, name: "New office holiday" } });
  const other = await browser.newPage({ baseURL });
  try {
    await Promise.all([login(page, manager), login(other, owner)]);
    await Promise.all([page.goto(reviewUrl(first.id)), other.goto(reviewUrl(second.id))]);
    const [firstAction, secondAction] = await Promise.all([
      submitAndCapture(page, button(page, "Approve")),
      submitAndCapture(other, button(other, "Approve")),
    ]);
    const outcome = /Decision recorded|This leave conflicts with another approved request/;
    await Promise.all([expect(page.getByRole("dialog").getByText(outcome)).toBeVisible(), expect(other.getByRole("dialog").getByText(outcome)).toBeVisible()]);
    const approved = await prisma.leaveRequest.findMany({ where: { organizationId, status: "APPROVED" } });
    expect(approved).toHaveLength(1);
    const winningAction = approved[0].id === first.id ? firstAction : secondAction;
    const winningPage = approved[0].id === first.id ? page : other;
    expect(await replay(winningPage, winningAction)).toContain("This request has already been reviewed or cancelled.");
    expect(await prisma.attendance.count({ where: { organizationId, status: "ON_LEAVE", leaveRequestId: approved[0].id } })).toBe(1);
    expect(await prisma.activityLog.count({ where: { organizationId, action: "leave.approved" } })).toBe(1);

    await page.goto(reviewUrl(invalid.id));
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name: "Decision notes" }).fill("The holiday was added after submission.");
    await button(dialog, "Approve").click();
    await expect(dialog.getByRole("status")).toHaveText("This request no longer contains any configured working days.");
    await expect(dialog.getByRole("textbox", { name: "Decision notes" })).toHaveValue("The holiday was added after submission.");
    expect((await prisma.leaveRequest.findUniqueOrThrow({ where: { id: invalid.id } })).status).toBe("PENDING");
    await button(dialog, "Reject").click();
    await expect(dialog.getByText("Decision recorded")).toBeVisible();
    await expect(dialog.getByRole("status")).toHaveCount(0);
    expect(await prisma.attendance.count({ where: { organizationId, attendanceDate: holiday } })).toBe(0);

    await prisma.organizationSettings.update({ where: { organizationId }, data: { allowOverlappingLeaveRequests: true } });
    await page.goto(reviewUrl(approved[0].id === first.id ? second.id : first.id));
    await button(dialog, "Approve").click();
    await expect(dialog.getByText("Decision recorded")).toBeVisible();
    expect(await prisma.leaveRequest.count({ where: { organizationId, status: "APPROVED" } })).toBe(2);
    expect(await prisma.attendance.findMany({ where: { organizationId, attendanceDate: firstDate }, select: { leaveRequestId: true } })).toEqual([{ leaveRequestId: approved[0].id }]);
  } finally {
    await other.close();
  }
});

test("a concurrent approval and check-in preserve attendance for the winning order", async ({ page, browser, baseURL, tasks }) => {
  const { prisma, organizationId, employee, manager, otherEmployee } = tasks;
  const attendanceDate = databaseDate(day());
  const base = { organizationId, type: "CASUAL" as const, startDate: attendanceDate, endDate: attendanceDate, workingDays: 1 };
  const request = await prisma.leaveRequest.create({ data: { ...base, userId: employee.id, reason: "Leave reviewed during employee check-in." } });
  const reviewer = await browser.newPage({ baseURL });
  try {
    await Promise.all([login(page, employee), login(reviewer, manager)]);
    await Promise.all([page.goto("/employee/attendance"), reviewer.goto(reviewUrl(request.id))]);
    await Promise.all([button(page, "Check in").click(), button(reviewer, "Approve").click()]);
    await expect(reviewer.getByRole("dialog").getByText("Decision recorded")).toBeVisible();
    await expect(page.getByRole("status")).toContainText(/Checked in|You have approved leave/);

    const reviewed = await prisma.leaveRequest.findUniqueOrThrow({ where: { id: request.id } });
    const records = await prisma.attendance.findMany({ where: { organizationId, userId: employee.id, attendanceDate } });
    const sessions = await prisma.workSession.findMany({ where: { organizationId, userId: employee.id, taskId: null } });
    expect(reviewed.status).toBe("APPROVED");
    expect(records).toHaveLength(1);
    if (reviewed.hasAttendanceConflict) {
      expect(records[0]).toMatchObject({ leaveRequestId: null, checkInAt: expect.any(Date) });
      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toMatchObject({ attendanceId: records[0].id, endedAt: null });
      await expect(reviewer.getByRole("dialog").getByText("Attendance conflict")).toBeVisible();
    } else {
      expect(records[0]).toMatchObject({ status: "ON_LEAVE", leaveRequestId: request.id, checkInAt: null });
      expect(sessions).toHaveLength(0);
    }

    // Exercise the recorded-attendance case even if approval won the race.
    await page.context().clearCookies();
    await login(page, otherEmployee);
    await page.goto("/employee/attendance");
    await button(page, "Check in").click();
    await expect(page.getByRole("status")).toContainText("Checked in");
    const checkedIn = await prisma.attendance.findFirstOrThrow({ where: { organizationId, userId: otherEmployee.id, attendanceDate } });
    const afterCheckIn = await prisma.leaveRequest.create({ data: { ...base, userId: otherEmployee.id, reason: "Leave reviewed after the employee checked in." } });
    await reviewer.goto(reviewUrl(afterCheckIn.id));
    await button(reviewer, "Approve").click();
    await expect(reviewer.getByRole("dialog").getByText("Attendance conflict")).toBeVisible();
    expect(await prisma.attendance.findUniqueOrThrow({ where: { id: checkedIn.id } })).toMatchObject({
      checkInAt: checkedIn.checkInAt, status: checkedIn.status, leaveRequestId: null,
    });
  } finally {
    await reviewer.close();
  }
});
