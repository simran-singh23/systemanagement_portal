import "server-only";

import type { AutomationStatus, AutomationType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { databaseDate, zonedDateTimeToUtc } from "@/lib/date-time";
import { createNotifications } from "@/lib/notifications";
import { localHourBucket, reportingScheduleContext, scheduleContext, validClock, validTimeZone, workdayRangeUtc, type AutomationName, type AutomationPayload } from "@/lib/automation-schedule";
import { workingSummary } from "@/lib/work-time";

type Settings = NonNullable<Awaited<ReturnType<typeof prisma.organizationSettings.findUnique>>>;
type AutomationResult = { status: AutomationStatus; notificationsCreated: number; metadata?: Prisma.InputJsonValue };

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown automation failure";
  return message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[database-url-redacted]").slice(0, 500);
}

function runKey(organizationId: string, automation: AutomationName, scope: string) { return `${organizationId}:${automation}:${scope}`; }

export async function buildDueAutomationEvents(now = new Date()) {
  const settingsRows = await prisma.organizationSettings.findMany();
  const events: AutomationPayload[] = [];
  const configurationErrors: { organizationId: string; field: string }[] = [];
  for (const settings of settingsRows) {
    if (!validTimeZone(settings.timezone)) { configurationErrors.push({ organizationId: settings.organizationId, field: "timezone" }); continue; }
    const fixed: { automation: AutomationName; enabled: boolean; clock: string }[] = [
      { automation: "CHECK_IN_REMINDER", enabled: settings.enableCheckInReminders, clock: settings.checkInReminderTime },
      { automation: "MISSING_CHECK_IN", enabled: settings.enableMissingCheckInAlerts, clock: settings.checkInCutoffTime },
      { automation: "LUNCH_REMINDER", enabled: settings.enableLunchReminders, clock: settings.lunchReminderTime },
      { automation: "DAILY_REPORT_REMINDER", enabled: settings.enableDailyReportReminders && settings.requireDailyReports, clock: settings.dailyReportReminderTime },
      { automation: "MISSING_DAILY_REPORT", enabled: settings.enableMissingReportAlerts && settings.requireDailyReports, clock: settings.dailyReportDueTime },
      { automation: "DAILY_TEAM_SUMMARY", enabled: settings.enableDailyTeamSummary, clock: settings.managerSummaryTime },
      { automation: "DAILY_EMAIL_REPORT", enabled: settings.dailyEmailEnabled, clock: settings.dailyEmailTime },
    ];
    for (const item of fixed) {
      if (!item.enabled) continue;
      if (!validClock(item.clock) || !validClock(settings.workdayStart) || !validClock(settings.workdayEnd)) { configurationErrors.push({ organizationId: settings.organizationId, field: item.automation }); continue; }
      const context = ["DAILY_REPORT_REMINDER", "MISSING_DAILY_REPORT", "DAILY_TEAM_SUMMARY", "DAILY_EMAIL_REPORT"].includes(item.automation)
        ? reportingScheduleContext(now, settings.timezone, item.clock, settings.workdayStart, settings.workdayEnd)
        : scheduleContext(now, settings.timezone, item.clock, settings.workdayStart, settings.workdayEnd);
      if (!context.due) continue;
      events.push({ organizationId: settings.organizationId, automation: item.automation, workDate: context.workDate, scheduledFor: context.scheduledFor.toISOString(), runKey: runKey(settings.organizationId, item.automation, context.workDate) });
    }
    if (settings.enableTaskDeadlineReminders) {
      const bucket = localHourBucket(now, settings.timezone);
      events.push({ organizationId: settings.organizationId, automation: "TASK_DEADLINE", workDate: bucket.date, scheduledFor: zonedDateTimeToUtc(bucket.date, `${String(bucket.hour).padStart(2, "0")}:00`, settings.timezone).toISOString(), runKey: runKey(settings.organizationId, "TASK_DEADLINE", bucket.key) });
    }
  }
  const keys = events.map((event) => event.runKey);
  const completed = keys.length ? await prisma.automationExecution.findMany({ where: { runKey: { in: keys }, status: { in: ["SUCCESS", "SKIPPED"] } }, select: { runKey: true } }) : [];
  const completedKeys = new Set(completed.map((item) => item.runKey));
  return { events: events.filter((event) => !completedKeys.has(event.runKey)), configurationErrors };
}

