"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOrganizationPermission } from "@/lib/dal/auth";
import { attendanceActionSchema, type FormState } from "@/lib/validations";
import { attendanceWorkdayKey, databaseDate, durationMinutes, isLateCheckIn } from "@/lib/date-time";
import { createNotifications, getAuthorizedReviewerIds } from "@/lib/notifications";
import { assertActiveOrganizationAccess } from "@/lib/member-access";
import { lockTransaction as lockUser } from "@/lib/transaction-lock";

const DEFAULT_SETTINGS = {
  timezone: "Asia/Kolkata",
  workdayStart: "09:00",
  workdayEnd: "18:00",
  overnightShiftEnabled: false,
  lateGraceMins: 15,
};

function refreshAttendance() {
  revalidatePath("/employee/attendance");
  revalidatePath("/dashboard/attendance");
  revalidatePath("/employee");
  revalidatePath("/dashboard");
}

function parseOrganization(formData: FormData) {
  return attendanceActionSchema.safeParse({ organizationId: String(formData.get("organizationId") ?? "") });
}

export async function checkIn(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseOrganization(formData);
  if (!parsed.success) return { message: "Your organization could not be verified." };

  const authorization = await requireOrganizationPermission(parsed.data.organizationId, "attendance:update-own");
  const now = new Date();
  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId: parsed.data.organizationId },
    select: { timezone: true, workdayStart: true, workdayEnd: true, overnightShiftEnabled: true, lateGraceMins: true },
  }) ?? DEFAULT_SETTINGS;
  const workdayKey = attendanceWorkdayKey(now, settings.timezone, settings.workdayStart, settings.workdayEnd, settings.overnightShiftEnabled);
  const attendanceDate = databaseDate(workdayKey);

  const [existing, openSession, approvedLeave] = await Promise.all([
    prisma.attendance.findUnique({
      where: { organizationId_userId_attendanceDate: { organizationId: parsed.data.organizationId, userId: authorization.user.id, attendanceDate } },
      select: { id: true, checkInAt: true, checkOutAt: true },
    }),
    prisma.workSession.findFirst({ where: { userId: authorization.user.id, endedAt: null, taskId: null }, select: { id: true } }),
    prisma.leaveRequest.findFirst({
      where: { organizationId: parsed.data.organizationId, userId: authorization.user.id, status: "APPROVED", startDate: { lte: attendanceDate }, endDate: { gte: attendanceDate } },
      select: { id: true },
    }),
  ]);

  if (approvedLeave) return { message: "You have approved leave for today. Contact your manager if this changed." };
  if (existing?.checkOutAt) return { message: "Today’s attendance is already complete." };
  if (existing?.checkInAt || openSession) return { message: "You are already checked in." };

  const isLate = isLateCheckIn(now, workdayKey, settings.timezone, settings.workdayStart, settings.lateGraceMins);

  try {
    await prisma.$transaction(async (tx) => {
      await lockUser(tx, authorization.user.id);
      await assertActiveOrganizationAccess(tx, parsed.data.organizationId, authorization.user.id, "attendance:update-own");
      const [lockedAttendance, lockedOpen] = await Promise.all([
        tx.attendance.findUnique({ where: { organizationId_userId_attendanceDate: { organizationId: parsed.data.organizationId, userId: authorization.user.id, attendanceDate } }, select: { checkInAt: true, checkOutAt: true } }),
        tx.workSession.findFirst({ where: { userId: authorization.user.id, taskId: null, endedAt: null }, select: { id: true } }),
      ]);
      if (lockedAttendance?.checkInAt || lockedAttendance?.checkOutAt || lockedOpen) throw new Error("ATTENDANCE_STATE_CHANGED");
      const attendance = await tx.attendance.upsert({
        where: { organizationId_userId_attendanceDate: { organizationId: parsed.data.organizationId, userId: authorization.user.id, attendanceDate } },
        create: { organizationId: parsed.data.organizationId, userId: authorization.user.id, attendanceDate, checkInAt: now, status: isLate ? "LATE" : "PRESENT" },
        update: { checkInAt: now, checkOutAt: null, status: isLate ? "LATE" : "PRESENT" },
      });
      await tx.workSession.create({ data: { organizationId: parsed.data.organizationId, attendanceId: attendance.id, userId: authorization.user.id, startedAt: now } });
      await tx.activityLog.create({
        data: { organizationId: parsed.data.organizationId, actorId: authorization.user.id, action: "attendance.checked_in", entityType: "attendance", entityId: attendance.id, metadata: { source: "web", status: isLate ? "LATE" : "PRESENT" } },
      });
      if (isLate) {
        const reviewers = await getAuthorizedReviewerIds(tx, parsed.data.organizationId, authorization.user.id);
        await createNotifications(tx, reviewers, { organizationId: parsed.data.organizationId, actorId: authorization.user.id, type: "ATTENDANCE", title: "Late check-in recorded", message: `${authorization.user.name || authorization.user.email} checked in after the grace period.`, link: `/dashboard/attendance?date=${attendanceDate.toISOString().slice(0, 10)}`, relatedEntityType: "attendance", relatedEntityId: attendance.id, eventId: `attendance.late:${attendance.id}`, metadata: { attendanceId: attendance.id, status: "LATE" } });
      }
    });
  } catch {
    return { message: "Check-in could not be recorded. Refresh the page and try again." };
  }

  refreshAttendance();
  return { success: true, message: isLate ? "Checked in. Your arrival was recorded as late." : "Checked in successfully. Have a productive day!" };
}

