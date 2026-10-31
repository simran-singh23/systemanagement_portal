import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { KanbanBoard, type KanbanTask } from "@/components/tasks/kanban-board";
import { TaskDetailsDrawer } from "@/components/tasks/task-details-drawer";
import { Icon } from "@/components/ui/icons";
import { requireCurrentOrganization } from "@/lib/dal/auth";
import { prisma } from "@/lib/prisma";
import { taskDetailsData, taskDetailsInclude } from "@/lib/task-details";

export const metadata: Metadata = { title: "Task board" };

export default async function TaskBoardPage({ searchParams }: { searchParams: Promise<{ task?: string }> }) {
  const [{ user, organization, membership }, filters] = await Promise.all([requireCurrentOrganization("tasks:manage"), searchParams]);
  const role = membership?.role ?? user.role;
  const scope: Prisma.TaskWhereInput = { organizationId: organization.id, archivedAt: null, ...(role === "TEAM_LEAD" ? { team: { managerId: user.id } } : {}) };
  const [tasks, detail, activity, settings] = await Promise.all([
    prisma.task.findMany({ where: { ...scope, status: { in: ["TODO", "IN_PROGRESS", "BLOCKED", "REVIEW", "COMPLETED"] } }, select: { id: true, title: true, description: true, priority: true, status: true, dueAt: true, estimatedMins: true, position: true, updatedAt: true, assignedTo: { select: { name: true, email: true } }, team: { select: { name: true, color: true } } }, orderBy: [{ status: "asc" }, { position: "asc" }] }),
    filters.task ? prisma.task.findFirst({ where: { ...scope, id: filters.task }, include: taskDetailsInclude }) : null,
    filters.task ? prisma.activityLog.findMany({ where: { organizationId: organization.id, entityType: "task", entityId: filters.task }, include: { actor: { select: { name: true, email: true } } }, orderBy: { createdAt: "desc" }, take: 12 }) : [],
    prisma.organizationSettings.findUnique({ where: { organizationId: organization.id }, select: { timezone: true } }),
  ]);
  const boardTasks: KanbanTask[] = tasks.map((task) => ({ ...task, dueAt: task.dueAt?.toISOString() || null }));
  const taskDetails = detail ? taskDetailsData(detail, activity, settings?.timezone ?? "Asia/Kolkata") : null;

  return <div className="min-w-0 space-y-5"><section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-3xl font-semibold tracking-[-0.045em] text-[#172033]">Task board</h1><p className="mt-2 text-sm text-[#667085]">Move work through the delivery flow, or use each card&apos;s status menu.</p></div><div className="flex items-center gap-2"><Link href="/dashboard/tasks" className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#dfe4eb] bg-white px-4 text-sm font-semibold text-[#536071]"><Icon name="tasks" className="size-4" /> List</Link><span className="inline-flex h-10 items-center rounded-xl bg-[#172033] px-4 text-sm font-semibold text-white">Board</span></div></section><div className="rounded-2xl border border-[#e3e8ef] bg-white p-3 sm:p-4"><KanbanBoard timezone={settings?.timezone ?? "Asia/Kolkata"} key={tasks.map((task) => `${task.id}:${task.updatedAt.toISOString()}`).join("|")} tasks={boardTasks} /></div>{taskDetails ? <TaskDetailsDrawer task={taskDetails} closeHref="/dashboard/tasks/board" currentUserId={user.id} canEdit canModerate /> : null}</div>;
}