async function expectedUsers(tx: Prisma.TransactionClient, organizationId: string, workDate: string, settings: Settings) {
  const date = databaseDate(workDate);
  if (!settings.workDays.includes(date.getUTCDay())) return { eligible: false, reason: "non_working_day", userIds: [] as string[], leaveIds: [] as string[] };
  const [holiday, members] = await Promise.all([
    tx.organizationHoliday.findUnique({ where: { organizationId_holidayDate: { organizationId, holidayDate: date } }, select: { id: true } }),
    tx.organizationMember.findMany({ where: { organizationId, status: "ACTIVE", user: { status: "ACTIVE" }, role: { in: ["TEAM_LEAD", "EMPLOYEE"] } }, select: { userId: true } }),
  ]);
  const memberIds = members.map((item) => item.userId);
  const leaves = memberIds.length ? await tx.leaveRequest.findMany({ where: { organizationId, userId: { in: memberIds }, status: "APPROVED", startDate: { lte: date }, endDate: { gte: date } }, select: { userId: true } }) : [];
  if (holiday) return { eligible: false, reason: "organization_holiday", userIds: [] as string[], leaveIds: leaves.map((item) => item.userId) };
  const leaveIds = leaves.map((item) => item.userId);
  const leaveSet = new Set(leaveIds);
  return { eligible: true, reason: null, userIds: members.map((item) => item.userId).filter((id) => !leaveSet.has(id)), leaveIds };
}

async function reviewerIdsForUsers(tx: Prisma.TransactionClient, organizationId: string, userIds: readonly string[]) {
  const [organization, managers, teamManagers] = await Promise.all([
    tx.organization.findUnique({ where: { id: organizationId }, select: { ownerId: true } }),
    tx.organizationMember.findMany({ where: { organizationId, status: "ACTIVE", role: { in: ["SUPER_ADMIN", "PRODUCT_MANAGER"] } }, select: { userId: true } }),
    tx.teamMember.findMany({ where: { userId: { in: [...userIds] }, team: { organizationId, managerId: { not: null } } }, select: { team: { select: { managerId: true } } } }),
  ]);
  return [...new Set([organization?.ownerId, ...managers.map((item) => item.userId), ...teamManagers.map((item) => item.team.managerId)].filter((id): id is string => Boolean(id) && !userIds.includes(id!)))];
}

async function checkInAutomation(payload: AutomationPayload, missing: boolean): Promise<AutomationResult> {
  return prisma.$transaction(async (tx) => {
    const settings = await tx.organizationSettings.findUnique({ where: { organizationId: payload.organizationId } });
    if (!settings || (missing ? !settings.enableMissingCheckInAlerts : !settings.enableCheckInReminders)) return { status: "SKIPPED", notificationsCreated: 0, metadata: { reason: "disabled" } };
    const expected = await expectedUsers(tx, payload.organizationId, payload.workDate, settings);
    if (!expected.eligible) return { status: "SKIPPED", notificationsCreated: 0, metadata: { reason: expected.reason } };
    const checkedIn = await tx.attendance.findMany({ where: { organizationId: payload.organizationId, attendanceDate: databaseDate(payload.workDate), userId: { in: expected.userIds }, checkInAt: { not: null } }, select: { userId: true } });
    const present = new Set(checkedIn.map((item) => item.userId));
    const recipients = expected.userIds.filter((id) => !present.has(id));
    let count = await createNotifications(tx, recipients, { organizationId: payload.organizationId, type: "ATTENDANCE", title: missing ? "Missing check-in" : "Time to check in", message: missing ? "No check-in was recorded by the configured cutoff. Please check in or contact your manager." : "Your workday is starting. Please check in when you arrive at the office.", link: "/employee/attendance", relatedEntityType: "attendance_day", relatedEntityId: payload.workDate, eventId: `${missing ? "automation.missing-checkin" : "automation.checkin-reminder"}:${payload.organizationId}:${payload.workDate}`, metadata: { workDate: payload.workDate, automation: payload.automation } });
    if (missing && settings.notifyManagersMissingCheckIn && recipients.length) {
      const reviewers = await reviewerIdsForUsers(tx, payload.organizationId, recipients);
      count += await createNotifications(tx, reviewers, { organizationId: payload.organizationId, type: "ATTENDANCE", title: "Missing check-ins require review", message: `${recipients.length} scheduled team member${recipients.length === 1 ? " has" : "s have"} no check-in after the cutoff.`, link: `/dashboard/attendance?date=${payload.workDate}&status=NOT_CHECKED_IN`, relatedEntityType: "attendance_day", relatedEntityId: payload.workDate, eventId: `automation.manager-missing-checkin:${payload.organizationId}:${payload.workDate}`, metadata: { workDate: payload.workDate, missingCount: recipients.length } });
    }
    return { status: "SUCCESS", notificationsCreated: count, metadata: { expected: expected.userIds.length, missing: recipients.length } };
  });
}

