import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Icon } from "@/components/ui/icons";
import { CompletionChart } from "@/components/dashboard/completion-chart";
import { TaskDistribution, TeamActivity } from "@/components/dashboard/overview-panels";
import styles from "@/components/dashboard/overview.module.css";
import { PriorityTasks, type PriorityTask } from "@/components/dashboard/priority-tasks";
import { requireCurrentOrganization } from "@/lib/dal/auth";
import { databaseDate, dateKeyInZone, dayRangeInZone, shiftDateKey } from "@/lib/date-time";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Manager dashboard" };

export default async function ManagerDashboard() {
  const { user, organization, membership } = await requireCurrentOrganization("attendance:read-all");
  const role = membership?.role ?? user.role;
  const now = new Date();
  const settings = await prisma.organizationSettings.findUnique({ where: { organizationId: organization.id }, select: { timezone: true } });
  const timezone = settings?.timezone ?? "Asia/Kolkata";
  const todayKey = dateKeyInZone(now, timezone);
  const todayDate = databaseDate(todayKey);
  const today = dayRangeInZone(todayKey, timezone);
  const monthStart = dayRangeInZone(`${todayKey.slice(0, 7)}-01`, timezone).start;
  const trendStart = dayRangeInZone(shiftDateKey(todayKey, -29), timezone).start;
  const teamScope: Prisma.TaskWhereInput = role === "TEAM_LEAD" ? { team: { managerId: user.id } } : {};
  const memberScope: Prisma.OrganizationMemberWhereInput = { user: { status: "ACTIVE", ...(role === "TEAM_LEAD" ? { teamMembers: { some: { team: { organizationId: organization.id, managerId: user.id } } } } : {}) } };
  const memberIds = (await prisma.organizationMember.findMany({ where: { organizationId: organization.id, status: "ACTIVE", user: { status: "ACTIVE" }, ...memberScope }, select: { userId: true } })).map((item) => item.userId);
  const [members, present, completed, pendingReports, openTasks, reviewTasks, blockedTasks, priorityTasks, teamCounts, chartTasks, recentTasks, teams, overdueTasks, attentionTasks] = await Promise.all([
    prisma.organizationMember.count({ where: { organizationId: organization.id, status: "ACTIVE", user: { status: "ACTIVE" }, ...memberScope } }),
    prisma.attendance.count({ where: { organizationId: organization.id, attendanceDate: todayDate, checkInAt: { not: null }, ...(memberIds ? { userId: { in: memberIds } } : {}) } }),
    prisma.task.count({ where: { organizationId: organization.id, status: "COMPLETED", completedAt: { gte: monthStart, lt: today.end }, archivedAt: null, ...teamScope } }),
    prisma.dailyReport.count({ where: { organizationId: organization.id, reportDate: todayDate, status: "SUBMITTED", ...(memberIds ? { userId: { in: memberIds } } : {}) } }),
    prisma.task.count({ where: { organizationId: organization.id, status: { notIn: ["COMPLETED", "CANCELLED"] }, archivedAt: null, ...teamScope } }),
    prisma.task.count({ where: { organizationId: organization.id, status: "REVIEW", archivedAt: null, ...teamScope } }),
    prisma.task.count({ where: { organizationId: organization.id, status: "BLOCKED", archivedAt: null, ...teamScope } }),
    prisma.task.findMany({ where: { organizationId: organization.id, status: { not: "CANCELLED" }, archivedAt: null, ...teamScope }, include: { team: { select: { name: true } }, assignedTo: { select: { name: true, email: true } } }, orderBy: [{ status: "asc" }, { priority: "desc" }, { dueAt: "asc" }, { id: "asc" }], take: 12 }),
    prisma.task.groupBy({ where: { organizationId: organization.id, archivedAt: null, status: { notIn: ["COMPLETED", "CANCELLED"] }, ...teamScope }, by: ["teamId"], _count: { _all: true } }),
    prisma.task.findMany({ where: { organizationId: organization.id, archivedAt: null, status: { not: "CANCELLED" }, OR: [{ completedAt: { gte: trendStart, lt: today.end } }, { dueAt: { gte: trendStart, lt: today.end } }], ...teamScope }, select: { completedAt: true, dueAt: true, status: true } }),
    prisma.task.findMany({ where: { organizationId: organization.id, archivedAt: null, ...teamScope }, select: { id: true, title: true, status: true, updatedAt: true, assignedTo: { select: { name: true, email: true, image: true } }, team: { select: { name: true } } }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: 5 }),
    prisma.team.findMany({ where: { organizationId: organization.id, ...(role === "TEAM_LEAD" ? { managerId: user.id } : {}) }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.task.count({ where: { organizationId: organization.id, archivedAt: null, status: { notIn: ["COMPLETED", "CANCELLED"] }, dueAt: { lt: now }, ...teamScope } }),
    prisma.task.count({ where: { organizationId: organization.id, archivedAt: null, status: { notIn: ["COMPLETED", "CANCELLED"] }, OR: [{ status: "BLOCKED" }, { dueAt: { lt: now } }], ...teamScope } }),
  ]);

  const palette = ["var(--blue)", "var(--distribution-neutral)", "var(--green)", "var(--amber)", "var(--violet)"];
  const distribution = teamCounts.map((row, index) => ({ id: row.teamId ?? "unassigned", label: teams.find((team) => team.id === row.teamId)?.name ?? "Unassigned", count: row._count._all, color: palette[index % palette.length], href: row.teamId ? `/dashboard/tasks?team=${row.teamId}` : undefined })).sort((a, b) => b.count - a.count);
  const days = Array.from({ length: 30 }, (_, index) => {
    const date = shiftDateKey(todayKey, index - 29);
    const value = databaseDate(date);
    return { date, label: value.toLocaleDateString("en-GB", { day: "numeric", timeZone: "UTC" }), fullLabel: value.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }), count: 0, due: 0 };
  });
  const dayMap = new Map(days.map((day) => [day.date, day]));
  for (const task of chartTasks) {
    if (task.completedAt && task.status === "COMPLETED") { const day = dayMap.get(dateKeyInZone(task.completedAt, timezone)); if (day) day.count += 1; }
    if (task.dueAt) { const day = dayMap.get(dateKeyInZone(task.dueAt, timezone)); if (day) day.due += 1; }
  }
  const tasks: PriorityTask[] = priorityTasks.map((task) => ({ id: task.id, title: task.title, status: task.status, team: task.team?.name ?? "No team", assignee: task.assignedTo?.name ?? task.assignedTo?.email ?? "Unassigned", deadline: task.dueAt ? task.dueAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: timezone }) : "No deadline", overdue: Boolean(task.dueAt && task.dueAt < now && task.status !== "COMPLETED") }));
  const firstName = user.name?.split(" ")[0] ?? "there";
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: timezone }).format(now));
  const greeting = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const attendanceRate = members ? Math.round(present / members * 100) : 0;

  return <div className={styles.overview}>
    <section className={styles.header}>
      <div><div className={styles.greeting}><h1>Good {greeting}, {firstName}</h1><span className={styles.activeBadge}><span />Active</span></div><p className={styles.description}>{now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: timezone })}<span className={styles.dateDivider}>·</span>{organization.name}</p></div>
      <div className={styles.headerActions}><Link href="/dashboard/tasks/board" className={styles.secondaryButton}><Icon name="dashboard" className="size-4" />Task board</Link><Link href="/dashboard/tasks?create=1" className="tf-button-primary"><Icon name="plus" className="size-4" />Create task</Link></div>
    </section>

    <section aria-label="Team overview" className={styles.stats}>
      <Metric label="Active tasks" value={String(openTasks)} detail="Across your team’s current work" icon="tasks" href="/dashboard/tasks/board" featured />
      <Metric label="Completed this month" value={String(completed)} detail="Completed since the first of this month" icon="check" href="/dashboard/tasks?status=COMPLETED" tone="green" />
      <Metric label="Team attendance" value={`${attendanceRate}%`} detail={`${present} of ${members} checked in today`} icon="users" href="/dashboard/attendance" />
      <Metric label="Overdue & blocked" value={String(attentionTasks)} detail={`${blockedTasks} blocked · ${overdueTasks} overdue`} icon="bell" href="/dashboard/tasks/board" tone="amber" />
    </section>

    <div className={styles.chartGrid}><CompletionChart days={days} /><TaskDistribution items={distribution} /></div>

    <div className={styles.workGrid}>
      <PriorityTasks items={tasks} />
      <div className={styles.sideStack}>
        <section className={styles.panel} aria-labelledby="attention-title">
          <div className={styles.panelHeading}><div><h2 id="attention-title">Needs attention</h2><p className={styles.description}>Decisions that keep work moving</p></div><span className={`${styles.metricIcon} ${styles.amber}`}><Icon name="bell" className="size-4" /></span></div>
          <div className={styles.attention}><ActionRow label="Overdue tasks" value={overdueTasks} href="/dashboard/tasks?deadline=overdue" /><ActionRow label="Reports to review" value={pendingReports} href={`/dashboard/reports?status=SUBMITTED&date=${todayKey}`} /><ActionRow label="Tasks waiting for review" value={reviewTasks} href="/dashboard/tasks?status=REVIEW" /><ActionRow label="Blocked tasks" value={blockedTasks} href="/dashboard/tasks?status=BLOCKED" /></div>
          <p className={styles.panelNote}>{pendingReports + reviewTasks + blockedTasks + overdueTasks ? "A few decisions can help your team move forward." : "You’re all caught up. No decisions waiting here."}</p>
        </section>
        <TeamActivity items={recentTasks} timezone={timezone} />
      </div>
    </div>
  </div>;
}

function Metric({ label, value, detail, icon, href, tone, featured }: { label: string; value: string; detail: string; icon: "users" | "tasks" | "check" | "bell"; href: string; tone?: "green" | "amber"; featured?: boolean }) {
  return <Link href={href} className={`${styles.metric} ${featured ? styles.featuredMetric : ""}`}><div className={styles.metricTop}><span>{label}</span><span className={`${styles.metricIcon} ${tone ? styles[tone] : ""}`}><Icon name={icon} className="size-4" /></span></div><strong>{value}</strong><span className={styles.metricDetail}>{detail}</span></Link>;
}

function ActionRow({ label, value, href }: { label: string; value: number; href: string }) {
  return <Link href={href}><span>{label}</span><strong>{value}<Icon name="arrowRight" className="size-3.5" /></strong></Link>;
}
