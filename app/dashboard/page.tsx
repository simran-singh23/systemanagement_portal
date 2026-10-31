import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma, TaskPriority } from "@prisma/client";
import { Icon, type IconName } from "@/components/ui/icons";
import { StatCard } from "@/components/dashboard/stat-card";
import { RecentActivity, type ActivityItem } from "@/components/dashboard/recent-activity";
import { TodaysTasks, type TaskItem } from "@/components/dashboard/todays-tasks";
import { requireCurrentOrganization } from "@/lib/dal/auth";
import { databaseDate, dateKeyInZone, dayRangeInZone, shiftDateKey } from "@/lib/date-time";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Manager dashboard" };

const activityLabels: Record<string, { action: string; icon: IconName; tint: ActivityItem["tint"] }> = {
  "task.created": { action: "created", icon: "tasks", tint: "blue" },
  "task.updated": { action: "updated", icon: "tasks", tint: "violet" },
  "task.status_changed": { action: "changed", icon: "check", tint: "green" },
  "attendance.checked_in": { action: "checked in for", icon: "clock", tint: "amber" },
  "report.submitted": { action: "submitted", icon: "file", tint: "violet" },
};

function priority(value: TaskPriority): TaskItem["priority"] { return value === "URGENT" || value === "HIGH" ? "High" : value === "MEDIUM" ? "Medium" : "Low"; }
function initials(value: string) { return value.split(/\s|@/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }
function relativeTime(date: Date, now: Date) { const minutes = Math.max(0, Math.round((now.getTime() - date.getTime()) / 60_000)); if (minutes < 1) return "Just now"; if (minutes < 60) return `${minutes}m ago`; const hours = Math.round(minutes / 60); if (hours < 24) return `${hours}h ago`; return `${Math.round(hours / 24)}d ago`; }

export default async function ManagerDashboard() {
  const { user, organization, membership } = await requireCurrentOrganization("attendance:read-all");
  const role = membership?.role ?? user.role;
  const now = new Date();
  const settings = await prisma.organizationSettings.findUnique({ where: { organizationId: organization.id }, select: { timezone: true, aiEnabled: true, aiSummaryEnabled: true, aiAssistantEnabled: true, aiAuthorizedRoles: true } });
  const timezone = settings?.timezone ?? "Asia/Kolkata";
  const todayKey = dateKeyInZone(now, timezone);
  const todayDate = databaseDate(todayKey);
  const today = dayRangeInZone(todayKey, timezone);
  const monthStart = new Date(`${todayKey.slice(0, 7)}-01T00:00:00.000Z`);
  const teamScope: Prisma.TaskWhereInput = role === "TEAM_LEAD" ? { team: { managerId: user.id } } : {};
  const memberScope: Prisma.OrganizationMemberWhereInput = role === "TEAM_LEAD" ? { user: { teamMembers: { some: { team: { organizationId: organization.id, managerId: user.id } } } } } : {};
  const memberIds = role === "TEAM_LEAD" ? (await prisma.organizationMember.findMany({ where: { organizationId: organization.id, status: "ACTIVE", ...memberScope }, select: { userId: true } })).map((item) => item.userId) : undefined;
  const activityScope: Prisma.ActivityLogWhereInput = memberIds ? { actorId: { in: memberIds } } : {};

  const [members, present, completed, pendingReports, openTasks, reviewTasks, blockedTasks, dueTasks, recentLogs, completedByDay] = await Promise.all([
    prisma.organizationMember.count({ where: { organizationId: organization.id, status: "ACTIVE", ...memberScope } }),
    prisma.attendance.count({ where: { organizationId: organization.id, attendanceDate: todayDate, checkInAt: { not: null }, ...(memberIds ? { userId: { in: memberIds } } : {}) } }),
    prisma.task.count({ where: { organizationId: organization.id, completedAt: { gte: monthStart }, archivedAt: null, ...teamScope } }),
    prisma.dailyReport.count({ where: { organizationId: organization.id, reportDate: todayDate, status: "DRAFT", ...(memberIds ? { userId: { in: memberIds } } : {}) } }),
    prisma.task.count({ where: { organizationId: organization.id, status: { notIn: ["COMPLETED", "CANCELLED"] }, archivedAt: null, ...teamScope } }),
    prisma.task.count({ where: { organizationId: organization.id, status: "REVIEW", archivedAt: null, ...teamScope } }),
    prisma.task.count({ where: { organizationId: organization.id, status: "BLOCKED", archivedAt: null, ...teamScope } }),
    prisma.task.findMany({ where: { organizationId: organization.id, dueAt: { gte: today.start, lt: today.end }, archivedAt: null, ...teamScope }, include: { team: { select: { name: true } } }, orderBy: [{ status: "asc" }, { dueAt: "asc" }], take: 6 }),
    prisma.activityLog.findMany({ where: { organizationId: organization.id, ...activityScope }, include: { actor: { select: { name: true, email: true } } }, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.task.findMany({ where: { organizationId: organization.id, completedAt: { gte: dayRangeInZone(shiftDateKey(todayKey, -6), timezone).start, lt: today.end }, archivedAt: null, ...teamScope }, select: { completedAt: true } }),
  ]);

  const counts = new Map<string, number>();
  for (const task of completedByDay) if (task.completedAt) { const key = dateKeyInZone(task.completedAt, timezone); counts.set(key, (counts.get(key) ?? 0) + 1); }
  const productivity = Array.from({ length: 7 }, (_, index) => { const key = shiftDateKey(todayKey, index - 6); return { key, label: new Date(`${key}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" }), value: counts.get(key) ?? 0 }; });
  const maxCompleted = Math.max(1, ...productivity.map((item) => item.value));
  const tasks: TaskItem[] = dueTasks.map((task) => ({ title: task.title, project: task.team?.name ?? "No team", time: task.dueAt?.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: timezone }) ?? "No time", priority: priority(task.priority), done: task.status === "COMPLETED" }));
  const activities: ActivityItem[] = recentLogs.map((item) => { const person = item.actor?.name || item.actor?.email || "System"; const style = activityLabels[item.action] ?? { action: "updated", icon: "clock" as const, tint: "blue" as const }; return { person, initials: initials(person), action: style.action, subject: item.entityType.replaceAll("_", " "), time: relativeTime(item.createdAt, now), icon: style.icon, tint: style.tint }; });
  const firstName = user.name?.split(" ")[0] ?? "there";
  const attendanceRate = members ? Math.round((present / members) * 100) : 0;
  const showAiInsights = Boolean(settings?.aiEnabled && settings.aiAuthorizedRoles.includes(role) && (settings.aiSummaryEnabled || settings.aiAssistantEnabled));

  return <div className="space-y-6">
    <section className="tf-page-header"><div><p className="tf-eyebrow">{now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: timezone })}</p><h1 className="tf-page-title mt-2">Good {Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: timezone }).format(now)) < 12 ? "morning" : "afternoon"}, {firstName}</h1><p className="tf-page-description">A live view of today&apos;s people, work, and approvals.</p></div><Link href="/dashboard/tasks?create=1" className="tf-button-primary"><Icon name="plus" className="size-4" /> Create task</Link></section>
    <section aria-label="Team overview" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Team members" value={String(members)} detail={`${present} checked in today`} icon="users" /><StatCard label="Tasks completed" value={String(completed)} detail="This month" icon="check" accent="green" /><StatCard label="Attendance rate" value={`${attendanceRate}%`} detail="Today" icon="calendar" accent="violet" /><StatCard label="Pending reports" value={String(pendingReports)} detail="Drafts for today" icon="file" accent="amber" /></section>
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(20rem,.7fr)]"><div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]"><div className="border-b border-[var(--line)] px-5 py-4 sm:px-6"><h2 className="font-semibold text-[var(--ink)]">Seven-day delivery</h2><p className="mt-1 text-xs text-[var(--muted)]">Tasks completed each day</p></div><div className="p-5 sm:p-6"><div className="grid h-48 grid-cols-7 items-end gap-2 border-b border-[var(--line)] sm:gap-4">{productivity.map((item) => <div key={item.key} className="flex h-full flex-col justify-end"><div className="mb-2 text-center font-mono text-xs font-semibold text-[var(--ink)]">{item.value}</div><div style={{ height: `${Math.max(5, item.value / maxCompleted * 78)}%` }} className="rounded-t-md bg-[var(--blue)] opacity-85" /></div>)}</div><div className="mt-3 grid grid-cols-7 text-center text-[10px] text-[var(--muted-2)]">{productivity.map((item) => <span key={item.key}>{item.label}</span>)}</div></div></div><div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6"><span className="grid size-10 place-items-center rounded-xl bg-[var(--blue-soft)] text-[var(--blue)]"><Icon name="tasks" className="size-5" /></span><h2 className="mt-6 text-xl font-semibold tracking-[-.03em] text-[var(--ink)]">Work requiring attention</h2><div className="mt-5 space-y-3"><SummaryRow label="Open tasks" value={openTasks} /><SummaryRow label="Waiting for review" value={reviewTasks} /><SummaryRow label="Blocked" value={blockedTasks} /></div><Link href="/dashboard/tasks" className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--blue)]">Review task queue <Icon name="arrowRight" className="size-4" /></Link></div></section>
    <section className="grid gap-6 xl:grid-cols-2"><TodaysTasks items={tasks} /><RecentActivity items={activities} /></section>
    {showAiInsights ? <section className="relative overflow-hidden rounded-2xl border border-[#cfdcf0] bg-[linear-gradient(115deg,#f7faff_0%,#fff_65%)] p-5 sm:p-6"><div className="absolute right-0 top-0 h-40 w-48 bg-[radial-gradient(circle_at_top_right,#dbe8ff,transparent_70%)]" /><div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-4"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#e8f1ff] text-[#2563eb]"><Icon name="sparkle" className="size-5" /></span><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#3975d5]">Optional AI insights</p><h2 className="mt-1 text-lg font-semibold text-[#253047]">Review cited team signals</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-[#667085]">Generate daily summaries, blocker signals and workload suggestions from approved TeamFlow records. Nothing is changed automatically.</p></div></div><Link href="/dashboard/ai-assistant" className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#172033] px-4 text-sm font-semibold text-white">Open evidence desk <Icon name="arrowRight" className="size-4" /></Link></div></section> : null}
  </div>;
}

function SummaryRow({ label, value }: { label: string; value: number }) { return <div className="flex items-center justify-between border-b border-[var(--line)] py-3 last:border-0"><span className="text-sm text-[var(--muted)]">{label}</span><span className="font-mono text-sm font-semibold text-[var(--ink)]">{value}</span></div>; }