async function lunchAutomation(payload: AutomationPayload): Promise<AutomationResult> {
  return prisma.$transaction(async (tx) => {
    const settings = await tx.organizationSettings.findUnique({ where: { organizationId: payload.organizationId } });
    if (!settings?.enableLunchReminders) return { status: "SKIPPED", notificationsCreated: 0, metadata: { reason: "disabled" } };
    const expected = await expectedUsers(tx, payload.organizationId, payload.workDate, settings);
    if (!expected.eligible) return { status: "SKIPPED", notificationsCreated: 0, metadata: { reason: expected.reason } };
    const attendance = await tx.attendance.findMany({ where: { organizationId: payload.organizationId, attendanceDate: databaseDate(payload.workDate), userId: { in: expected.userIds }, checkInAt: { not: null }, checkOutAt: null }, select: { id: true, userId: true } });
    const lunch = attendance.length ? await tx.break.findMany({ where: { attendanceId: { in: attendance.map((item) => item.id) }, type: "LUNCH" }, select: { attendanceId: true } }) : [];
    const lunchAttendance = new Set(lunch.map((item) => item.attendanceId));
    const recipients = attendance.filter((item) => !lunchAttendance.has(item.id)).map((item) => item.userId);
    const count = await createNotifications(tx, recipients, { organizationId: payload.organizationId, type: "BREAK", title: "Lunch break reminder", message: "Your scheduled lunch window has started. Remember to record your break when you take it.", link: "/employee/attendance", relatedEntityType: "attendance_day", relatedEntityId: payload.workDate, eventId: `automation.lunch-reminder:${payload.organizationId}:${payload.workDate}`, metadata: { workDate: payload.workDate } });
    return { status: "SUCCESS", notificationsCreated: count, metadata: { checkedIn: attendance.length, eligible: recipients.length } };
  });
}

async function reportAutomation(payload: AutomationPayload, missing: boolean): Promise<AutomationResult> {
  return prisma.$transaction(async (tx) => {
    const settings = await tx.organizationSettings.findUnique({ where: { organizationId: payload.organizationId } });
    if (!settings?.requireDailyReports || (missing ? !settings.enableMissingReportAlerts : !settings.enableDailyReportReminders)) return { status: "SKIPPED", notificationsCreated: 0, metadata: { reason: "disabled" } };
    const expected = await expectedUsers(tx, payload.organizationId, payload.workDate, settings);
    if (!expected.eligible) return { status: "SKIPPED", notificationsCreated: 0, metadata: { reason: expected.reason } };
    const submitted = await tx.dailyReport.findMany({ where: { organizationId: payload.organizationId, reportDate: databaseDate(payload.workDate), userId: { in: expected.userIds }, status: { in: ["SUBMITTED", "REVIEWED"] } }, select: { userId: true } });
    const submittedIds = new Set(submitted.map((item) => item.userId));
    const recipients = expected.userIds.filter((id) => !submittedIds.has(id));
    let count = await createNotifications(tx, recipients, { organizationId: payload.organizationId, type: "REPORT_DUE", title: missing ? "Daily report is missing" : "Daily report reminder", message: missing ? "Your reporting deadline has passed. Please submit today’s factual work report." : "Please review and submit your daily work report before the reporting deadline.", link: "/employee/reports", relatedEntityType: "report_day", relatedEntityId: payload.workDate, eventId: `${missing ? "automation.missing-report" : "automation.report-reminder"}:${payload.organizationId}:${payload.workDate}`, metadata: { workDate: payload.workDate } });
    if (missing && settings.notifyManagersMissingReports && recipients.length) {
      const reviewers = await reviewerIdsForUsers(tx, payload.organizationId, recipients);
      count += await createNotifications(tx, reviewers, { organizationId: payload.organizationId, type: "REPORT_DUE", title: "Missing reports require attention", message: `${recipients.length} expected daily report${recipients.length === 1 ? " is" : "s are"} still missing.`, link: `/dashboard/reports?date=${payload.workDate}`, relatedEntityType: "report_day", relatedEntityId: payload.workDate, eventId: `automation.manager-missing-report:${payload.organizationId}:${payload.workDate}`, metadata: { workDate: payload.workDate, missingCount: recipients.length } });
    }
    return { status: "SUCCESS", notificationsCreated: count, metadata: { expected: expected.userIds.length, missing: recipients.length } };
  });
}

