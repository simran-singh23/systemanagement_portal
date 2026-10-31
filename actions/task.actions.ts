"use server";

import { revalidatePath } from "next/cache";
import type { Prisma, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireOrganizationPermission, requirePermission } from "@/lib/dal/auth";
import { boardMoveSchema, employeeTaskStatusSchema, taskSchema, type FormState } from "@/lib/validations";
import { createNotification } from "@/lib/notifications";
import { validBoardSnapshot } from "@/lib/task-board-move";

export type BoardActionResult = { success: boolean; message?: string };

const field = (formData: FormData, name: string) => String(formData.get(name) ?? "");
async function lockTask(tx: Prisma.TransactionClient, taskId: string, organizationId: string) {
  await tx.$queryRaw`SELECT "id" FROM "tasks" WHERE "id" = ${taskId} AND "organization_id" = ${organizationId} FOR UPDATE`;
}

function parseTask(formData: FormData) {
  return taskSchema.safeParse({
    organizationId: field(formData, "organizationId"),
    title: field(formData, "title"),
    description: field(formData, "description"),
    assignedToId: field(formData, "assignedToId"),
    teamId: field(formData, "teamId"),
    priority: field(formData, "priority"),
    status: field(formData, "status"),
    startDate: field(formData, "startDate"),
    dueDate: field(formData, "dueDate"),
    estimatedHours: field(formData, "estimatedHours"),
  });
}

const toDate = (value?: string) => value ? new Date(value) : null;
const taskPaths = () => {
  revalidatePath("/dashboard/tasks");
  revalidatePath("/employee/tasks");
  revalidatePath("/dashboard");
  revalidatePath("/employee");
};

function effectiveRole(userRole: UserRole, membership: { role: UserRole } | null) {
  return membership?.role ?? userRole;
}

async function validateRelations(
  organizationId: string,
  teamId: string | undefined,
  assignedToId: string | undefined,
  actorId: string,
  actorRole: UserRole,
) {
  const [team, assignee] = await Promise.all([
    teamId ? prisma.team.findFirst({ where: { id: teamId, organizationId }, select: { id: true, managerId: true } }) : null,
    assignedToId ? prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId: assignedToId } },
      select: { userId: true, status: true },
    }) : null,
  ]);

  if (teamId && !team) return "Selected team does not belong to this organization.";
  if (actorRole === "TEAM_LEAD" && (!team || team.managerId !== actorId)) return "Team leads can manage tasks only for the team they lead.";
  if (assignedToId && (!assignee || assignee.status !== "ACTIVE")) return "Assign this task to an active organization member.";

  if (team && assignedToId) {
    const member = await prisma.teamMember.findUnique({ where: { teamId_userId: { teamId: team.id, userId: assignedToId } }, select: { id: true } });
    if (!member) return "The selected employee must belong to the selected team.";
  }
  return null;
}

export async function createTask(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseTask(formData);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  const authorization = await requireOrganizationPermission(parsed.data.organizationId, "tasks:manage");
  const role = effectiveRole(authorization.user.role, authorization.membership);
  const relationError = await validateRelations(parsed.data.organizationId, parsed.data.teamId, parsed.data.assignedToId, authorization.user.id, role);
  if (relationError) return { message: relationError };

  try {
    const task = await prisma.$transaction(async (tx) => {
      const lastPosition = await tx.task.aggregate({ where: { organizationId: parsed.data.organizationId, status: parsed.data.status, archivedAt: null }, _max: { position: true } });
      const created = await tx.task.create({
        data: {
          organizationId: parsed.data.organizationId,
          title: parsed.data.title,
          description: parsed.data.description ?? null,
          assignedToId: parsed.data.assignedToId ?? null,
          teamId: parsed.data.teamId ?? null,
          priority: parsed.data.priority,
          status: parsed.data.status,
          startAt: toDate(parsed.data.startDate),
          dueAt: toDate(parsed.data.dueDate),
          estimatedMins: parsed.data.estimatedHours ? Math.round(parsed.data.estimatedHours * 60) : null,
          position: (lastPosition._max.position ?? -1) + 1,
          completedAt: parsed.data.status === "COMPLETED" ? new Date() : null,
          createdById: authorization.user.id,
        },
      });
      await tx.activityLog.create({
        data: { organizationId: parsed.data.organizationId, actorId: authorization.user.id, action: "task.created", entityType: "task", entityId: created.id, metadata: { title: created.title, assigneeId: created.assignedToId, teamId: created.teamId } },
      });
      if (created.assignedToId) {
        await createNotification(tx, { organizationId: created.organizationId, userId: created.assignedToId, actorId: authorization.user.id, type: "TASK_ASSIGNED", title: "New task assigned", message: created.title, link: `/employee/tasks?task=${created.id}`, relatedEntityType: "task", relatedEntityId: created.id, eventId: `task.created:${created.id}:assigned:${created.assignedToId}`, metadata: { taskId: created.id } });
      }
      return created;
    });
    taskPaths();
    return { success: true, message: `“${task.title}” created successfully.` };
  } catch {
    return { message: "Task could not be created. Check the details and try again." };
  }
}

