"use server";

import { revalidatePath } from "next/cache";
import type { LeaveStatus, LeaveType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireCurrentOrganization, requireOrganizationPermission } from "@/lib/dal/auth";
import { databaseDate, dateKeyInZone } from "@/lib/date-time";
import { countWorkingLeaveDays, monthBounds, workingLeaveDateKeys } from "@/lib/leave";
import { leaveCancelSchema, leaveDecisionSchema, leaveRequestSchema, type FormState } from "@/lib/validations";
import { createNotification, createNotifications, getAuthorizedReviewerIds } from "@/lib/notifications";
import { allowedValue, boundedPage } from "@/lib/search/params";
import { lockTransaction as lock } from "@/lib/transaction-lock";

const value = (formData: FormData, key: string) => String(formData.get(key) ?? "");
const refresh = () => { revalidatePath("/employee/leave"); revalidatePath("/dashboard/leave"); revalidatePath("/employee/attendance"); revalidatePath("/dashboard/attendance"); revalidatePath("/dashboard/reports"); revalidatePath("/dashboard"); revalidatePath("/employee"); };
const teamLeadScope = (role: string, actorId: string): Prisma.LeaveRequestWhereInput => role === "TEAM_LEAD" ? { user: { teamMembers: { some: { team: { managerId: actorId } } } } } : {};

async function policyData(client: Prisma.TransactionClient | typeof prisma, organizationId: string, startDate: string, endDate: string) {
  const [settings, holidays] = await Promise.all([
    client.organizationSettings.findUnique({ where: { organizationId }, select: { workDays: true, allowOverlappingLeaveRequests: true, timezone: true, availableLeaveTypes: true, leaveAdvanceNoticeDays: true, allowPastDateLeaveRequests: true } }),
    client.organizationHoliday.findMany({ where: { organizationId, holidayDate: { gte: databaseDate(startDate), lte: databaseDate(endDate) } }, select: { holidayDate: true } }),
  ]);
  const holidayDateKeys = new Set(holidays.map((item) => item.holidayDate.toISOString().slice(0, 10)));
  const workDays = settings?.workDays ?? [1, 2, 3, 4, 5];
  return { workDays, holidayDateKeys, allowOverlaps: settings?.allowOverlappingLeaveRequests ?? false, timezone: settings?.timezone ?? "Asia/Kolkata", availableLeaveTypes: settings?.availableLeaveTypes ?? ["CASUAL", "SICK", "EARNED", "UNPAID", "OTHER"], leaveAdvanceNoticeDays: settings?.leaveAdvanceNoticeDays ?? 0, allowPastDateLeaveRequests: settings?.allowPastDateLeaveRequests ?? false };
}