async function taskDeadlineAutomation(payload: AutomationPayload): Promise<AutomationResult> {
  return prisma.$transaction(async (tx) => {
    const settings = await tx.organizationSettings.findUnique({ where: { organizationId: payload.organizationId } });
    if (!settings?.enableTaskDeadlineReminders) return { status: "SKIPPED", notificationsCreated: 0, metadata: { reason: "disabled" } };
    const now = new Date(payload.scheduledFor);
    const windows = [...new Set(settings.taskDeadlineReminderHours.filter((value) => value > 0))].sort((a, b) => b - a);
    const maxHours = Math.max(24, ...windows);
    const tasks = await tx.task.findMany({ where: { organizationId: payload.organizationId, assignedToId: { not: null }, archivedAt: null, status: { notIn: ["COMPLETED", "CANCELLED"] }, dueAt: { lte: new Date(now.getTime() + maxHours * 3_600_000) } }, select: { id: true, title: true, assignedToId: true, dueAt: true } });
    let count = 0;
    for (const task of tasks) {
      if (!task.assignedToId || !task.dueAt) continue;
      const milliseconds = task.dueAt.getTime() - now.getTime();
      if (milliseconds < 0) {
        count += await createNotifications(tx, [task.assignedToId], { organizationId: payload.organizationId, type: "TASK_UPDATED", title: "Task overdue", message: task.title, link: `/employee/tasks?task=${task.id}`, relatedEntityType: "task", relatedEntityId: task.id, eventId: `automation.task-overdue:${task.id}`, metadata: { taskId: task.id, window: "OVERDUE" } });
        if (settings.notifyManagersOverdueTasks) {
          const reviewers = await reviewerIdsForUsers(tx, payload.organizationId, [task.assignedToId]);
          count += await createNotifications(tx, reviewers, { organizationId: payload.organizationId, type: "TASK_UPDATED", title: "Overdue task requires review", message: task.title, link: `/dashboard/tasks?task=${task.id}`, relatedEntityType: "task", relatedEntityId: task.id, eventId: `automation.manager-task-overdue:${task.id}`, metadata: { taskId: task.id, window: "OVERDUE" } });
        }
        continue;
      }
      for (const hours of windows) if (milliseconds <= hours * 3_600_000) count += await createNotifications(tx, [task.assignedToId], { organizationId: payload.organizationId, type: "TASK_UPDATED", title: `Task due within ${hours} hour${hours === 1 ? "" : "s"}`, message: task.title, link: `/employee/tasks?task=${task.id}`, relatedEntityType: "task", relatedEntityId: task.id, eventId: `automation.task-due:${task.id}:${hours}h`, metadata: { taskId: task.id, windowHours: hours } });
    }
    return { status: "SUCCESS", notificationsCreated: count, metadata: { scanned: tasks.length, windows } };
  });
}

