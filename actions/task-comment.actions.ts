"use server";

import { revalidatePath } from "next/cache";
import type { UserRole } from "@prisma/client";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/dal/auth";
import { taskCommentSchema, taskCommentUpdateSchema, type FormState } from "@/lib/validations";
import { createNotification } from "@/lib/notifications";

const field = (formData: FormData, name: string) => String(formData.get(name) ?? "");

async function taskAccess(taskId: string) {
  const user = await requireUser();
  const task = await prisma.task.findFirst({
    where: { id: taskId, archivedAt: null },
    include: {
      organization: { select: { ownerId: true } },
      team: { select: { managerId: true } },
    },
  });
  if (!task) return null;

  if (user.role === "SUPER_ADMIN" && task.organization.ownerId === user.id) return { task, user, canModerate: true };
  const membership = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: task.organizationId, userId: user.id } },
    select: { role: true, status: true },
  });
  if (!membership || membership.status !== "ACTIVE") return null;
  const role = membership.role as UserRole;
  const managerAccess = hasPermission(role, "tasks:manage") && (role !== "TEAM_LEAD" || task.team?.managerId === user.id);
  const collaboratorAccess = task.assignedToId === user.id || task.createdById === user.id;
  if (!managerAccess && !collaboratorAccess) return null;
  return { task, user, canModerate: managerAccess };
}

function refreshTask(taskId: string) {
  revalidatePath("/dashboard/tasks/board");
  revalidatePath("/dashboard/tasks");
  revalidatePath("/employee/tasks");
  revalidatePath(`/dashboard/tasks/board?task=${taskId}`);
}

export async function addTaskComment(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = taskCommentSchema.safeParse({ taskId: field(formData, "taskId"), body: field(formData, "body") });
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const access = await taskAccess(parsed.data.taskId);
  if (!access) return { message: "You do not have access to this task discussion." };

  await prisma.$transaction(async (tx) => {
    const comment = await tx.taskComment.create({ data: { taskId: access.task.id, authorId: access.user.id, body: parsed.data.body } });
    await tx.activityLog.create({ data: { organizationId: access.task.organizationId, actorId: access.user.id, action: "task.comment_added", entityType: "task", entityId: access.task.id, metadata: { commentId: comment.id } } });
    if (access.task.assignedToId && access.task.assignedToId !== access.user.id) await createNotification(tx, { organizationId: access.task.organizationId, userId: access.task.assignedToId, actorId: access.user.id, type: "COMMENT_MENTION", title: "New task comment", message: access.task.title, link: `/employee/tasks?task=${access.task.id}`, relatedEntityType: "task", relatedEntityId: access.task.id, eventId: `task.comment:${comment.id}:${access.task.assignedToId}`, metadata: { taskId: access.task.id, commentId: comment.id } });
    if (access.task.createdById !== access.user.id && access.task.createdById !== access.task.assignedToId) await createNotification(tx, { organizationId: access.task.organizationId, userId: access.task.createdById, actorId: access.user.id, type: "COMMENT_MENTION", title: "New task comment", message: access.task.title, link: `/dashboard/tasks/board?task=${access.task.id}`, relatedEntityType: "task", relatedEntityId: access.task.id, eventId: `task.comment:${comment.id}:${access.task.createdById}`, metadata: { taskId: access.task.id, commentId: comment.id } });
  });
  refreshTask(access.task.id);
  return { success: true, message: "Comment posted." };
}

export async function updateTaskComment(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = taskCommentUpdateSchema.safeParse({ taskId: field(formData, "taskId"), commentId: field(formData, "commentId"), body: field(formData, "body") });
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const access = await taskAccess(parsed.data.taskId);
  if (!access) return { message: "You do not have access to this task discussion." };
  const comment = await prisma.taskComment.findFirst({ where: { id: parsed.data.commentId, taskId: access.task.id }, select: { id: true, authorId: true } });
  if (!comment || comment.authorId !== access.user.id) return { message: "You can edit only your own comments." };

  await prisma.taskComment.update({ where: { id: comment.id }, data: { body: parsed.data.body, editedAt: new Date() } });
  refreshTask(access.task.id);
  return { success: true, message: "Comment updated." };
}

export async function deleteTaskComment(taskId: string, commentId: string): Promise<void> {
  const access = await taskAccess(taskId);
  if (!access) throw new Error("You do not have access to this task discussion.");
  const comment = await prisma.taskComment.findFirst({ where: { id: commentId, taskId }, select: { id: true, authorId: true } });
  if (!comment || (comment.authorId !== access.user.id && !access.canModerate)) throw new Error("You cannot delete this comment.");

  await prisma.$transaction([
    prisma.taskComment.delete({ where: { id: comment.id } }),
    prisma.activityLog.create({ data: { organizationId: access.task.organizationId, actorId: access.user.id, action: "task.comment_deleted", entityType: "task", entityId: taskId, metadata: { commentId } } }),
  ]);
  refreshTask(taskId);
}