export async function createLeaveRequest(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = leaveRequestSchema.safeParse({ organizationId: value(formData, "organizationId"), type: value(formData, "type"), startDate: value(formData, "startDate"), endDate: value(formData, "endDate"), reason: value(formData, "reason"), notes: value(formData, "notes") });
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors, message: "Review the highlighted leave fields." };
  const authorization = await requireOrganizationPermission(parsed.data.organizationId, "leave:manage-own");
  try {
    await prisma.$transaction(async (tx) => {
      await lock(tx, `leave:${parsed.data.organizationId}:${authorization.user.id}`);
      const policy = await policyData(tx, parsed.data.organizationId, parsed.data.startDate, parsed.data.endDate);
      if (!policy.availableLeaveTypes.includes(parsed.data.type)) throw new Error("LEAVE_TYPE_DISABLED");
      const todayKey = dateKeyInZone(new Date(), policy.timezone);
      const daysNotice = Math.floor((databaseDate(parsed.data.startDate).getTime() - databaseDate(todayKey).getTime()) / 86_400_000);
      if (!policy.allowPastDateLeaveRequests && daysNotice < 0) throw new Error("PAST_DATE_DISABLED");
      if (daysNotice < policy.leaveAdvanceNoticeDays) throw new Error("INSUFFICIENT_NOTICE");
      const workingDays = countWorkingLeaveDays(parsed.data.startDate, parsed.data.endDate, policy);
      if (workingDays < 1) throw new Error("NO_WORKING_DAYS");
      if (!policy.allowOverlaps) {
        const overlap = await tx.leaveRequest.findFirst({ where: { organizationId: parsed.data.organizationId, userId: authorization.user.id, status: { in: ["PENDING", "APPROVED"] }, startDate: { lte: databaseDate(parsed.data.endDate) }, endDate: { gte: databaseDate(parsed.data.startDate) } }, select: { id: true } });
        if (overlap) throw new Error("OVERLAPPING_LEAVE");
      }
      const request = await tx.leaveRequest.create({ data: { organizationId: parsed.data.organizationId, userId: authorization.user.id, type: parsed.data.type, startDate: databaseDate(parsed.data.startDate), endDate: databaseDate(parsed.data.endDate), reason: parsed.data.reason, notes: parsed.data.notes, workingDays } });
      await tx.activityLog.create({ data: { organizationId: parsed.data.organizationId, actorId: authorization.user.id, action: "leave.requested", entityType: "leave_request", entityId: request.id, metadata: { type: request.type, startDate: parsed.data.startDate, endDate: parsed.data.endDate, workingDays } } });
      const reviewers = await getAuthorizedReviewerIds(tx, parsed.data.organizationId, authorization.user.id);
      await createNotifications(tx, reviewers, { organizationId: parsed.data.organizationId, actorId: authorization.user.id, type: "LEAVE_REQUESTED", title: "Leave request submitted", message: `${authorization.user.name || authorization.user.email} requested ${request.type.toLowerCase()} leave.`, link: `/dashboard/leave?request=${request.id}`, relatedEntityType: "leave_request", relatedEntityId: request.id, eventId: `leave.requested:${request.id}`, metadata: { leaveRequestId: request.id, type: request.type } });
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "NO_WORKING_DAYS") return { message: "The selected range contains no configured working days." };
    if (code === "LEAVE_TYPE_DISABLED") return { message: "This leave type is not available under the current organization policy." };
    if (code === "PAST_DATE_DISABLED") return { message: "Past-date leave requests are disabled by your organization." };
    if (code === "INSUFFICIENT_NOTICE") return { message: "This request does not meet the organization’s minimum advance notice." };
    if (code === "OVERLAPPING_LEAVE") return { message: "This request overlaps another pending or approved leave request." };
    return { message: "The leave request could not be submitted. Refresh and try again." };
  }
  refresh();
  return { success: true, message: "Leave request submitted for review." };
}

export async function cancelLeaveRequest(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = leaveCancelSchema.safeParse({ organizationId: value(formData, "organizationId"), leaveRequestId: value(formData, "leaveRequestId") });
  if (!parsed.success) return { message: "The leave request could not be verified." };
  const authorization = await requireOrganizationPermission(parsed.data.organizationId, "leave:manage-own");
  try {
    await prisma.$transaction(async (tx) => {
      await lock(tx, `leave-request:${parsed.data.leaveRequestId}`);
      const request = await tx.leaveRequest.findFirst({ where: { id: parsed.data.leaveRequestId, organizationId: parsed.data.organizationId, userId: authorization.user.id }, select: { id: true, status: true, type: true } });
      if (!request) throw new Error("NOT_FOUND");
      if (request.status !== "PENDING") throw new Error("INVALID_STATE");
      await tx.leaveRequest.update({ where: { id: request.id }, data: { status: "CANCELLED" } });
      await tx.attendance.deleteMany({ where: { leaveRequestId: request.id, checkInAt: null, checkOutAt: null } });
      await tx.activityLog.create({ data: { organizationId: parsed.data.organizationId, actorId: authorization.user.id, action: "leave.cancelled", entityType: "leave_request", entityId: request.id } });
      const reviewers = await getAuthorizedReviewerIds(tx, parsed.data.organizationId, authorization.user.id);
      await createNotifications(tx, reviewers, { organizationId: parsed.data.organizationId, actorId: authorization.user.id, type: "LEAVE_UPDATED", title: "Leave request cancelled", message: `${authorization.user.name || authorization.user.email} cancelled a ${request.type.toLowerCase()} leave request.`, link: `/dashboard/leave?request=${request.id}`, relatedEntityType: "leave_request", relatedEntityId: request.id, eventId: `leave.cancelled:${request.id}`, metadata: { leaveRequestId: request.id, status: "CANCELLED" } });
    });
  } catch (error) {
    return { message: error instanceof Error && error.message === "INVALID_STATE" ? "Only pending leave requests can be cancelled." : "The leave request could not be cancelled." };
  }
  refresh();
  return { success: true, message: "Leave request cancelled." };
}

