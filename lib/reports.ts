import "server-only";

import { prisma } from "@/lib/prisma";
import { databaseDate, dayRangeInZone } from "@/lib/date-time";
import { workingSummary } from "@/lib/work-time";

export async function getReportDayData(organizationId: string, userId: string, reportDate: string, timezone: string, now = new Date()) {
  const date = databaseDate(reportDate);
  const range = dayRangeInZone(reportDate, timezone);
  const [attendance, completedTasks, currentTasks] = await Promise.all([
    prisma.attendance.findUnique({ where: { organizationId_userId_attendanceDate: { organizationId, userId, attendanceDate: date } }, include: { breaks: true, workSessions: { where: { taskId: { not: null } }, include: { task: { select: { id: true, title: true, status: true } } }, orderBy: { startedAt: "asc" } } } }),
    prisma.task.findMany({ where: { organizationId, assignedToId: userId, completedAt: { gte: range.start, lt: range.end }, archivedAt: null }, select: { id: true, title: true, status: true, completedAt: true } }),
    prisma.task.findMany({ where: { organizationId, assignedToId: userId, status: { in: ["IN_PROGRESS", "BLOCKED"] }, archivedAt: null }, select: { id: true, title: true, status: true } }),
  ]);
  const sessionByTask = new Map<string, { id: string; title: string; status: string; milliseconds: number }>();
  for (const session of attendance?.workSessions ?? []) {
    if (!session.taskId || !session.task) continue;
    const current = sessionByTask.get(session.taskId) ?? { id: session.taskId, title: session.task.title, status: session.task.status, milliseconds: 0 };
    current.milliseconds += Math.max(0, (session.endedAt ?? now).getTime() - session.startedAt.getTime());
    sessionByTask.set(session.taskId, current);
  }
  const completedIds = new Set(completedTasks.map((task) => task.id));
  const tasks = new Map<string, { id: string; title: string; status: string; milliseconds: number; completedToday: boolean }>();
  for (const item of sessionByTask.values()) tasks.set(item.id, { ...item, completedToday: completedIds.has(item.id) });
  for (const item of completedTasks) tasks.set(item.id, { id: item.id, title: item.title, status: item.status, milliseconds: tasks.get(item.id)?.milliseconds ?? 0, completedToday: true });
  for (const item of currentTasks) if (!tasks.has(item.id)) tasks.set(item.id, { id: item.id, title: item.title, status: item.status, milliseconds: 0, completedToday: false });
  const hours = attendance?.checkInAt ? workingSummary({ attendance: { startedAt: attendance.checkInAt, endedAt: attendance.checkOutAt }, breaks: attendance.breaks, tasks: attendance.workSessions, now }) : workingSummary({ attendance: null, breaks: [], tasks: [], now });
  return { attendance, hours, tasks: [...tasks.values()], completedTasks, currentTasks, provisional: Boolean(attendance?.checkInAt && !attendance.checkOutAt) };
}

export function reportSnapshot(data: Awaited<ReturnType<typeof getReportDayData>>) {
  return {
    attendance: { id: data.attendance?.id ?? null, checkInAt: data.attendance?.checkInAt?.toISOString() ?? null, checkOutAt: data.attendance?.checkOutAt?.toISOString() ?? null },
    hours: data.hours,
    provisional: data.provisional,
    tasks: data.tasks,
  };
}
