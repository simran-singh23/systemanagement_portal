import "server-only";
import type { Prisma } from "@prisma/client";
import type { TaskDetailsData } from "@/components/tasks/task-details-drawer";

export const taskDetailsInclude = {
  assignedTo: { select: { name: true, email: true } },
  createdBy: { select: { name: true, email: true } },
  team: { select: { name: true } },
  comments: { include: { author: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: "asc" } },
  attachments: { orderBy: { createdAt: "desc" } },
} as const satisfies Prisma.TaskInclude;

type TaskDetail = Prisma.TaskGetPayload<{ include: typeof taskDetailsInclude }>;
type Activity = { id: string; action: string; createdAt: Date; actor: { name: string | null; email: string } | null };

export function taskDetailsData(task: TaskDetail, activity: Activity[], timezone = "Asia/Kolkata"): TaskDetailsData {
  return {
    id: task.id, title: task.title, description: task.description, priority: task.priority, status: task.status, timezone,
    startAt: task.startAt?.toISOString() ?? null, dueAt: task.dueAt?.toISOString() ?? null, estimatedMins: task.estimatedMins,
    assignedTo: task.assignedTo, createdBy: task.createdBy, team: task.team,
    comments: task.comments.map((comment) => ({ ...comment, createdAt: comment.createdAt.toISOString(), editedAt: comment.editedAt?.toISOString() ?? null })),
    attachments: task.attachments.map((file) => ({ ...file, createdAt: file.createdAt.toISOString() })),
    activity: activity.map((item) => ({ id: item.id, action: item.action, actor: item.actor, createdAt: item.createdAt.toISOString() })),
  };
}