async function reviewLeave(decision: "APPROVED" | "REJECTED", formData: FormData): Promise<FormState> {
  const parsed = leaveDecisionSchema.safeParse({ organizationId: value(formData, "organizationId"), leaveRequestId: value(formData, "leaveRequestId"), decisionNotes: value(formData, "decisionNotes") });
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors, message: "Review the decision details." };
  const authorization = await requireOrganizationPermission(parsed.data.organizationId, "leave:review");
  const effectiveRole = authorization.membership?.role ?? authorization.user.role;
  try {
    await prisma.$transaction(async (tx) => {
      await lock(tx, `leave-request:${parsed.data.leaveRequestId}`);
      const request = await tx.leaveRequest.findFirst({ where: { id: parsed.data.leaveRequestId, organizationId: parsed.data.organizationId, ...teamLeadScope(effectiveRole, authorization.user.id) }, include: { user: { select: { name: true } } } });
      if (!request) throw new Error("NOT_FOUND");
      if (request.userId === authorization.user.id) throw new Error("SELF_REVIEW");
      if (request.status !== "PENDING") throw new Error("INVALID_STATE");
      const startKey = request.startDate.toISOString().slice(0, 10);
      const endKey = request.endDate.toISOString().slice(0, 10);
      const policy = await policyData(tx, parsed.data.organizationId, startKey, endKey);
      const workingDates = workingLeaveDateKeys(startKey, endKey, policy);
      if (!policy.allowOverlaps && decision === "APPROVED") {
        const conflict = await tx.leaveRequest.findFirst({ where: { id: { not: request.id }, organizationId: request.organizationId, userId: request.userId, status: "APPROVED", startDate: { lte: request.endDate }, endDate: { gte: request.startDate } }, select: { id: true } });
        if (conflict) throw new Error("OVERLAPPING_LEAVE");
      }
      let hasAttendanceConflict = false;
      if (decision === "APPROVED") {
        for (const dateKey of workingDates) {
          const attendanceDate = databaseDate(dateKey);
          const existing = await tx.attendance.findUnique({ where: { organizationId_userId_attendanceDate: { organizationId: request.organizationId, userId: request.userId, attendanceDate } }, select: { id: true, checkInAt: true, checkOutAt: true, leaveRequestId: true } });
          if (existing?.checkInAt || existing?.checkOutAt) { hasAttendanceConflict = true; continue; }
          await tx.attendance.upsert({ where: { organizationId_userId_attendanceDate: { organizationId: request.organizationId, userId: request.userId, attendanceDate } }, create: { organizationId: request.organizationId, userId: request.userId, attendanceDate, status: "ON_LEAVE", leaveRequestId: request.id, notes: "Approved leave projection" }, update: { status: "ON_LEAVE", leaveRequestId: request.id, notes: "Approved leave projection" } });
        }
      } else {
        await tx.attendance.deleteMany({ where: { leaveRequestId: request.id, checkInAt: null, checkOutAt: null } });
      }
      const now = new Date();
      await tx.leaveRequest.update({ where: { id: request.id }, data: { status: decision, reviewNote: parsed.data.decisionNotes, reviewedById: authorization.user.id, reviewedAt: now, workingDays: workingDates.length, hasAttendanceConflict } });
      const action = decision === "APPROVED" ? "leave.approved" : "leave.rejected";
      await Promise.all([
        tx.activityLog.create({ data: { organizationId: request.organizationId, actorId: authorization.user.id, action, entityType: "leave_request", entityId: request.id, metadata: { type: request.type, startDate: startKey, endDate: endKey, attendanceConflict: hasAttendanceConflict } } }),
        createNotification(tx, { organizationId: request.organizationId, userId: request.userId, actorId: authorization.user.id, type: "LEAVE_UPDATED", title: decision === "APPROVED" ? "Leave request approved" : "Leave request rejected", message: `${request.type.toLowerCase().replaceAll("_", " ")} leave · ${startKey} to ${endKey}`, link: "/employee/leave", relatedEntityType: "leave_request", relatedEntityId: request.id, eventId: `leave.reviewed:${request.id}:${decision}`, metadata: { leaveRequestId: request.id, status: decision } }),
      ]);
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "SELF_REVIEW") return { message: "You cannot review your own leave request." };
    if (code === "INVALID_STATE") return { message: "This request has already been reviewed or cancelled." };
    if (code === "OVERLAPPING_LEAVE") return { message: "This leave conflicts with another approved request." };
    return { message: "The decision could not be saved. Refresh and try again." };
  }
  refresh();
  return { success: true, message: decision === "APPROVED" ? "Leave approved and attendance updated." : "Leave request rejected." };
}