export async function checkOut(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = parseOrganization(formData);
  if (!parsed.success) return { message: "Your organization could not be verified." };

  const authorization = await requireOrganizationPermission(parsed.data.organizationId, "attendance:update-own");
  const now = new Date();
  const [session, policy] = await Promise.all([
    prisma.workSession.findFirst({
      where: { userId: authorization.user.id, endedAt: null, taskId: null, attendance: { organizationId: parsed.data.organizationId } },
      include: { attendance: true, breaks: { where: { endedAt: null } } },
      orderBy: { startedAt: "desc" },
    }),
    prisma.organizationSettings.findUnique({ where: { organizationId: parsed.data.organizationId }, select: { halfDayThresholdMins: true } }),
  ]);

  if (!session?.attendance.checkInAt) return { message: "No active work session was found. Check in before ending your workday." };
  const attendance = session.attendance;
  const totalMinutes = durationMinutes(session.startedAt, now);
  let isHalfDay = false;
  try {
    await prisma.$transaction(async (tx) => {
      await lockUser(tx, authorization.user.id);
      await assertActiveOrganizationAccess(tx, parsed.data.organizationId, authorization.user.id, "attendance:update-own");
      const [lockedOffice, activeTask] = await Promise.all([
        tx.workSession.findFirst({ where: { id: session.id, endedAt: null }, include: { breaks: { where: { endedAt: null } } } }),
        tx.workSession.findFirst({ where: { organizationId: parsed.data.organizationId, userId: authorization.user.id, taskId: { not: null }, endedAt: null }, select: { id: true, taskId: true, startedAt: true } }),
      ]);
      if (!lockedOffice) throw new Error("ATTENDANCE_STATE_CHANGED");
      for (const activeBreak of lockedOffice.breaks) {
        await tx.break.update({ where: { id: activeBreak.id }, data: { endedAt: now, durationMins: durationMinutes(activeBreak.startedAt, now) } });
      }
      if (activeTask) {
        await tx.workSession.update({ where: { id: activeTask.id }, data: { endedAt: now, durationMins: durationMinutes(activeTask.startedAt, now) } });
        await tx.activityLog.create({ data: { organizationId: parsed.data.organizationId, actorId: authorization.user.id, action: "task.timer_paused", entityType: "task", entityId: activeTask.taskId, metadata: { reason: "checkout" } } });
      }
      await tx.workSession.update({ where: { id: lockedOffice.id }, data: { endedAt: now, durationMins: durationMinutes(lockedOffice.startedAt, now) } });
      const breakTotals = await tx.break.aggregate({ where: { attendanceId: attendance.id }, _sum: { durationMins: true } });
      const netMinutes = Math.max(0, totalMinutes - (breakTotals._sum.durationMins ?? 0));
      isHalfDay = netMinutes < (policy?.halfDayThresholdMins ?? 240);
      await tx.attendance.update({ where: { id: attendance.id }, data: { checkOutAt: now, status: isHalfDay ? "HALF_DAY" : attendance.status } });
      await tx.activityLog.create({
        data: { organizationId: parsed.data.organizationId, actorId: authorization.user.id, action: "attendance.checked_out", entityType: "attendance", entityId: attendance.id, metadata: { source: "web", durationMins: totalMinutes, status: isHalfDay ? "HALF_DAY" : attendance.status } },
      });
    });
  } catch {
    return { message: "Check-out could not be recorded. Refresh the page and try again." };
  }

  refreshAttendance();
  return { success: true, message: isHalfDay ? "Checked out. Your net work time is below the organization’s half-day threshold." : "Checked out successfully. Your hours are saved." };
}