export async function updateTask(taskId: string, _state: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseTask(formData);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };

  const authorization = await requireOrganizationPermission(parsed.data.organizationId, "tasks:manage");
  const role = effectiveRole(authorization.user.role, authorization.membership);
  const current = await prisma.task.findFirst({ where: { id: taskId, organizationId: parsed.data.organizationId, archivedAt: null }, select: { id: true, title: true, assignedToId: true, teamId: true, status: true, priority: true, dueAt: true, updatedAt: true } });
  if (!current) return { message: "Task was not found." };
  if (role === "TEAM_LEAD") {
    const ownedTeam = await prisma.team.findFirst({ where: { id: current.teamId ?? "", organizationId: parsed.data.organizationId, managerId: authorization.user.id }, select: { id: true } });
    if (!ownedTeam) return { message: "You can update tasks only for the team you lead." };
  }
  const relationError = await validateRelations(parsed.data.organizationId, parsed.data.teamId, parsed.data.assignedToId, authorization.user.id, role);
  if (relationError) return { message: relationError };

  try {
    await prisma.$transaction(async (tx) => {
      await lockTask(tx, taskId, parsed.data.organizationId);
      const latest = await tx.task.findFirst({ where: { id: taskId, organizationId: parsed.data.organizationId, archivedAt: null }, select: { updatedAt: true } });
      if (!latest || latest.updatedAt.getTime() !== current.updatedAt.getTime()) throw new Error("TASK_STATE_CHANGED");
      if (current.assignedToId !== (parsed.data.assignedToId ?? null) || current.status !== parsed.data.status) {
        const activeTimer = await tx.workSession.findFirst({ where: { taskId, endedAt: null }, select: { id: true } });
        if (activeTimer) throw new Error("TASK_TIMER_ACTIVE");
      }
      const lastPosition = current.status !== parsed.data.status
        ? await tx.task.aggregate({ where: { organizationId: parsed.data.organizationId, status: parsed.data.status, archivedAt: null }, _max: { position: true } })
        : null;
      const task = await tx.task.update({
        where: { id: taskId },
        data: {
          title: parsed.data.title,
          description: parsed.data.description ?? null,
          assignedToId: parsed.data.assignedToId ?? null,
          teamId: parsed.data.teamId ?? null,
          priority: parsed.data.priority,
          status: parsed.data.status,
          startAt: toDate(parsed.data.startDate),
          dueAt: toDate(parsed.data.dueDate),
          estimatedMins: parsed.data.estimatedHours ? Math.round(parsed.data.estimatedHours * 60) : null,
          position: lastPosition ? (lastPosition._max.position ?? -1) + 1 : undefined,
          completedAt: parsed.data.status === "COMPLETED" ? current.status === "COMPLETED" ? undefined : new Date() : null,
        },
      });
      await tx.activityLog.create({
        data: { organizationId: parsed.data.organizationId, actorId: authorization.user.id, action: "task.updated", entityType: "task", entityId: task.id, metadata: { title: task.title, status: task.status, assigneeId: task.assignedToId } },
      });
      const version = current.updatedAt.toISOString();
      if (task.assignedToId && task.assignedToId !== current.assignedToId) await createNotification(tx, { organizationId: task.organizationId, userId: task.assignedToId, actorId: authorization.user.id, type: "TASK_ASSIGNED", title: "Task assigned to you", message: task.title, link: `/employee/tasks?task=${task.id}`, relatedEntityType: "task", relatedEntityId: task.id, eventId: `task.reassigned:${task.id}:${version}:${task.assignedToId}`, metadata: { taskId: task.id } });
      if (task.assignedToId && task.assignedToId !== authorization.user.id && task.priority !== current.priority) await createNotification(tx, { organizationId: task.organizationId, userId: task.assignedToId, actorId: authorization.user.id, type: "TASK_UPDATED", title: "Task priority changed", message: `${task.title} is now ${task.priority.toLowerCase()} priority.`, link: `/employee/tasks?task=${task.id}`, relatedEntityType: "task", relatedEntityId: task.id, eventId: `task.priority:${task.id}:${version}:${task.priority}`, metadata: { taskId: task.id, priority: task.priority } });
      if (task.assignedToId && task.assignedToId !== authorization.user.id && task.dueAt?.toISOString() !== current.dueAt?.toISOString()) await createNotification(tx, { organizationId: task.organizationId, userId: task.assignedToId, actorId: authorization.user.id, type: "TASK_UPDATED", title: "Task deadline updated", message: task.dueAt ? `${task.title} is due ${task.dueAt.toLocaleDateString("en-IN")}.` : `${task.title} no longer has a deadline.`, link: `/employee/tasks?task=${task.id}`, relatedEntityType: "task", relatedEntityId: task.id, eventId: `task.deadline:${task.id}:${version}:${task.dueAt?.toISOString() ?? "none"}`, metadata: { taskId: task.id, dueAt: task.dueAt?.toISOString() ?? null } });
      if (task.assignedToId && task.assignedToId !== authorization.user.id && task.status !== current.status) await createNotification(tx, { organizationId: task.organizationId, userId: task.assignedToId, actorId: authorization.user.id, type: "TASK_UPDATED", title: task.status === "COMPLETED" ? "Task completed" : task.status === "REVIEW" ? "Task moved to review" : "Task status changed", message: `${task.title} moved to ${task.status.replaceAll("_", " ").toLowerCase()}.`, link: `/employee/tasks?task=${task.id}`, relatedEntityType: "task", relatedEntityId: task.id, eventId: `task.status:${task.id}:${version}:${task.status}`, metadata: { taskId: task.id, status: task.status } });
    });
    taskPaths();
    return { success: true, message: "Task changes saved." };
  } catch (error) {
    if (error instanceof Error && error.message === "TASK_TIMER_ACTIVE") return { message: "Pause the running task timer before changing this task's assignment or status." };
    return { message: "The task changed while you were editing it. Refresh and try again." };
  }
}

