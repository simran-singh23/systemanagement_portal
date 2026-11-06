"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrganizationPermission } from "@/lib/dal/auth";
import { attendanceActionSchema, type FormState } from "@/lib/validations";
import { attendanceWorkdayKey, databaseDate, durationMinutes, isLateCheckIn } from "@/lib/date-time";
import { createNotifications, getAuthorizedReviewerIds } from "@/lib/notifications";
import { assertActiveOrganizationAccess } from "@/lib/member-access";
import { ORGANIZATION_SETTINGS_DEFAULTS } from "@/lib/organization-settings";
import { workingSummary } from "@/lib/work-time";
import { lockTransaction as lockUser } from "@/lib/transaction-lock";

function refreshAttendance() {
  revalidatePath("/employee/attendance");
  revalidatePath("/dashboard/attendance");
  revalidatePath("/employee");
  revalidatePath("/dashboard");
}

function parseOrganization(formData: FormData) {
  return attendanceActionSchema.safeParse({ organizationId: String(formData.get("organizationId") ?? "") });
}

export async function updateAttendance(_state: FormState, formData: FormData): Promise<FormState> {
  switch (formData.get("operation")) {
    case "check-in": return checkIn(formData);
    case "check-out": return checkOut(formData);
    default: return { message: "Choose a valid attendance action." };
  }
}

async function checkIn(formData: FormData): Promise<FormState> {
  const parsed = parseOrganization(formData);
  if (!parsed.success) return { message: "Your organization could not be verified." };

  const { organizationId } = parsed.data;
  const { user } = await requireOrganizationPermission(organizationId, "attendance:update-own");
  let isLate = false;
  try {
    const conflict = await prisma.$transaction(async (tx) => {
      await lockUser(tx, user.id);
      await assertActiveOrganizationAccess(tx, organizationId, user.id, "attendance:update-own");
      const now = new Date();
      const settings = await tx.organizationSettings.findUnique({
        where: { organizationId },
        select: { timezone: true, workdayStart: true, workdayEnd: true, overnightShiftEnabled: true, lateGraceMins: true, workDays: true },
      }) ?? ORGANIZATION_SETTINGS_DEFAULTS;
      const workdayKey = attendanceWorkdayKey(now, settings.timezone, settings.workdayStart, settings.workdayEnd, settings.overnightShiftEnabled);
      const attendanceDate = databaseDate(workdayKey);
      const approvedLeave = await tx.leaveRequest.findFirst({ where: { organizationId, userId: user.id, status: "APPROVED", startDate: { lte: attendanceDate }, endDate: { gte: attendanceDate } }, select: { id: true } });
      if (approvedLeave) return "You have approved leave for this workday. Contact your manager if this changed.";
      const existing = await tx.attendance.findUnique({ where: { organizationId_userId_attendanceDate: { organizationId, userId: user.id, attendanceDate } }, select: { checkInAt: true, checkOutAt: true } });
      if (existing?.checkOutAt) return "This workday’s attendance is already complete.";
      const openSession = await tx.workSession.findFirst({ where: { userId: user.id, taskId: null, endedAt: null }, select: { organizationId: true } });
      if (openSession && openSession.organizationId !== organizationId) return "Check out of your other workspace before checking in here.";
      if (existing?.checkInAt || openSession) return "You are already checked in.";

      const holiday = await tx.organizationHoliday.findUnique({ where: { organizationId_holidayDate: { organizationId, holidayDate: attendanceDate } }, select: { id: true } });
      isLate = !holiday && settings.workDays.includes(attendanceDate.getUTCDay())
        && isLateCheckIn(now, workdayKey, settings.timezone, settings.workdayStart, settings.lateGraceMins);
      const attendance = await tx.attendance.upsert({
        where: { organizationId_userId_attendanceDate: { organizationId, userId: user.id, attendanceDate } },
        create: { organizationId, userId: user.id, attendanceDate, checkInAt: now, status: isLate ? "LATE" : "PRESENT" },
        update: { checkInAt: now, checkOutAt: null, status: isLate ? "LATE" : "PRESENT" },
      });
      await tx.workSession.create({ data: { organizationId, attendanceId: attendance.id, userId: user.id, startedAt: now } });
      await tx.activityLog.create({
        data: { organizationId, actorId: user.id, action: "attendance.checked_in", entityType: "attendance", entityId: attendance.id, metadata: { source: "web", status: isLate ? "LATE" : "PRESENT" } },
      });
      if (isLate) {
        const reviewers = await getAuthorizedReviewerIds(tx, organizationId, user.id);
        await createNotifications(tx, reviewers, { organizationId, actorId: user.id, type: "ATTENDANCE", title: "Late check-in recorded", message: `${user.name || user.email} checked in after the grace period.`, link: `/dashboard/attendance?date=${attendanceDate.toISOString().slice(0, 10)}`, relatedEntityType: "attendance", relatedEntityId: attendance.id, eventId: `attendance.late:${attendance.id}`, metadata: { attendanceId: attendance.id, status: "LATE" } });
      }
      return null;
    });
    if (conflict) return { message: conflict };
  } catch {
    return { message: "Check-in could not be recorded. Refresh the page and try again." };
  }

  refreshAttendance();
  return { success: true, message: isLate ? "Checked in. Your arrival was recorded as late." : "Checked in successfully. Have a productive day!" };
}

