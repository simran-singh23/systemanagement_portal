import "server-only";

import type { Prisma, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { attendanceWorkdayKey, databaseDate, dayRangeInZone, shiftDateKey, zonedDateTimeToUtc } from "@/lib/date-time";
import { workingSummary } from "@/lib/work-time";
import { buildReportTaskEvidence } from "@/lib/report-evidence";
import { ORGANIZATION_SETTINGS_DEFAULTS } from "@/lib/organization-settings";

type ReportSchedule = Pick<typeof ORGANIZATION_SETTINGS_DEFAULTS, "timezone" | "workdayStart" | "workdayEnd" | "overnightShiftEnabled">;

export function reportUserScope(organizationId: string, role: UserRole, actorId: string): Prisma.UserWhereInput {
  return role === "TEAM_LEAD" ? { teamMembers: { some: { team: { organizationId, managerId: actorId } } } } : {};
}

export function reportWorkday(now: Date, schedule: ReportSchedule) {
  return attendanceWorkdayKey(now, schedule.timezone, schedule.workdayStart, schedule.workdayEnd, schedule.overnightShiftEnabled);
}

export async function getReportSettings(organizationId: string, client: Prisma.TransactionClient = prisma) {
  return await client.organizationSettings.findUnique({ where: { organizationId }, select: {
    timezone: true, workdayStart: true, workdayEnd: true, overnightShiftEnabled: true, workDays: true,
    allowReportBeforeCheckout: true, allowReportEditingAfterSubmission: true, requireDailyReports: true, dailyReportDueTime: true,
  } }) ?? ORGANIZATION_SETTINGS_DEFAULTS;
}

export async function getReportDayData(organizationId: string, userId: string, reportDate: string, schedule: ReportSchedule, now = new Date(), client: Prisma.TransactionClient = prisma) {
  const date = databaseDate(reportDate);
  const { timezone, workdayEnd, workdayStart, overnightShiftEnabled } = schedule;
  const range = overnightShiftEnabled && workdayEnd < workdayStart ? {
    start: zonedDateTimeToUtc(reportDate, workdayEnd, timezone),
    end: zonedDateTimeToUtc(shiftDateKey(reportDate, 1), workdayEnd, timezone),
  } : dayRangeInZone(reportDate, timezone);
  const attendance = await client.attendance.findUnique({ where: { organizationId_userId_attendanceDate: { organizationId, userId, attendanceDate: date } }, include: { breaks: true, workSessions: { where: { taskId: { not: null } }, include: { task: { select: { id: true, title: true, status: true } } }, orderBy: { startedAt: "asc" } } } });
  const interval = attendance?.checkInAt ? { startedAt: attendance.checkInAt, endedAt: attendance.checkOutAt } : null;
  const today = reportWorkday(now, schedule);
  const completedTasks = await client.task.findMany({ where: { organizationId, assignedToId: userId, completedAt: { gte: range.start, lt: range.end }, archivedAt: null }, select: { id: true, title: true, status: true, completedAt: true } });
  const currentTasks = reportDate === today || (interval && !interval.endedAt) ? await client.task.findMany({ where: { organizationId, assignedToId: userId, status: { in: ["IN_PROGRESS", "BLOCKED"] }, archivedAt: null }, select: { id: true, title: true, status: true } }) : [];
  const tasks = buildReportTaskEvidence({ sessions: attendance?.workSessions ?? [], completedTasks, currentTasks, attendance: interval, reportDate, today: interval && !interval.endedAt ? reportDate : today, now });
  const hours = workingSummary({ attendance: interval, breaks: attendance?.breaks ?? [], tasks: attendance?.workSessions ?? [], now });
  return { attendance, hours, tasks, completedTasks, currentTasks, provisional: Boolean(interval && !interval.endedAt) };
}

export function reportSnapshot(data: Awaited<ReturnType<typeof getReportDayData>>) {
  return {
    attendance: { id: data.attendance?.id ?? null, checkInAt: data.attendance?.checkInAt?.toISOString() ?? null, checkOutAt: data.attendance?.checkOutAt?.toISOString() ?? null },
    hours: data.hours,
    provisional: data.provisional,
    tasks: data.tasks,
  };
}