export async function approveLeaveRequest(_state: FormState, formData: FormData) { return reviewLeave("APPROVED", formData); }
export async function rejectLeaveRequest(_state: FormState, formData: FormData) { return reviewLeave("REJECTED", formData); }

export async function getMyLeaveRequests() {
  const { user, organization } = await requireCurrentOrganization("leave:manage-own");
  return prisma.leaveRequest.findMany({ where: { organizationId: organization.id, userId: user.id }, include: { reviewedBy: { select: { name: true } } }, orderBy: { createdAt: "desc" } });
}

export async function getManagerLeaveRequests(organizationId: string, filters?: { q?: string; teamId?: string; employeeId?: string; status?: LeaveStatus; type?: LeaveType; from?: string; to?: string; page?: number; pageSize?: number; sort?: string }) {
  const authorization = await requireOrganizationPermission(organizationId, "leave:review");
  const role = authorization.membership?.role ?? authorization.user.role;
  const where: Prisma.LeaveRequestWhereInput = { organizationId, AND: [teamLeadScope(role, authorization.user.id), filters?.q ? { OR: [{ user: { name: { contains: filters.q, mode: "insensitive" } } }, { user: { email: { contains: filters.q, mode: "insensitive" } } }] } : {}, filters?.teamId ? { user: { teamMembers: { some: { teamId: filters.teamId } } } } : {}], ...(filters?.employeeId ? { userId: filters.employeeId } : {}), ...(filters?.status ? { status: filters.status } : {}), ...(filters?.type ? { type: filters.type } : {}), ...(filters?.from || filters?.to ? { startDate: { ...(filters.from ? { gte: databaseDate(filters.from) } : {}), ...(filters.to ? { lte: databaseDate(filters.to) } : {}) } } : {}) };
  const page = Math.max(1, filters?.page ?? 1);
  const pageSize = [10, 20, 50].includes(filters?.pageSize ?? 20) ? filters?.pageSize ?? 20 : 20;
  const sort = allowedValue(filters?.sort, ["newest", "oldest", "start_asc", "start_desc", "status"] as const) ?? "newest";
  const orderBy: Prisma.LeaveRequestOrderByWithRelationInput[] = sort === "oldest" ? [{ createdAt: "asc" }, { id: "asc" }] : sort === "start_asc" ? [{ startDate: "asc" }, { id: "asc" }] : sort === "start_desc" ? [{ startDate: "desc" }, { id: "asc" }] : sort === "status" ? [{ status: "asc" }, { createdAt: "desc" }, { id: "asc" }] : [{ createdAt: "desc" }, { id: "asc" }];
  const include = { user: { include: { teamMembers: { where: { team: { organizationId } }, include: { team: true }, take: 1 } } }, reviewedBy: { select: { name: true } } } satisfies Prisma.LeaveRequestInclude;
  const [initialRequests, total] = await Promise.all([prisma.leaveRequest.findMany({ where, include, orderBy, skip: (page - 1) * pageSize, take: pageSize }), prisma.leaveRequest.count({ where })]);
  const pageInfo = boundedPage(page, total, pageSize);
  const requests = pageInfo.page === page ? initialRequests : await prisma.leaveRequest.findMany({ where, include, orderBy, skip: (pageInfo.page - 1) * pageSize, take: pageSize });
  return { requests, total, page: pageInfo.page, pages: pageInfo.pages, pageSize };
}