export async function archiveTask(organizationId: string, taskId: string): Promise<void> {
  const authorization = await requireOrganizationPermission(organizationId, "tasks:manage");
  const role = effectiveRole(authorization.user.role, authorization.membership);
  if (role !== "SUPER_ADMIN" && role !== "PRODUCT_MANAGER") throw new Error("Only product managers and administrators can archive tasks.");
  const task = await prisma.task.findFirst({ where: { id: taskId, organizationId, archivedAt: null }, select: { id: true, title: true } });
  if (!task) throw new Error("Task was not found.");

  await prisma.$transaction(async (tx) => {
    await lockTask(tx, task.id, organizationId);
    const activeTimer = await tx.workSession.findFirst({ where: { taskId: task.id, endedAt: null }, select: { id: true } });
    if (activeTimer) throw new Error("Pause the running task timer before archiving this task.");
    const archived = await tx.task.updateMany({ where: { id: task.id, organizationId, archivedAt: null }, data: { archivedAt: new Date() } });
    if (archived.count !== 1) throw new Error("Task changed while archiving. Refresh and try again.");
    await tx.activityLog.create({ data: { organizationId, actorId: authorization.user.id, action: "task.archived", entityType: "task", entityId: task.id, metadata: { title: task.title } } });
  });
  taskPaths();
}

