import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma, TaskPriority } from "@prisma/client";
import { Icon } from "@/components/ui/icons";
import { StatCard } from "@/components/dashboard/stat-card";
import { TodaysTasks, type TaskItem } from "@/components/dashboard/todays-tasks";
import { requireCurrentOrganization } from "@/lib/dal/auth";
import { databaseDate, dateKeyInZone, dayRangeInZone } from "@/lib/date-time";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Manager dashboard" };

function priority(value: TaskPriority): TaskItem["priority"] { return value === "URGENT" || value === "HIGH" ? "High" : value === "MEDIUM" ? "Medium" : "Low"; }

export default async function ManagerDashboard() {
  const { user, organization, membership } = await requireCurrentOrganization("attendance:read-all");
  const role = membership?.role ?? user.role;
  const now = new Date();
  const settings = await prisma.organizationSettings.findUnique({ where: { organizationId: organization.id }, select: { timezone: true } });
  const timezone = settings?.timezone ?? "Asia/Kolkata";
  const todayKey = dateKeyInZone(now, timezone);
  const todayDate = databaseDate(todayKey);
  const today = dayRangeInZone(todayKey, timezone);
  const monthStart = new Date(`${todayKey.slice(0, 7)}-01T00:00:00.000Z`);
  const teamScope: Prisma.TaskWhereInput = role === "TEAM_LEAD" ? { team: { managerId: user.id } } : {};
  const memberScope: Prisma.OrganizationMemberWhereInput = role === "TEAM_LEAD" ? { user: { teamMembers: { some: { team: { organizationId: organization.id, managerId: user.id } } } } } : {};
  const memberIds = role === "TEAM_LEAD" ? (await prisma.organizationMember.findMany({ where: { organizationId: organization.id, status: "ACTIVE", ...memberScope }, select: { userId: true } })).map((item) => item.userId) : undefined;
  const [members, present, completed, pendingReports, openTasks, reviewTasks, blockedTasks, dueTasks] = await Promise.all([
    prisma.organizationMember.count({ where: { organizationId: organization.id, status: "ACTIVE", ...memberScope } }),
    prisma.attendance.count({ where: { organizationId: organization.id, attendanceDate: todayDate, checkInAt: { not: null }, ...(memberIds ? { userId: { in: memberIds } } : {}) } }),
    prisma.task.count({ where: { organizationId: organization.id, completedAt: { gte: monthStart }, archivedAt: null, ...teamScope } }),
    prisma.dailyReport.count({ where: { organizationId: organization.id, reportDate: todayDate, status: "DRAFT", ...(memberIds ? { userId: { in: memberIds } } : {}) } }),
    prisma.task.count({ where: { organizationId: organization.id, status: { notIn: ["COMPLETED", "CANCELLED"] }, archivedAt: null, ...teamScope } }),
    prisma.task.count({ where: { organizationId: organization.id, status: "REVIEW", archivedAt: null, ...teamScope } }),
    prisma.task.count({ where: { organizationId: organization.id, status: "BLOCKED", archivedAt: null, ...teamScope } }),
    prisma.task.findMany({ where: { organizationId: organization.id, dueAt: { gte: today.start, lt: today.end }, archivedAt: null, ...teamScope }, include: { team: { select: { name: true } } }, orderBy: [{ status: "asc" }, { dueAt: "asc" }], take: 6 }),
  ]);

  const tasks: TaskItem[] = dueTasks.map((task) => ({ title: task.title, project: task.team?.name ?? "No team", time: task.dueAt?.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: timezone }) ?? "No time", priority: priority(task.priority), done: task.status === "COMPLETED" }));
  const firstName = user.name?.split(" ")[0] ?? "there";

  return <div className="space-y-6">
    <section className="tf-page-header"><div><p className="tf-eyebrow">{now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: timezone })}</p><h1 className="tf-page-title mt-2">Good {Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: timezone }).format(now)) < 12 ? "morning" : "afternoon"}, {firstName}</h1><p className="tf-page-description">A live view of today&apos;s people, work, and approvals.</p></div><Link href="/dashboard/tasks?create=1" className="tf-button-primary"><Icon name="plus" className="size-4" /> Create task</Link></section>
    <section aria-label="Team overview" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><StatCard label="Team members" value={String(members)} detail={`${present} checked in today`} icon="users" /><StatCard label="Tasks completed" value={String(completed)} detail="This month" icon="check" accent="green" /><StatCard label="Reports to review" value={String(pendingReports)} detail="Drafts for today" icon="file" accent="amber" /></section>
    <section className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(18rem,.7fr)]"><TodaysTasks items={tasks} /><div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 sm:p-6"><div className="flex items-start justify-between gap-3"><div><h2 className="text-base font-semibold text-[var(--ink)]">Needs attention</h2><p className="mt-1 text-sm text-[var(--muted)]">Tasks that need a decision</p></div><span className="grid size-9 place-items-center rounded-xl bg-[var(--blue-soft)] text-[var(--blue)]"><Icon name="tasks" className="size-4" /></span></div><div className="mt-4 space-y-1"><SummaryRow label="Open tasks" value={openTasks} /><SummaryRow label="Waiting for review" value={reviewTasks} /><SummaryRow label="Blocked" value={blockedTasks} /></div><Link href="/dashboard/tasks" className="mt-4 inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-[var(--blue)]">Open task board <Icon name="arrowRight" className="size-4" /></Link></div></section>
  </div>;
}

function SummaryRow({ label, value }: { label: string; value: number }) { return <div className="flex items-center justify-between border-b border-[var(--line)] py-3 last:border-0"><span className="text-sm text-[var(--muted)]">{label}</span><span className="font-mono text-sm font-semibold text-[var(--ink)]">{value}</span></div>; }