export async function getLeaveRequestById(organizationId: string, leaveRequestId: string) {
  const authorization = await requireOrganizationPermission(organizationId, "leave:review");
  const role = authorization.membership?.role ?? authorization.user.role;
  return prisma.leaveRequest.findFirst({ where: { id: leaveRequestId, organizationId, ...teamLeadScope(role, authorization.user.id) }, include: { user: { include: { teamMembers: { where: { team: { organizationId } }, include: { team: true } } } }, reviewedBy: { select: { name: true, email: true } } } });
}

export async function getLeaveCalendar(organizationId: string, month: string, filters?: { teamId?: string; department?: string }) {
  const authorization = await requireOrganizationPermission(organizationId, "leave:review");
  const role = authorization.membership?.role ?? authorization.user.role;
  const bounds = monthBounds(month);
  return prisma.leaveRequest.findMany({ where: { organizationId, status: "APPROVED", startDate: { lte: databaseDate(bounds.end) }, endDate: { gte: databaseDate(bounds.start) }, AND: [teamLeadScope(role, authorization.user.id), filters?.teamId ? { user: { teamMembers: { some: { teamId: filters.teamId } } } } : {}, filters?.department ? { user: { organizationMembers: { some: { organizationId, department: filters.department } } } } : {}] }, select: { id: true, type: true, startDate: true, endDate: true, user: { select: { name: true, email: true } } }, orderBy: { startDate: "asc" } });
}

export async function getLeaveSummary(organizationId: string) {
  const authorization = await requireOrganizationPermission(organizationId, "leave:review");
  const role = authorization.membership?.role ?? authorization.user.role;
  const scope = teamLeadScope(role, authorization.user.id);
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const today = databaseDate(now.toISOString().slice(0, 10));
  const [pending, approvedThisMonth, rejectedThisMonth, currentlyOnLeave, upcoming] = await Promise.all([
    prisma.leaveRequest.count({ where: { organizationId, status: "PENDING", ...scope } }),
    prisma.leaveRequest.count({ where: { organizationId, status: "APPROVED", reviewedAt: { gte: monthStart }, ...scope } }),
    prisma.leaveRequest.count({ where: { organizationId, status: "REJECTED", reviewedAt: { gte: monthStart }, ...scope } }),
    prisma.leaveRequest.count({ where: { organizationId, status: "APPROVED", startDate: { lte: today }, endDate: { gte: today }, ...scope } }),
    prisma.leaveRequest.count({ where: { organizationId, status: "APPROVED", startDate: { gt: today }, ...scope } }),
  ]);
  return { pending, approvedThisMonth, rejectedThisMonth, currentlyOnLeave, upcoming };
}