async function dailySummaryAutomation(payload: AutomationPayload): Promise<AutomationResult> {
  return prisma.$transaction(async (tx) => {
    const settings = await tx.organizationSettings.findUnique({ where: { organizationId: payload.organizationId } });
    if (!settings?.enableDailyTeamSummary) return { status: "SKIPPED", notificationsCreated: 0, metadata: { reason: "disabled" } };
    const expected = await expectedUsers(tx, payload.organizationId, payload.workDate, settings);
    if (!expected.eligible) return { status: "SKIPPED", notificationsCreated: 0, metadata: { reason: expected.reason } };
    const date = databaseDate(payload.workDate);
    const range = workdayRangeUtc(payload.workDate, settings.timezone, settings.workdayStart, settings.workdayEnd);
    const [attendance, submitted, tasksCompleted, blockedTasks] = await Promise.all([
      tx.attendance.findMany({ where: { organizationId: payload.organizationId, attendanceDate: date, userId: { in: expected.userIds } }, include: { breaks: true, workSessions: { where: { taskId: { not: null } } } } }),
      tx.dailyReport.count({ where: { organizationId: payload.organizationId, reportDate: date, userId: { in: expected.userIds }, status: { in: ["SUBMITTED", "REVIEWED"] } } }),
      tx.task.count({ where: { organizationId: payload.organizationId, completedAt: { gte: range.start, lt: range.end }, archivedAt: null } }),
      tx.task.count({ where: { organizationId: payload.organizationId, status: "BLOCKED", archivedAt: null } }),
    ]);
    const totals = attendance.reduce((sum, item) => { const value = workingSummary({ attendance: item.checkInAt ? { startedAt: item.checkInAt, endedAt: item.checkOutAt } : null, breaks: item.breaks, tasks: item.workSessions, now: new Date(payload.scheduledFor) }); return { officeMs: sum.officeMs + value.officeMs, netMs: sum.netMs + value.netMs, taskMs: sum.taskMs + value.taskMs }; }, { officeMs: 0, netMs: 0, taskMs: 0 });
    const data = { employeesExpected: expected.userIds.length, employeesCheckedIn: attendance.filter((item) => item.checkInAt).length, employeesAbsent: attendance.filter((item) => item.status === "ABSENT").length, employeesOnLeave: expected.leaveIds.length, reportsSubmitted: submitted, missingReports: Math.max(0, expected.userIds.length - submitted), tasksCompleted, tasksBlocked: blockedTasks, officeMinutes: Math.floor(totals.officeMs / 60000), netWorkingMinutes: Math.floor(totals.netMs / 60000), taskTrackedMinutes: Math.floor(totals.taskMs / 60000), workDate: payload.workDate, timezone: settings.timezone, overnightShift: range.overnight };
    const summary = await tx.dailyTeamSummary.upsert({ where: { organizationId_workDate_version: { organizationId: payload.organizationId, workDate: date, version: 1 } }, create: { organizationId: payload.organizationId, workDate: date, summaryData: data, version: 1 }, update: { summaryData: data, generatedAt: new Date() } });
    return { status: "SUCCESS", notificationsCreated: 0, metadata: { summaryId: summary.id, ...data } };
  });
}

export async function executeAutomation(payload: AutomationPayload) {
  try {
    let result: AutomationResult;
    if (payload.automation === "CHECK_IN_REMINDER") result = await checkInAutomation(payload, false);
    else if (payload.automation === "MISSING_CHECK_IN") result = await checkInAutomation(payload, true);
    else if (payload.automation === "LUNCH_REMINDER") result = await lunchAutomation(payload);
    else if (payload.automation === "DAILY_REPORT_REMINDER") result = await reportAutomation(payload, false);
    else if (payload.automation === "MISSING_DAILY_REPORT") result = await reportAutomation(payload, true);
    else if (payload.automation === "TASK_DEADLINE") result = await taskDeadlineAutomation(payload);
    else if (payload.automation === "DAILY_TEAM_SUMMARY") result = await dailySummaryAutomation(payload);
    else throw new Error("Daily email reports have a dedicated delivery handler.");
    await prisma.automationExecution.upsert({ where: { runKey: payload.runKey }, create: { organizationId: payload.organizationId, automation: payload.automation as AutomationType, workDate: databaseDate(payload.workDate), scheduledFor: new Date(payload.scheduledFor), status: result.status, notificationsCreated: result.notificationsCreated, runKey: payload.runKey, metadata: result.metadata }, update: { executedAt: new Date(), status: result.status, notificationsCreated: result.notificationsCreated, errorSummary: null, metadata: result.metadata } });
    return result;
  } catch (error) {
    const errorSummary = safeError(error);
    await prisma.automationExecution.upsert({ where: { runKey: payload.runKey }, create: { organizationId: payload.organizationId, automation: payload.automation as AutomationType, workDate: databaseDate(payload.workDate), scheduledFor: new Date(payload.scheduledFor), status: "FAILED", notificationsCreated: 0, errorSummary, runKey: payload.runKey }, update: { executedAt: new Date(), status: "FAILED", errorSummary } }).catch(() => undefined);
    throw new Error(errorSummary);
  }
}
