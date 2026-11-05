import "server-only";

import { prisma } from "@/lib/prisma";
import { databaseDate, dateKeyInZone, dayRangeInZone } from "@/lib/date-time";
import { workingSummary } from "@/lib/work-time";
import { buildReportTaskEvidence } from "@/lib/report-evidence";

export async function getReportDayData(organizationId: string, userId: string, reportDate: string, timezone: string, now = new Date()) {
  const date = databaseDate(reportDate);
  const range = dayRangeInZone(reportDate, timezone);
  const [attendance, completedTasks, currentTasks] = await Promise.all([
    prisma.attendance.findUnique({ where: { organizationId_userId_attendanceDate: { organizationId, userId, attendanceDate: date } }, include: { breaks: true, workSessions: { where: { taskId: { not: null } }, include: { task: { select: { id: true, title: true, status: true } } }, orderBy: { startedAt: "asc" } } } }),
    prisma.task.findMany({ where: { organizationId, assignedToId: userId, completedAt: { gte: range.start, lt: range.end }, archivedAt: null }, select: { id: true, title: true, status: true, completedAt: true } }),
    prisma.task.findMany({ where: { organizationId, assignedToId: userId, status: { in: ["IN_PROGRESS", "BLOCKED"] }, archivedAt: null }, select: { id: true, title: true, status: true } }),
  ]);
  const tasks = buildReportTaskEvidence({ sessions: attendance?.workSessions ?? [], completedTasks, currentTasks, attendance: attendance?.checkInAt ? { startedAt: attendance.checkInAt, endedAt: attendance.checkOutAt } : null, reportDate, today: dateKeyInZone(now, timezone), now });
  const hours = attendance?.checkInAt ? workingSummary({ attendance: { startedAt: attendance.checkInAt, endedAt: attendance.checkOutAt }, breaks: attendance.breaks, tasks: attendance.workSessions, now }) : workingSummary({ attendance: null, breaks: [], tasks: [], now });
  return { attendance, hours, tasks, completedTasks, currentTasks, provisional: Boolean(attendance?.checkInAt && !attendance.checkOutAt) };
}

export function reportSnapshot(data: Awaited<ReturnType<typeof getReportDayData>>) {
  return {
    attendance: { id: data.attendance?.id ?? null, checkInAt: data.attendance?.checkInAt?.toISOString() ?? null, checkOutAt: data.attendance?.checkOutAt?.toISOString() ?? null },
    hours: data.hours,
    provisional: data.provisional,
    tasks: data.tasks,
  };
}