async function checkOut(formData: FormData): Promise<FormState> {
  const parsed = parseOrganization(formData);
  if (!parsed.success) return { message: "Your organization could not be verified." };

  const sessionId = formData.get("sessionId");
  if (typeof sessionId !== "string" || !sessionId) return { message: "The open work session could not be verified." };
  const { organizationId } = parsed.data;
  const { user } = await requireOrganizationPermission(organizationId, "attendance:update-own");
  let isHalfDay = false;
  try {
    const closed = await prisma.$transaction(async (tx) => {
      await lockUser(tx, user.id);
      await assertActiveOrganizationAccess(tx, organizationId, user.id, "attendance:update-own");
      const lockedOffice = await tx.workSession.findFirst({
        where: { id: sessionId, organizationId, userId: user.id, taskId: null, endedAt: null },
        include: { attendance: true, breaks: { where: { endedAt: null } } },
      });
      const attendance = lockedOffice?.attendance;
      if (!lockedOffice || !attendance?.checkInAt) return false;
      const policy = await tx.organizationSettings.findUnique({ where: { organizationId }, select: { halfDayThresholdMins: true, workDays: true } });
      const activeTask = await tx.workSession.findFirst({ where: { organizationId, userId: user.id, attendanceId: attendance.id, taskId: { not: null }, endedAt: null }, select: { id: true, taskId: true, startedAt: true } });
      const holiday = await tx.organizationHoliday.findUnique({ where: { organizationId_holidayDate: { organizationId, holidayDate: attendance.attendanceDate } }, select: { id: true } });
      const now = new Date();
      const totalMinutes = durationMinutes(lockedOffice.startedAt, now);
      for (const activeBreak of lockedOffice.breaks) {
        await tx.break.update({ where: { id: activeBreak.id }, data: { endedAt: now, durationMins: durationMinutes(activeBreak.startedAt, now) } });
      }
      if (activeTask) {
        await tx.workSession.update({ where: { id: activeTask.id }, data: { endedAt: now, durationMins: durationMinutes(activeTask.startedAt, now) } });
        await tx.activityLog.create({ data: { organizationId, actorId: user.id, action: "task.timer_paused", entityType: "task", entityId: activeTask.taskId, metadata: { reason: "checkout" } } });
      }
      await tx.workSession.update({ where: { id: lockedOffice.id }, data: { endedAt: now, durationMins: durationMinutes(lockedOffice.startedAt, now) } });
      const breaks = await tx.break.findMany({ where: { attendanceId: attendance.id }, select: { startedAt: true, endedAt: true } });
      const hours = workingSummary({ attendance: { startedAt: attendance.checkInAt, endedAt: now }, breaks, tasks: [], now });
      const expected = !holiday && (policy?.workDays ?? ORGANIZATION_SETTINGS_DEFAULTS.workDays).includes(attendance.attendanceDate.getUTCDay());
      isHalfDay = expected && hours.netMs < (policy?.halfDayThresholdMins ?? ORGANIZATION_SETTINGS_DEFAULTS.halfDayThresholdMins) * 60_000;
      await tx.attendance.update({ where: { id: attendance.id }, data: { checkOutAt: now, status: isHalfDay ? "HALF_DAY" : attendance.status } });
      await tx.activityLog.create({
        data: { organizationId, actorId: user.id, action: "attendance.checked_out", entityType: "attendance", entityId: attendance.id, metadata: { source: "web", durationMins: totalMinutes, status: isHalfDay ? "HALF_DAY" : attendance.status } },
      });
      return true;
    });
    if (!closed) return { message: "That work session is already closed or unavailable." };
  } catch {
    return { message: "Check-out could not be recorded. Refresh the page and try again." };
  }

  refreshAttendance();
  return { success: true, message: isHalfDay ? "Checked out. Your net work time is below the organization’s half-day threshold." : "Checked out successfully. Your hours are saved." };
}
