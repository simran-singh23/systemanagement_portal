import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma, TaskPriority, TaskStatus } from "@prisma/client";
import { ArchiveTaskButton } from "@/components/tasks/archive-task-button";
import { formatTaskDate, isOverdue, PriorityBadge, StatusBadge } from "@/components/tasks/task-badges";
import { TaskDrawer, type TaskFormInitial } from "@/components/tasks/task-drawer";
import { Icon } from "@/components/ui/icons";
import { ActiveFilterChips, FilterDropdown, PaginationControls, SortSelector } from "@/components/search/table-controls";
import { requireCurrentOrganization } from "@/lib/dal/auth";
import { prisma } from "@/lib/prisma";
import { allowedValue, boundedPage, parsePagination, safeQuery } from "@/lib/search/params";
import { taskDeadlineWindows } from "@/lib/task-deadlines";
import { taskDateInput } from "@/lib/task-dates";
import { taskDetailsData, taskDetailsInclude } from "@/lib/task-details";
import { TaskDetailsDrawer } from "@/components/tasks/task-details-drawer";

export const metadata: Metadata = { title: "Task management" };
type Search = { q?: string; status?: string; priority?: string; employee?: string; team?: string; deadline?: string; sort?: string; page?: string; pageSize?: string; create?: string; edit?: string; task?: string };
const statuses = new Set(["TODO", "IN_PROGRESS", "BLOCKED", "REVIEW", "COMPLETED"]);
const priorities = new Set(["LOW", "MEDIUM", "HIGH", "URGENT"]);

