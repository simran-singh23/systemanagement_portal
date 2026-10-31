import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { KanbanBoard, type KanbanTask } from "@/components/tasks/kanban-board";
import { TaskDetailsDrawer, type TaskDetailsData } from "@/components/tasks/task-details-drawer";
import { Icon } from "@/components/ui/icons";
import { requireCurrentOrganization } from "@/lib/dal/auth";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Task board" };

export default async function TaskBoardPage({ searchParams }: { searchParams: Promise<{ task?: string }> }) {
  const [{ user, organization, membership }, filters] = await Promise.all([requireCurrentOrganization("tasks:manage"), searchParams]);
  const role = membership?.role ?? user.role;
  const scope: Prisma.TaskWhereInput = { organizationId: organization.id, archivedAt: null, ...(role === "TEAM_LEAD" ? { team: { managerId: user.id } } : {}) };
  const [tasks, detail, activity] = await Promise.all([
    prisma.task.findMany({ where: { ...scope, status: { in: ["TODO", "IN_PROGRESS", "BLOCKED", "REVIEW", "COMPLETED"] } }, select: { id: true, title: true, description: true, priority: true, status: true, dueAt: true, estimatedMins: true, position: true, assignedTo: { select: { name: true, email: true } }, team: { select: { name: true, color: true } } }, orderBy: [{ status: "asc" }, { position: "asc" }] }),
    filters.task ? prisma.task.findFirst({ where: { ...scope, id: filters.task }, include: { assignedTo: { select: { name: true, email: true } }, createdBy: { select: { name: true, email: true } }, team: { select: { name: true } }, comments: { include: { author: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: "asc" } }, attachments: { orderBy: { createdAt: "desc" } } } }) : null,
    filters.task ? prisma.activityLog.findMany({ where: { organizationId: organization.id, entityType: "task", entityId: filters.task }, include: { actor: { select: { name: true, email: true } } }, orderBy: { createdAt: "desc" }, take: 12 }) : [],
  ]);
  const boardTasks: KanbanTask[] = tasks.map((task) => ({ ...task, dueAt: task.dueAt?.toISOString() || null }));
  const taskDetails: TaskDetailsData | null = detail ? { id: detail.id, title: detail.title, description: detail.description, priority: detail.priority, status: detail.status, startAt: detail.startAt?.toISOString() || null, dueAt: detail.dueAt?.toISOString() || null, estimatedMins: detail.estimatedMins, assignedTo: detail.assignedTo, createdBy: detail.createdBy, team: detail.team, comments: detail.comments.map((comment) => ({ ...comment, createdAt: comment.createdAt.toISOString(), editedAt: comment.editedAt?.toISOString() || null })), attachments: detail.attachments.map((file) => ({ ...file, createdAt: file.createdAt.toISOString() })), activity: activity.map((item) => ({ id: item.id, action: item.action, createdAt: item.createdAt.toISOString(), actor: item.actor })) } : null;

  return <div className="min-w-0 space-y-5"><section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-3xl font-semibold tracking-[-0.045em] text-[#172033]">Task board</h1><p className="mt-2 text-sm text-[#667085]">Move work through the delivery flow, or use each card&apos;s status menu.</p></div><div className="flex items-center gap-2"><Link href="/dashboard/tasks" className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#dfe4eb] bg-white px-4 text-sm font-semibold text-[#536071]"><Icon name="tasks" className="size-4" /> List</Link><span className="inline-flex h-10 items-center rounded-xl bg-[#172033] px-4 text-sm font-semibold text-white">Board</span></div></section><div className="rounded-2xl border border-[#e3e8ef] bg-white p-3 sm:p-4"><KanbanBoard tasks={boardTasks} /></div>{taskDetails ? <TaskDetailsDrawer task={taskDetails} closeHref="/dashboard/tasks/board" currentUserId={user.id} canEdit canModerate /> : null}</div>;
}
