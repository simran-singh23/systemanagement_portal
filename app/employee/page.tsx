import type { Metadata } from "next";
import Link from "next/link";
import type { TaskPriority } from "@prisma/client";
import { Icon, type IconName } from "@/components/ui/icons";
import { StatCard } from "@/components/dashboard/stat-card";
import { RecentActivity, type ActivityItem } from "@/components/dashboard/recent-activity";
import { TodaysTasks, type TaskItem } from "@/components/dashboard/todays-tasks";
import { requireCurrentOrganization } from "@/lib/dal/auth";
import { attendanceWorkdayKey, databaseDate, dateKeyInZone, dayRangeInZone } from "@/lib/date-time";
import { prisma } from "@/lib/prisma";
import { formatMilliseconds } from "@/lib/work-time";

export const metadata: Metadata = { title: "Employee dashboard" };

function priority(value: TaskPriority): TaskItem["priority"] { return value === "URGENT" || value === "HIGH" ? "High" : value === "MEDIUM" ? "Medium" : "Low"; }
function initials(value: string) { return value.split(/\s|@/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }
function relativeTime(date: Date, now: Date) { const minutes = Math.max(0, Math.round((now.getTime() - date.getTime()) / 60_000)); if (minutes < 1) return "Just now"; if (minutes < 60) return `${minutes}m ago`; const hours = Math.round(minutes / 60); return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`; }

export default async function EmployeeDashboard() {
  const { user, organization } = await requireCurrentOrganization("organization:read");
  const now = new Date();
  const settings = await prisma.organizationSettings.findUnique({ where: { organizationId: organization.id }, select: { timezone: true, workdayStart: true, workdayEnd: true, overnightShiftEnabled: true } });
  const timezone = settings?.timezone ?? "Asia/Kolkata";
  const todayKey = dateKeyInZone(now, timezone);
  const todayDate = databaseDate(attendanceWorkdayKey(now, timezone, settings?.workdayStart ?? "09:00", settings?.workdayEnd ?? "18:00", settings?.overnightShiftEnabled ?? false));
  const today = dayRangeInZone(todayKey, timezone);
  const weekStart = new Date(today.start); weekStart.setUTCDate(weekStart.getUTCDate() - 6);
  const monthStart = new Date(`${todayKey.slice(0, 7)}-01T00:00:00.000Z`);
  const lastThirty = new Date(todayDate); lastThirty.setUTCDate(lastThirty.getUTCDate() - 29);

  const [completed, inProgress, sessions, attendance, attendanceHistory, dueTasks, activeSession, logs] = await Promise.all([
    prisma.task.count({ where: { organizationId: organization.id, assignedToId: user.id, completedAt: { gte: monthStart }, archivedAt: null } }),
    prisma.task.count({ where: { organizationId: organization.id, assignedToId: user.id, status: "IN_PROGRESS", archivedAt: null } }),
    prisma.workSession.findMany({ where: { organizationId: organization.id, userId: user.id, taskId: { not: null }, startedAt: { gte: weekStart, lt: today.end } }, select: { startedAt: true, endedAt: true } }),
    prisma.attendance.findUnique({ where: { organizationId_userId_attendanceDate: { organizationId: organization.id, userId: user.id, attendanceDate: todayDate } }, select: { checkInAt: true, checkOutAt: true } }),
    prisma.attendance.findMany({ where: { organizationId: organization.id, userId: user.id, attendanceDate: { gte: lastThirty, lte: todayDate } }, select: { status: true } }),
    prisma.task.findMany({ where: { organizationId: organization.id, assignedToId: user.id, dueAt: { gte: today.start, lt: today.end }, archivedAt: null }, include: { team: { select: { name: true } } }, orderBy: [{ status: "asc" }, { dueAt: "asc" }], take: 6 }),
    prisma.workSession.findFirst({ where: { organizationId: organization.id, userId: user.id, taskId: { not: null }, endedAt: null }, include: { task: { select: { id: true, title: true, dueAt: true, team: { select: { name: true } } } } } }),
    prisma.activityLog.findMany({ where: { organizationId: organization.id, actorId: user.id }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);

  const weekMs = sessions.reduce((sum, session) => sum + Math.max(0, (session.endedAt ?? now).getTime() - session.startedAt.getTime()), 0);
  const attended = attendanceHistory.filter((item) => item.status !== "ABSENT").length;
  const attendanceRate = attendanceHistory.length ? Math.round((attended / attendanceHistory.length) * 100) : 0;
  const tasks: TaskItem[] = dueTasks.map((task) => ({ title: task.title, project: task.team?.name ?? "No team", time: task.dueAt?.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: timezone }) ?? "No time", priority: priority(task.priority), done: task.status === "COMPLETED" }));
  const iconFor = (action: string): IconName => action.includes("task") ? "tasks" : action.includes("report") ? "file" : action.includes("attendance") ? "clock" : "check";
  const activities: ActivityItem[] = logs.map((item) => ({ person: "You", initials: initials(user.name || user.email), action: item.action.replaceAll(".", " "), subject: item.entityType.replaceAll("_", " "), time: relativeTime(item.createdAt, now), icon: iconFor(item.action), tint: item.action.includes("task") ? "blue" : "green" }));
  const firstName = user.name?.split(" ")[0] ?? "there";

  return <div className="space-y-6">
    <section className="tf-page-header"><div><p className="tf-eyebrow">{now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: timezone })}</p><h1 className="tf-page-title mt-2">Good {Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: timezone }).format(now)) < 12 ? "morning" : "afternoon"}, {firstName}</h1><p className="tf-page-description">Your tasks, time, and updates for today.</p></div><Link href="/employee/attendance" className="inline-flex min-h-11 items-center gap-3 self-start rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3.5 py-2 sm:self-auto"><span className={`size-2 rounded-full ${attendance?.checkInAt && !attendance.checkOutAt ? "bg-[#22a06b] shadow-[0_0_0_4px_#eaf8f2]" : "bg-[#98a2b3]"}`} /><span><span className="block text-xs font-semibold text-[var(--ink)]">{attendance?.checkInAt ? attendance.checkOutAt ? "Checked out" : "Checked in" : "Not checked in"}</span><span className="mt-0.5 block text-[10px] text-[var(--muted-2)]">Open attendance</span></span></Link></section>
    <section aria-label="Personal overview" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Tasks completed" value={String(completed)} detail="This month" icon="check" accent="green" /><StatCard label="In progress" value={String(inProgress)} detail="Assigned to you" icon="tasks" /><StatCard label="Focused this week" value={formatMilliseconds(weekMs)} detail="Task sessions" icon="clock" accent="violet" /><StatCard label="Attendance" value={`${attendanceRate}%`} detail="Recorded days · 30d" icon="calendar" accent="amber" /></section>
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(19rem,.75fr)]"><TodaysTasks items={tasks} title="My focus today" href="/employee/tasks" /><div className="relative overflow-hidden rounded-2xl bg-[#172033] p-6 text-white"><span className="relative grid size-10 place-items-center rounded-xl bg-white/10 text-[#8eb2ff]"><Icon name={activeSession ? "clock" : "tasks"} className="size-5" /></span><p className="relative mt-6 text-xs font-semibold text-[#8eb2ff]">{activeSession ? "Active work session" : "Current focus"}</p><h2 className="relative mt-2 text-2xl font-semibold tracking-[-.04em]">{activeSession?.task?.title ?? (tasks[0]?.title || "Your queue is clear")}</h2><p className="relative mt-3 text-sm leading-6 text-white/65">{activeSession ? `${activeSession.task?.team?.name ?? "Team task"} · started ${activeSession.startedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: timezone })}` : tasks.length ? "Open your task list to start a focused work session." : "New assignments will appear here when they are ready."}</p><Link href="/employee/tasks" className="relative mt-7 inline-flex min-h-11 items-center gap-2 border-t border-white/10 pt-5 text-sm font-semibold text-[#9bbaff]">Open my tasks <Icon name="arrowRight" className="size-4" /></Link></div></section>
    <section className="grid gap-6 xl:grid-cols-2"><RecentActivity items={activities} /><section className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6"><h2 className="font-semibold text-[var(--ink)]">Today&apos;s workday</h2><p className="mt-1 text-xs text-[var(--muted)]">Attendance timestamps recorded by the server</p><div className="mt-6 grid grid-cols-2 gap-4"><Fact label="Check-in" value={attendance?.checkInAt?.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: timezone }) ?? "Not recorded"} /><Fact label="Check-out" value={attendance?.checkOutAt?.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: timezone }) ?? "Not recorded"} /></div><Link href="/employee/attendance" className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--blue)]">Manage attendance <Icon name="arrowRight" className="size-4" /></Link></section></section>
  </div>;
}

function Fact({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-[var(--surface-subtle)] p-4"><p className="text-xs text-[var(--muted-2)]">{label}</p><p className="mt-2 font-mono text-sm font-semibold text-[var(--ink)]">{value}</p></div>; }