export default async function TasksPage({ searchParams }: { searchParams: Promise<Search> }) {
  const [{ user, organization, membership }, filters] = await Promise.all([requireCurrentOrganization("tasks:manage"), searchParams]);
  const effectiveRole = membership?.role ?? user.role;
  const q = safeQuery(filters.q);
  const pagination = parsePagination(filters);
  const sort = allowedValue(filters.sort, ["newest", "oldest", "due_asc", "due_desc", "priority_desc", "status"] as const) ?? "due_asc";
  const status = statuses.has(filters.status || "") ? filters.status as TaskStatus : undefined;
  const priority = priorities.has(filters.priority || "") ? filters.priority as TaskPriority : undefined;
  const now = new Date();
  const settings = await prisma.organizationSettings.findUnique({ where: { organizationId: organization.id }, select: { timezone: true } });
  const deadlineWindows = taskDeadlineWindows(now, settings?.timezone ?? "Asia/Kolkata");
  const scope: Prisma.TaskWhereInput = { organizationId: organization.id, archivedAt: null, ...(effectiveRole === "TEAM_LEAD" ? { team: { managerId: user.id } } : {}) };
  const deadline: Prisma.TaskWhereInput = filters.deadline === "overdue" ? { dueAt: { lt: now }, status: { notIn: ["COMPLETED", "CANCELLED"] } } : filters.deadline === "today" ? { dueAt: { gte: now, lt: deadlineWindows.today.end } } : filters.deadline === "week" ? { dueAt: { gte: now, lt: deadlineWindows.nextSevenDays.end } } : filters.deadline === "none" ? { dueAt: null } : {};
  const where: Prisma.TaskWhereInput = { ...scope, ...deadline, ...(status ? { status } : {}), ...(priority ? { priority } : {}), ...(filters.employee ? { assignedToId: filters.employee } : {}), ...(filters.team ? { teamId: filters.team } : {}), ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] } : {}) };
  const orderBy: Prisma.TaskOrderByWithRelationInput[] = sort === "newest" ? [{ createdAt: "desc" }, { id: "asc" }] : sort === "oldest" ? [{ createdAt: "asc" }, { id: "asc" }] : sort === "due_desc" ? [{ dueAt: "desc" }, { id: "asc" }] : sort === "priority_desc" ? [{ priority: "desc" }, { createdAt: "desc" }, { id: "asc" }] : sort === "status" ? [{ status: "asc" }, { createdAt: "desc" }, { id: "asc" }] : [{ dueAt: "asc" }, { createdAt: "desc" }, { id: "asc" }];

  const [initialTasks, teams, memberships, statusCounts, overdueCount, editTask, filteredCount, detail] = await Promise.all([
    prisma.task.findMany({ where, include: { assignedTo: { select: { id: true, name: true, email: true } }, team: { select: { id: true, name: true, color: true } }, _count: { select: { comments: true, attachments: true } } }, orderBy, skip: pagination.skip, take: pagination.pageSize }),
    prisma.team.findMany({ where: { organizationId: organization.id, ...(effectiveRole === "TEAM_LEAD" ? { managerId: user.id } : {}) }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.organizationMember.findMany({ where: { organizationId: organization.id, status: "ACTIVE", user: { status: "ACTIVE" }, role: { not: "SUPER_ADMIN" } }, include: { user: { select: { id: true, name: true, email: true, teamMembers: { where: { team: { organizationId: organization.id } }, select: { teamId: true } } } } }, orderBy: { user: { name: "asc" } } }),
    prisma.task.groupBy({ where: scope, by: ["status"], _count: { _all: true } }),
    prisma.task.count({ where: { ...scope, dueAt: { lt: now }, status: { notIn: ["COMPLETED", "CANCELLED"] } } }),
    filters.edit ? prisma.task.findFirst({ where: { ...scope, id: filters.edit } }) : null,
    prisma.task.count({ where }),
    filters.task ? prisma.task.findFirst({ where: { ...scope, id: filters.task }, include: taskDetailsInclude }) : null,
  ]);
  const pageInfo = boundedPage(pagination.page, filteredCount, pagination.pageSize);
  const tasks = pageInfo.page === pagination.page ? initialTasks : await prisma.task.findMany({ where, include: { assignedTo: { select: { id: true, name: true, email: true } }, team: { select: { id: true, name: true, color: true } }, _count: { select: { comments: true, attachments: true } } }, orderBy, skip: (pageInfo.page - 1) * pagination.pageSize, take: pagination.pageSize });
  const counts = Object.fromEntries(statusCounts.map((item) => [item.status, item._count._all]));
  const total = statusCounts.reduce((sum, item) => sum + item._count._all, 0);
  const employees = memberships.map((item) => ({ id: item.userId, name: item.user.name || item.user.email, email: item.user.email, teamIds: item.user.teamMembers.map((team) => team.teamId) }));
  const canArchive = effectiveRole === "SUPER_ADMIN" || effectiveRole === "PRODUCT_MANAGER";
  const timezone = settings?.timezone ?? "Asia/Kolkata";
  const initial: TaskFormInitial | undefined = editTask ? { id: editTask.id, updatedAt: editTask.updatedAt.toISOString(), title: editTask.title, description: editTask.description || "", assignedToId: editTask.assignedToId || "", teamId: editTask.teamId || "", priority: editTask.priority, status: editTask.status, startDate: taskDateInput(editTask.startAt, timezone), dueDate: taskDateInput(editTask.dueAt, timezone), estimatedHours: editTask.estimatedMins ? String(editTask.estimatedMins / 60) : "" } : undefined;
  const activity = detail ? await prisma.activityLog.findMany({ where: { organizationId: organization.id, entityType: "task", entityId: detail.id }, include: { actor: { select: { name: true, email: true } } }, orderBy: { createdAt: "desc" }, take: 12 }) : [];

  return <div className="space-y-6">
    <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-3xl font-semibold tracking-[-0.045em] text-[#172033]">Task Management</h1><p className="mt-2 text-sm text-[#667085]">Manage, assign and track your team&apos;s work.</p></div><div className="flex items-center gap-2"><Link href="/dashboard/tasks/board" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#dfe4eb] bg-white px-4 text-sm font-semibold text-[#536071] hover:border-[#b8cdf7]"><Icon name="dashboard" className="size-4" /> Board</Link><Link href="/dashboard/tasks?create=1" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#2563eb] px-4 text-sm font-semibold text-white shadow-[0_6px_16px_rgba(37,99,235,0.2)] hover:bg-[#1f58d2]"><Icon name="plus" className="size-4" /> Create task</Link></div></section>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><TaskStat label="Total tasks" value={total} detail="Active work items" color="#2563eb" /><TaskStat label="In progress" value={counts.IN_PROGRESS || 0} detail="Moving now" color="#3975db" /><TaskStat label="Completed" value={counts.COMPLETED || 0} detail="Delivered" color="#1f9d74" /><TaskStat label="Overdue" value={overdueCount} detail="Needs attention" color="#d24b40" /></section>
    <section className="overflow-hidden rounded-2xl border border-[#e6eaf0] bg-white">
      <form className="grid gap-3 border-b border-[#edf0f4] p-4 sm:grid-cols-2 xl:grid-cols-[minmax(14rem,1fr)_repeat(6,minmax(7.5rem,.42fr))_auto]">
        <input type="hidden" name="pageSize" value={pagination.pageSize} />
        <label className="relative sm:col-span-2 xl:col-span-1"><span className="sr-only">Search tasks</span><Icon name="search" className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-[#98a2b3]" /><input name="q" defaultValue={q} placeholder="Search task title or description" className="h-11 w-full rounded-xl border border-[#dfe4eb] pl-10 pr-3 text-sm outline-none focus:border-[#80a7f5] focus:ring-4 focus:ring-[#eef4ff]" /></label>
        <TaskFilter name="status" label="All statuses" value={status} options={[["TODO", "To do"], ["IN_PROGRESS", "In progress"], ["BLOCKED", "Blocked"], ["REVIEW", "In review"], ["COMPLETED", "Completed"]]} /><TaskFilter name="priority" label="All priorities" value={priority} options={[["LOW", "Low"], ["MEDIUM", "Medium"], ["HIGH", "High"], ["URGENT", "Urgent"]]} /><TaskFilter name="employee" label="All employees" value={filters.employee} options={employees.map((employee) => [employee.id, employee.name])} /><TaskFilter name="deadline" label="Any deadline" value={filters.deadline} options={[["today", "Due today"], ["week", "Next 7 days"], ["overdue", "Overdue"], ["none", "No deadline"]]} />
        <FilterDropdown name="team" label="All teams" value={filters.team} options={teams.map((team) => [team.id, team.name])} />
        <SortSelector value={sort} options={[["due_asc", "Due date ↑"], ["due_desc", "Due date ↓"], ["newest", "Newest first"], ["oldest", "Oldest first"], ["priority_desc", "Priority"], ["status", "Status"]]} />
        <div className="flex gap-2"><button className="h-11 rounded-xl bg-[#172033] px-4 text-sm font-semibold text-white">Apply</button><Link href="/dashboard/tasks" aria-label="Clear filters" className="grid size-11 place-items-center rounded-xl border border-[#dfe4eb] text-[#667085]"><Icon name="x" className="size-4" /></Link></div>
      </form>
      <ActiveFilterChips pathname="/dashboard/tasks" params={filters} filters={[{ key: "q", label: "Search", value: q }, { key: "status", label: "Status", value: status }, { key: "priority", label: "Priority", value: priority }, { key: "team", label: "Team", value: teams.find((team) => team.id === filters.team)?.name }, { key: "employee", label: "Employee", value: employees.find((employee) => employee.id === filters.employee)?.name }, { key: "deadline", label: "Deadline", value: filters.deadline }]} />
      <div className="hidden overflow-x-auto lg:block"><table className="w-full min-w-[940px] text-left"><thead><tr className="bg-[#fafbfc] text-[11px] font-semibold text-[#98a2b3]"><th className="px-6 py-3.5">Task</th><th className="px-4 py-3.5">Assignee</th><th className="px-4 py-3.5">Status</th><th className="px-4 py-3.5">Priority</th><th className="px-4 py-3.5">Deadline</th><th className="px-6 py-3.5 text-right">Actions</th></tr></thead><tbody className="divide-y divide-[#edf0f4]">{tasks.map((task) => <tr key={task.id} className="group hover:bg-[#fbfcff]"><td className="px-6 py-4"><div className="flex gap-3"><span className="mt-1 h-9 w-1 shrink-0 rounded-full" style={{ backgroundColor: task.team?.color || "#cbd5e1" }} /><div><Link href={`/dashboard/tasks?task=${task.id}`} className="text-sm font-semibold text-[#253047] hover:text-[#2563eb]">{task.title}</Link><p className="mt-1 max-w-sm truncate text-xs text-[#98a2b3]">{task.team?.name || "No team"}{task.estimatedMins ? ` · ${task.estimatedMins / 60}h estimate` : ""}</p></div></div></td><td className="px-4 py-4 text-sm text-[#667085]">{task.assignedTo?.name || task.assignedTo?.email || "Unassigned"}</td><td className="px-4 py-4"><StatusBadge status={task.status} /></td><td className="px-4 py-4"><PriorityBadge priority={task.priority} /></td><td className={`px-4 py-4 text-sm ${isOverdue(task.dueAt, task.status) ? "font-semibold text-[#b42318]" : "text-[#667085]"}`}>{formatTaskDate(task.dueAt, timezone)}</td><td className="px-6 py-4"><div className="flex items-center justify-end gap-3"><Link href={`/dashboard/tasks?edit=${task.id}`} className="text-xs font-semibold text-[#2563eb]">Edit</Link>{canArchive ? <ArchiveTaskButton organizationId={organization.id} taskId={task.id} /> : null}</div></td></tr>)}</tbody></table></div>
      <div className="divide-y divide-[#edf0f4] lg:hidden">{tasks.map((task) => <article key={task.id} className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><Link href={`/dashboard/tasks?task=${task.id}`} className="font-semibold text-[#253047]">{task.title}</Link><p className="mt-1 truncate text-xs text-[#98a2b3]">{task.assignedTo?.name || "Unassigned"} · {task.team?.name || "No team"}</p></div><PriorityBadge priority={task.priority} /></div><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><StatusBadge status={task.status} /><span className={`text-xs ${isOverdue(task.dueAt, task.status) ? "font-semibold text-[#b42318]" : "text-[#7c8799]"}`}>{formatTaskDate(task.dueAt, timezone)}</span></div><div className="flex gap-3"><Link href={`/dashboard/tasks?edit=${task.id}`} className="text-xs font-semibold text-[#2563eb]">Edit</Link>{canArchive ? <ArchiveTaskButton organizationId={organization.id} taskId={task.id} /> : null}</div></div></article>)}</div>
      {!tasks.length && <div className="px-6 py-16 text-center"><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#eef4ff] text-[#2563eb]"><Icon name="tasks" className="size-5" /></span><h2 className="mt-4 font-semibold text-[#253047]">No tasks in this view</h2><p className="mt-1 text-sm text-[#7c8799]">Clear a filter or create a task to start the work queue.</p></div>}
      <PaginationControls pathname="/dashboard/tasks" params={filters} page={pageInfo.page} pageSize={pagination.pageSize} total={filteredCount} pages={pageInfo.pages} />
    </section>
    {(filters.create === "1" || initial) ? <TaskDrawer key={initial?.id ?? "new-task"} organizationId={organization.id} employees={employees} teams={teams} initial={initial} timezone={timezone} /> : null}
    {detail && !initial && filters.create !== "1" ? <TaskDetailsDrawer task={taskDetailsData(detail, activity, timezone)} closeHref="/dashboard/tasks" currentUserId={user.id} canEdit canModerate /> : null}
  </div>;
}

function TaskStat({ label, value, detail, color }: { label: string; value: number; detail: string; color: string }) { return <div className="relative overflow-hidden rounded-2xl border border-[#e6eaf0] bg-white p-5"><span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: color }} /><p className="text-xs font-medium text-[#7c8799]">{label}</p><div className="mt-2 flex items-end justify-between"><strong className="text-2xl font-semibold text-[#172033]">{value}</strong><span className="text-xs text-[#98a2b3]">{detail}</span></div></div>; }
function TaskFilter({ name, label, value, options }: { name: string; label: string; value?: string; options: [string, string][] }) { return <select aria-label={label} name={name} defaultValue={value || ""} className="h-11 min-w-0 rounded-xl border border-[#dfe4eb] bg-white px-3 text-sm text-[#475467] outline-none"><option value="">{label}</option>{options.map(([option, text]) => <option key={option} value={option}>{text}</option>)}</select>; }