export async function updateMyTaskStatus(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = employeeTaskStatusSchema.safeParse({ taskId: field(formData, "taskId"), status: field(formData, "status") });
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const user = await requirePermission("tasks:update-own");
  const task = await prisma.task.findFirst({ where: { id: parsed.data.taskId, assignedToId: user.id, archivedAt: null }, select: { id: true, organizationId: true, title: true, status: true, createdById: true, updatedAt: true } });
  if (!task) return { message: "This task is not assigned to you." };
  await requireOrganizationPermission(task.organizationId, "tasks:update-own");
  if (parsed.data.status === task.status) return { success: true, message: "Task status is already up to date." };

  const transitions: Partial<Record<typeof task.status, readonly typeof parsed.data.status[]>> = {
    TODO: ["IN_PROGRESS", "BLOCKED"],
    IN_PROGRESS: ["BLOCKED", "REVIEW", "COMPLETED"],
    BLOCKED: ["IN_PROGRESS", "REVIEW"],
    REVIEW: ["IN_PROGRESS", "COMPLETED"],
    COMPLETED: [],
  };
  if (parsed.data.status !== task.status && !transitions[task.status]?.includes(parsed.data.status)) {
    return { message: `Move this task from ${task.status.replaceAll("_", " ").toLowerCase()} through the next valid workflow step.` };
  }

  try {
  await prisma.$transaction(async (tx) => {
    await lockTask(tx, task.id, task.organizationId);
    const latest = await tx.task.findFirst({ where: { id: task.id, organizationId: task.organizationId, assignedToId: user.id, archivedAt: null }, select: { status: true, updatedAt: true } });
    if (!latest || latest.status !== task.status || latest.updatedAt.getTime() !== task.updatedAt.getTime()) throw new Error("TASK_STATE_CHANGED");
    if (parsed.data.status !== "IN_PROGRESS") {
      const activeTimer = await tx.workSession.findFirst({ where: { taskId: task.id, userId: user.id, endedAt: null }, select: { id: true } });
      if (activeTimer) throw new Error("TASK_TIMER_ACTIVE");
    }
    const lastPosition = task.status !== parsed.data.status
      ? await tx.task.aggregate({ where: { organizationId: task.organizationId, status: parsed.data.status, archivedAt: null }, _max: { position: true } })
      : null;
    await tx.task.update({ where: { id: task.id }, data: { status: parsed.data.status, position: lastPosition ? (lastPosition._max.position ?? -1) + 1 : undefined, completedAt: parsed.data.status === "COMPLETED" ? new Date() : null } });
    await tx.activityLog.create({ data: { organizationId: task.organizationId, actorId: user.id, action: "task.status_changed", entityType: "task", entityId: task.id, metadata: { from: task.status, to: parsed.data.status, title: task.title } } });
    if (task.createdById !== user.id) {
      await createNotification(tx, { organizationId: task.organizationId, userId: task.createdById, actorId: user.id, type: "TASK_UPDATED", title: parsed.data.status === "COMPLETED" ? "Task completed" : parsed.data.status === "REVIEW" ? "Task ready for review" : "Task status updated", message: `${task.title} moved to ${parsed.data.status.replaceAll("_", " ").toLowerCase()}.`, link: `/dashboard/tasks?task=${task.id}`, relatedEntityType: "task", relatedEntityId: task.id, eventId: `task.employee-status:${task.id}:${task.updatedAt.toISOString()}:${parsed.data.status}`, metadata: { taskId: task.id, status: parsed.data.status } });
    }
  });
  } catch (error) {
    return { message: error instanceof Error && error.message === "TASK_TIMER_ACTIVE" ? "Pause the running timer before moving this task to another status." : "This task changed in another request. Refresh and try again." };
  }
  taskPaths();
  return { success: true, message: "Task status updated." };
}

