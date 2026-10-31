"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireOrganizationPermission } from "@/lib/dal/auth";
import { breakActionSchema, taskTimerSchema, type FormState } from "@/lib/validations";
import { durationMinutes } from "@/lib/date-time";
import { workingSummary } from "@/lib/work-time";
import { createNotification } from "@/lib/notifications";
import { assertActiveOrganizationAccess } from "@/lib/member-access";

const field = (formData: FormData, name: string) => String(formData.get(name) ?? "");
const parseTimer = (formData: FormData) => taskTimerSchema.safeParse({ organizationId: field(formData, "organizationId"), taskId: field(formData, "taskId") });
async function lockUser(tx: Prisma.TransactionClient, userId: string) { await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`; }
async function lockTask(tx: Prisma.TransactionClient, taskId: string, organizationId: string) { await tx.$queryRaw`SELECT "id" FROM "tasks" WHERE "id" = ${taskId} AND "organization_id" = ${organizationId} FOR UPDATE`; }

function refreshTimeData() {
  revalidatePath("/employee/tasks");
  revalidatePath("/employee/attendance");
  revalidatePath("/dashboard/time-tracking");
  revalidatePath("/dashboard/attendance");
  revalidatePath("/employee");
  revalidatePath("/dashboard");
}

async function timerContext(organizationId: string, taskId: string) {
  const authorization = await requireOrganizationPermission(organizationId, "tasks:update-own");
  const [task, attendanceSession, activeBreak, activeTask] = await Promise.all([
    prisma.task.findFirst({ where: { id: taskId, organizationId, assignedToId: authorization.user.id, archivedAt: null }, select: { id: true, title: true, status: true, workSessions: { where: { userId: authorization.user.id }, select: { id: true }, take: 1 } } }),
    prisma.workSession.findFirst({ where: { organizationId, userId: authorization.user.id, taskId: null, endedAt: null }, select: { id: true, attendanceId: true } }),
    prisma.break.findFirst({ where: { organizationId, userId: authorization.user.id, endedAt: null }, select: { id: true } }),
    prisma.workSession.findFirst({ where: { organizationId, userId: authorization.user.id, taskId: { not: null }, endedAt: null }, select: { id: true, taskId: true, startedAt: true } }),
  ]);
  return { authorization, task, attendanceSession, activeBreak, activeTask };
}

async function beginTimer(formData: FormData, event: "started" | "resumed"): Promise<FormState> {
  const parsed = parseTimer(formData);
  if (!parsed.success) return { message: "The selected task could not be verified." };
  const context = await timerContext(parsed.data.organizationId, parsed.data.taskId);
  if (!context.task || context.task.status === "COMPLETED" || context.task.status === "CANCELLED") return { message: "You can track time only on an active task assigned to you." };
  if (event === "started" && context.task.workSessions.length) return { message: "Use Resume to continue a previously tracked task." };
  if (event === "resumed" && !context.task.workSessions.length) return { message: "Start this task before trying to resume it." };
  if (!context.attendanceSession) return { message: "Check in before starting a task timer." };
  if (context.activeBreak) return { message: "End your active break before starting a task timer." };
  if (context.activeTask?.taskId === context.task.id) return { message: "This task timer is already running." };
  if (context.activeTask) return { message: "Pause the current task before starting another one." };
  const now = new Date();

  try {
    await prisma.$transaction(async (tx) => {
      await lockUser(tx, context.authorization.user.id);
      await assertActiveOrganizationAccess(tx, parsed.data.organizationId, context.authorization.user.id, "tasks:update-own");
      await lockTask(tx, context.task!.id, parsed.data.organizationId);
      const latestTask = await tx.task.findFirst({ where: { id: context.task!.id, organizationId: parsed.data.organizationId, assignedToId: context.authorization.user.id, archivedAt: null }, select: { status: true, workSessions: { where: { userId: context.authorization.user.id }, select: { id: true }, take: 1 } } });
      if (!latestTask || latestTask.status === "COMPLETED" || latestTask.status === "CANCELLED" || (event === "started" ? latestTask.workSessions.length > 0 : latestTask.workSessions.length === 0)) throw new Error("TIMER_STATE_CHANGED");
      const [lockedOffice, lockedBreak, lockedTask] = await Promise.all([
        tx.workSession.findFirst({ where: { organizationId: parsed.data.organizationId, userId: context.authorization.user.id, taskId: null, endedAt: null }, select: { attendanceId: true } }),
        tx.break.findFirst({ where: { organizationId: parsed.data.organizationId, userId: context.authorization.user.id, endedAt: null }, select: { id: true } }),
        tx.workSession.findFirst({ where: { organizationId: parsed.data.organizationId, userId: context.authorization.user.id, taskId: { not: null }, endedAt: null }, select: { id: true } }),
      ]);
      if (!lockedOffice || lockedBreak || lockedTask) throw new Error("TIMER_STATE_CHANGED");
      await tx.workSession.create({ data: { organizationId: parsed.data.organizationId, attendanceId: lockedOffice.attendanceId, userId: context.authorization.user.id, taskId: context.task!.id, startedAt: now } });
      if (context.task!.status !== "IN_PROGRESS") await tx.task.update({ where: { id: context.task!.id }, data: { status: "IN_PROGRESS", completedAt: null } });
      await tx.activityLog.create({ data: { organizationId: parsed.data.organizationId, actorId: context.authorization.user.id, action: `task.timer_${event}`, entityType: "task", entityId: context.task!.id, metadata: { source: "web" } } });
    });
  } catch {
    return { message: "The timer could not start. Refresh to check whether another request already started it." };
  }
  refreshTimeData();
  return { success: true, message: event === "resumed" ? "Task timer resumed." : "Task timer started." };
}

export async function startTaskTimer(_state: FormState, formData: FormData) { return beginTimer(formData, "started"); }
export async function resumeTaskTimer(_state: FormState, formData: FormData) { return beginTimer(formData, "resumed"); }

async function closeTimer(formData: FormData, finish: boolean): Promise<FormState> {
  const parsed = parseTimer(formData);
  if (!parsed.success) return { message: "The selected task could not be verified." };
  const authorization = await requireOrganizationPermission(parsed.data.organizationId, "tasks:update-own");
  const task = await prisma.task.findFirst({ where: { id: parsed.data.taskId, organizationId: parsed.data.organizationId, assignedToId: authorization.user.id, archivedAt: null }, select: { id: true, title: true, createdById: true } });
  if (!task) return { message: "This task is not assigned to you." };
  const active = await prisma.workSession.findFirst({ where: { organizationId: parsed.data.organizationId, userId: authorization.user.id, taskId: task.id, endedAt: null }, select: { id: true, startedAt: true } });
  if (!active) return { message: finish ? "Start or resume the task before finishing it." : "This task timer is not running." };
  const now = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      await lockUser(tx, authorization.user.id);
      await assertActiveOrganizationAccess(tx, parsed.data.organizationId, authorization.user.id, "tasks:update-own");
      await lockTask(tx, task.id, parsed.data.organizationId);
      const locked = await tx.workSession.findFirst({ where: { id: active.id, endedAt: null }, select: { id: true, startedAt: true } });
      if (!locked) throw new Error("TIMER_STATE_CHANGED");
      await tx.workSession.update({ where: { id: locked.id }, data: { endedAt: now, durationMins: durationMinutes(locked.startedAt, now) } });
      if (finish) await tx.task.update({ where: { id: task.id }, data: { status: "COMPLETED", completedAt: now } });
      await tx.activityLog.create({ data: { organizationId: parsed.data.organizationId, actorId: authorization.user.id, action: finish ? "task.timer_stopped" : "task.timer_paused", entityType: "task", entityId: task.id, metadata: { durationMins: durationMinutes(locked.startedAt, now), source: "web" } } });
      if (finish && task.createdById !== authorization.user.id) await createNotification(tx, { organizationId: parsed.data.organizationId, userId: task.createdById, actorId: authorization.user.id, type: "TASK_UPDATED", title: "Task completed", message: task.title, link: `/dashboard/tasks?task=${task.id}`, relatedEntityType: "task", relatedEntityId: task.id, eventId: `task.timer-completed:${task.id}:${locked.id}`, metadata: { taskId: task.id, status: "COMPLETED" } });
    });
  } catch { return { message: "The timer state changed in another request. Refresh and try again." }; }
  refreshTimeData();
  return { success: true, message: finish ? "Task finished and timer stopped." : "Task timer paused." };
}

export async function pauseTaskTimer(_state: FormState, formData: FormData) { return closeTimer(formData, false); }
export async function stopTaskTimer(_state: FormState, formData: FormData) { return closeTimer(formData, true); }

export async function startBreak(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = breakActionSchema.safeParse({ organizationId: field(formData, "organizationId"), type: field(formData, "type") });
  if (!parsed.success) return { message: "Choose a valid break type." };
  const authorization = await requireOrganizationPermission(parsed.data.organizationId, "attendance:update-own");
  const [officeSession, activeBreak, settings] = await Promise.all([
    prisma.workSession.findFirst({ where: { organizationId: parsed.data.organizationId, userId: authorization.user.id, taskId: null, endedAt: null }, select: { id: true, attendanceId: true } }),
    prisma.break.findFirst({ where: { organizationId: parsed.data.organizationId, userId: authorization.user.id, endedAt: null }, select: { id: true } }),
    prisma.organizationSettings.findUnique({ where: { organizationId: parsed.data.organizationId }, select: { allowedBreakTypes: true } }),
  ]);
  if (settings && !settings.allowedBreakTypes.includes(parsed.data.type)) return { message: "This break type is not allowed by your organization policy." };
  if (!officeSession) return { message: "Check in before starting a break." };
  if (activeBreak) return { message: "End your current break before starting another one." };
  const now = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      await lockUser(tx, authorization.user.id);
      await assertActiveOrganizationAccess(tx, parsed.data.organizationId, authorization.user.id, "attendance:update-own");
      const [lockedOffice, lockedBreak, lockedTask] = await Promise.all([
        tx.workSession.findFirst({ where: { id: officeSession.id, endedAt: null }, select: { id: true, attendanceId: true } }),
        tx.break.findFirst({ where: { organizationId: parsed.data.organizationId, userId: authorization.user.id, endedAt: null }, select: { id: true } }),
        tx.workSession.findFirst({ where: { organizationId: parsed.data.organizationId, userId: authorization.user.id, taskId: { not: null }, endedAt: null }, select: { id: true, taskId: true, startedAt: true } }),
      ]);
      if (!lockedOffice || lockedBreak) throw new Error("BREAK_STATE_CHANGED");
      if (lockedTask) {
        await tx.workSession.update({ where: { id: lockedTask.id }, data: { endedAt: now, durationMins: durationMinutes(lockedTask.startedAt, now) } });
        await tx.activityLog.create({ data: { organizationId: parsed.data.organizationId, actorId: authorization.user.id, action: "task.timer_paused", entityType: "task", entityId: lockedTask.taskId, metadata: { reason: "break_started" } } });
      }
      const created = await tx.break.create({ data: { organizationId: parsed.data.organizationId, userId: authorization.user.id, attendanceId: lockedOffice.attendanceId, workSessionId: lockedOffice.id, type: parsed.data.type, startedAt: now } });
      await tx.activityLog.create({ data: { organizationId: parsed.data.organizationId, actorId: authorization.user.id, action: parsed.data.type === "LUNCH" ? "lunch.started" : "break.started", entityType: "break", entityId: created.id, metadata: { type: parsed.data.type } } });
    });
  } catch {
    return { message: "The break could not start. Refresh to check its current state." };
  }
  refreshTimeData();
  return { success: true, message: `${parsed.data.type === "LUNCH" ? "Lunch" : "Break"} started. Any running task was paused.` };
}

export async function endBreak(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = breakActionSchema.pick({ organizationId: true }).safeParse({ organizationId: field(formData, "organizationId") });
  if (!parsed.success) return { message: "Your organization could not be verified." };
  const authorization = await requireOrganizationPermission(parsed.data.organizationId, "attendance:update-own");
  const [active, settings] = await Promise.all([
    prisma.break.findFirst({ where: { organizationId: parsed.data.organizationId, userId: authorization.user.id, endedAt: null }, select: { id: true, type: true, startedAt: true } }),
    prisma.organizationSettings.findUnique({ where: { organizationId: parsed.data.organizationId }, select: { maxBreakMins: true } }),
  ]);
  if (!active) return { message: "No active break was found." };
  const now = new Date();
  const elapsedMinutes = durationMinutes(active.startedAt, now);
  const exceededPolicy = settings?.maxBreakMins != null && elapsedMinutes > settings.maxBreakMins;
  try {
    await prisma.$transaction(async (tx) => {
      await lockUser(tx, authorization.user.id);
      await assertActiveOrganizationAccess(tx, parsed.data.organizationId, authorization.user.id, "attendance:update-own");
      const locked = await tx.break.findFirst({ where: { id: active.id, endedAt: null }, select: { id: true, type: true, startedAt: true } });
      if (!locked) throw new Error("BREAK_STATE_CHANGED");
      await tx.break.update({ where: { id: locked.id }, data: { endedAt: now, durationMins: durationMinutes(locked.startedAt, now) } });
      await tx.activityLog.create({ data: { organizationId: parsed.data.organizationId, actorId: authorization.user.id, action: locked.type === "LUNCH" ? "lunch.ended" : "break.ended", entityType: "break", entityId: locked.id, metadata: { type: locked.type, durationMins: durationMinutes(locked.startedAt, now), policyExceeded: exceededPolicy, maxBreakMins: settings?.maxBreakMins } } });
    });
  } catch { return { message: "The break state changed in another request. Refresh and try again." }; }
  refreshTimeData();
  return { success: true, message: exceededPolicy ? `Break ended. It exceeded the ${settings?.maxBreakMins}-minute organization limit.` : "Break ended. Resume a task when you are ready." };
}

export async function getActiveTaskTimer(organizationId: string) {
  const authorization = await requireOrganizationPermission(organizationId, "tasks:update-own");
  return prisma.workSession.findFirst({ where: { organizationId, userId: authorization.user.id, taskId: { not: null }, endedAt: null }, include: { task: { select: { id: true, title: true, estimatedMins: true } } } });
}

export async function getTaskTimeSummary(organizationId: string, taskId: string) {
  const authorization = await requireOrganizationPermission(organizationId, "tasks:update-own");
  const task = await prisma.task.findFirst({ where: { id: taskId, organizationId, assignedToId: authorization.user.id }, select: { id: true } });
  if (!task) return null;
  const sessions = await prisma.workSession.findMany({ where: { organizationId, userId: authorization.user.id, taskId } });
  return { milliseconds: sessions.reduce((sum, session) => sum + Math.max(0, (session.endedAt ?? new Date()).getTime() - session.startedAt.getTime()), 0) };
}

export async function getTodayBreaks(organizationId: string, attendanceId: string) {
  const authorization = await requireOrganizationPermission(organizationId, "attendance:update-own");
  return prisma.break.findMany({ where: { organizationId, userId: authorization.user.id, attendanceId }, orderBy: { startedAt: "desc" } });
}

export async function getWorkingHoursSummary(organizationId: string, attendanceId: string) {
  const authorization = await requireOrganizationPermission(organizationId, "attendance:update-own");
  const attendance = await prisma.attendance.findFirst({ where: { id: attendanceId, organizationId, userId: authorization.user.id }, include: { breaks: true, workSessions: { where: { taskId: { not: null } } } } });
  if (!attendance?.checkInAt) return workingSummary({ attendance: null, breaks: [], tasks: [] });
  return workingSummary({ attendance: { startedAt: attendance.checkInAt, endedAt: attendance.checkOutAt }, breaks: attendance.breaks, tasks: attendance.workSessions });
}
