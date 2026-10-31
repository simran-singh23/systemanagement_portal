import "server-only";

import { prisma } from "@/lib/prisma";
import { databaseDate, formatTimeInZone } from "@/lib/date-time";
import { workdayRangeUtc } from "@/lib/automation-schedule";
import { workingSummary } from "@/lib/work-time";
import type { DailyEmailEmployee, DailyEmailReport } from "./template";

const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;

export async function buildDailyEmailReport(organizationId: string, workDate: string, now = new Date()): Promise<DailyEmailReport | null> {
  const date = databaseDate(workDate);
  const [organization, settings, summary] = await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
    prisma.organizationSettings.findUnique({ where: { organizationId }, select: { timezone: true, workdayStart: true, workdayEnd: true, dailyReportDueTime: true } }),
    prisma.dailyTeamSummary.findFirst({ where: { organizationId, workDate: date }, orderBy: { version: "desc" } }),
  ]);
  if (!organization || !settings || !summary) return null;
  const range = workdayRangeUtc(workDate, settings.timezone, settings.workdayStart, settings.workdayEnd);
  const [members, attendance, reports, tasks] = await Promise.all([
    prisma.organizationMember.findMany({ where: { organizationId, status: "ACTIVE", role: { in: ["EMPLOYEE", "TEAM_LEAD"] } }, select: { userId: true, user: { select: { name: true, email: true } } }, orderBy: { user: { name: "asc" } } }),
    prisma.attendance.findMany({ where: { organizationId, attendanceDate: date, user: { organizationMembers: { some: { organizationId, status: "ACTIVE", role: { in: ["EMPLOYEE", "TEAM_LEAD"] } } } } }, include: { breaks: true, workSessions: { where: { taskId: { not: null } } } } }),
    prisma.dailyReport.findMany({ where: { organizationId, reportDate: date, status: { in: ["SUBMITTED", "REVIEWED"] } }, select: { userId: true, summary: true, blockers: true, pulse: { select: { mood: true, note: true } } } }),
    prisma.task.findMany({ where: { organizationId, archivedAt: null, assignedToId: { not: null }, OR: [{ completedAt: { gte: range.start, lt: range.end } }, { status: "IN_PROGRESS" }] }, select: { assignedToId: true, status: true, completedAt: true } }),
  ]);
  const attendanceByUser = new Map(attendance.map((item) => [item.userId, item]));
  const reportByUser = new Map(reports.map((item) => [item.userId, item]));
  const employees: DailyEmailEmployee[] = members.map((member) => {
    const day = attendanceByUser.get(member.userId);
    const report = reportByUser.get(member.userId);
    const worked = day?.checkInAt ? workingSummary({ attendance: { startedAt: day.checkInAt, endedAt: day.checkOutAt }, breaks: day.breaks, tasks: day.workSessions, now }) : null;
    return {
      name: member.user.name || member.user.email,
      attendance: day?.status ?? "Not recorded",
      checkIn: day?.checkInAt ? formatTimeInZone(day.checkInAt, settings.timezone) : null,
      checkOut: day?.checkOutAt ? formatTimeInZone(day.checkOutAt, settings.timezone) : null,
      netMinutes: worked ? Math.floor(worked.netMs / 60_000) : null,
      taskMinutes: worked ? Math.floor(worked.taskMs / 60_000) : null,
      completedTasks: tasks.filter((task) => task.assignedToId === member.userId && task.completedAt && task.completedAt >= range.start && task.completedAt < range.end).length,
      inProgressTasks: tasks.filter((task) => task.assignedToId === member.userId && task.status === "IN_PROGRESS").length,
      summary: report?.summary ?? null,
      pulse: report?.pulse?.mood ?? null,
      blockers: report?.blockers || (report?.pulse?.mood === "BLOCKED" ? report.pulse.note : null) || null,
    };
  });
  const breakMinutes = attendance.reduce((total, item) => total + item.breaks.reduce((sum, entry) => sum + (entry.durationMins ?? Math.max(0, Math.floor(((entry.endedAt ?? now).getTime() - entry.startedAt.getTime()) / 60_000))), 0), 0);
  const source = summary.summaryData && typeof summary.summaryData === "object" && !Array.isArray(summary.summaryData) ? summary.summaryData : {};
  const dashboardUrl = new URL("/dashboard/reports", process.env.AUTH_URL || "http://localhost:3000").toString();
  return {
    organizationName: organization.name, workDate, timezone: settings.timezone,
    provisional: now < range.end || attendance.some((item) => Boolean(item.checkInAt && !item.checkOutAt)),
    totals: {
      expected: number(source.employeesExpected), present: number(source.employeesCheckedIn), absent: number(source.employeesAbsent), onLeave: number(source.employeesOnLeave),
      reportsSubmitted: number(source.reportsSubmitted), reportsMissing: number(source.missingReports), tasksCompleted: number(source.tasksCompleted), tasksBlocked: number(source.tasksBlocked),
      officeMinutes: number(source.officeMinutes), breakMinutes, netMinutes: number(source.netWorkingMinutes), taskMinutes: number(source.taskTrackedMinutes),
    }, employees, dashboardUrl,
  };
}