export async function moveTaskOnBoard(input: unknown): Promise<BoardActionResult> {
  const parsed = boardMoveSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: "The board move was not valid." };

  const task = await prisma.task.findFirst({
    where: { id: parsed.data.taskId, archivedAt: null },
    select: { id: true, organizationId: true, teamId: true, status: true, assignedToId: true, title: true, updatedAt: true },
  });
  if (!task || task.status !== parsed.data.fromStatus) return { success: false, message: "This task changed elsewhere. Refresh the board and try again." };

  const authorization = await requireOrganizationPermission(task.organizationId, "tasks:manage");
  const role = effectiveRole(authorization.user.role, authorization.membership);
  if (role === "TEAM_LEAD") {
    const ownedTeam = await prisma.team.findFirst({ where: { id: task.teamId ?? "", organizationId: task.organizationId, managerId: authorization.user.id }, select: { id: true } });
    if (!ownedTeam) return { success: false, message: "You can move tasks only for the team you lead." };
  }

  const columnStatuses = new Set(parsed.data.columns.map((column) => column.status));
  if (!columnStatuses.has(parsed.data.toStatus) || !columnStatuses.has(parsed.data.fromStatus)) return { success: false, message: "The board columns are out of date." };
  const allIds = parsed.data.columns.flatMap((column) => column.taskIds);
  const uniqueIds = new Set(allIds);
  if (allIds.length !== uniqueIds.size || !parsed.data.columns.find((column) => column.status === parsed.data.toStatus)?.taskIds.includes(task.id)) {
    return { success: false, message: "The new task order was not valid." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await lockTask(tx, task.id, task.organizationId);
      const scopedTasks = await tx.task.findMany({
        where: { organizationId: task.organizationId, archivedAt: null, status: { in: parsed.data.columns.map((column) => column.status) }, ...(role === "TEAM_LEAD" ? { team: { managerId: authorization.user.id } } : {}) },
        select: { id: true, status: true },
      });
      if (!validBoardSnapshot(parsed.data, scopedTasks)) throw new Error("BOARD_SNAPSHOT_CHANGED");
      if (parsed.data.fromStatus !== parsed.data.toStatus) {
        const activeTimer = await tx.workSession.findFirst({ where: { taskId: task.id, endedAt: null }, select: { id: true } });
        if (activeTimer) throw new Error("TASK_TIMER_ACTIVE");
      }
      for (const column of parsed.data.columns) {
        for (const [position, id] of column.taskIds.entries()) {
          const changed = await tx.task.updateMany({
            where: { id, organizationId: task.organizationId, archivedAt: null, status: id === task.id ? parsed.data.fromStatus : column.status },
            data: { status: column.status, position, completedAt: id === task.id && parsed.data.fromStatus !== parsed.data.toStatus ? column.status === "COMPLETED" ? new Date() : null : undefined },
          });
          if (changed.count !== 1) throw new Error("BOARD_SNAPSHOT_CHANGED");
        }
      }
      if (parsed.data.fromStatus !== parsed.data.toStatus) {
        await tx.activityLog.create({ data: { organizationId: task.organizationId, actorId: authorization.user.id, action: "task.status_changed", entityType: "task", entityId: task.id, metadata: { from: parsed.data.fromStatus, to: parsed.data.toStatus, title: task.title, source: "kanban" } } });
        if (task.assignedToId && task.assignedToId !== authorization.user.id) {
          await createNotification(tx, { organizationId: task.organizationId, userId: task.assignedToId, actorId: authorization.user.id, type: "TASK_UPDATED", title: parsed.data.toStatus === "COMPLETED" ? "Task completed" : parsed.data.toStatus === "REVIEW" ? "Task moved to review" : "Task status changed", message: `${task.title} moved to ${parsed.data.toStatus.replaceAll("_", " ").toLowerCase()}.`, link: `/employee/tasks?task=${task.id}`, relatedEntityType: "task", relatedEntityId: task.id, eventId: `task.board-status:${task.id}:${task.updatedAt.toISOString()}:${parsed.data.toStatus}`, metadata: { taskId: task.id, status: parsed.data.toStatus } });
        }
      }
    });
    taskPaths();
    revalidatePath("/dashboard/tasks/board");
    return { success: true };
  } catch (error) {
    return { success: false, message: error instanceof Error && error.message === "TASK_TIMER_ACTIVE" ? "Pause the running task timer before changing this task's status." : "The board changed while you were moving this task. Refresh to get the latest order." };
  }
}
