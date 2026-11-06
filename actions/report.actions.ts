"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireCurrentOrganization, requireOrganizationPermission } from "@/lib/dal/auth";
import { dailyReportSchema, type FormState } from "@/lib/validations";
import { databaseDate, isValidDateKey } from "@/lib/date-time";
import { getReportDayData, getReportSettings, reportSnapshot, reportUserScope, reportWorkday } from "@/lib/reports";
import { createNotification, createNotifications, getAuthorizedReviewerIds } from "@/lib/notifications";
import { assertActiveOrganizationAccess } from "@/lib/member-access";
import { employeeTeamOrder } from "@/lib/employee-policy";
import { lockTransaction } from "@/lib/transaction-lock";

const value = (formData: FormData, key: string) => String(formData.get(key) ?? "");
const parse = (formData: FormData) => dailyReportSchema.safeParse({ organizationId: value(formData, "organizationId"), reportDate: value(formData, "reportDate"), summary: value(formData, "summary"), completedWork: value(formData, "completedWork"), progress: value(formData, "progress"), blockers: value(formData, "blockers"), nextPlan: value(formData, "nextPlan"), additionalNotes: value(formData, "additionalNotes"), pulse: value(formData, "pulse"), pulseBlocker: value(formData, "pulseBlocker") });
const refresh = (reportId: string) => { revalidatePath("/employee/reports"); revalidatePath("/dashboard/reports"); revalidatePath("/employee"); revalidatePath("/dashboard"); revalidatePath(`/dashboard/reports/${reportId}`); };

async function persist(formData: FormData, submit: boolean): Promise<FormState> {
  const parsed = parse(formData);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors, message: "Review the highlighted report fields." };
  const { organizationId, reportDate: dateKey, summary, completedWork, progress, blockers, nextPlan, additionalNotes, pulse, pulseBlocker } = parsed.data;
  const { user } = await requireOrganizationPermission(organizationId, "reports:manage-own");
  const reportDate = databaseDate(dateKey);
  const key = { organizationId, userId: user.id, reportDate };
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Use the same employee lock as attendance and timers when taking the snapshot.
      await lockTransaction(tx, user.id);
      await assertActiveOrganizationAccess(tx, organizationId, user.id, "reports:manage-own");
      const now = new Date();
      const settings = await getReportSettings(organizationId, tx);
      if (dateKey > reportWorkday(now, settings)) return { message: "Reports cannot be created for a future workday." };
      const existing = await tx.dailyReport.findUnique({ where: { organizationId_userId_reportDate: key }, select: { id: true, status: true, pulse: { select: { id: true } } } });
      const revising = existing?.status === "SUBMITTED";
      if (existing?.status === "REVIEWED" || (revising && !settings.allowReportEditingAfterSubmission)) return { message: "This report is already submitted and read-only." };
      if (revising && submit) return { message: "This report is already submitted. Save a revision to make changes." };

      const dayData = await getReportDayData(organizationId, user.id, dateKey, settings, now, tx);
      if (submit && !dayData.attendance?.checkInAt) return { message: "A verified attendance record is required before submission." };
      if (submit && dayData.provisional && !settings.allowReportBeforeCheckout) return { message: "Your organization requires checkout before report submission." };
      if (!existing && !dayData.attendance?.checkInAt) {
        const holiday = await tx.organizationHoliday.findUnique({ where: { organizationId_holidayDate: { organizationId, holidayDate: reportDate } }, select: { id: true } });
        if (holiday || !settings.workDays.includes(reportDate.getUTCDay())) return { message: "This date is not a configured reporting workday." };
      }
      const team = existing?.pulse ? null : await tx.teamMember.findFirst({ where: { userId: user.id, team: { organizationId } }, orderBy: employeeTeamOrder, select: { teamId: true } });
      if (!team && !existing?.pulse) return { message: "A team assignment is required before saving a Team Pulse." };

      const content = {
        attendanceId: dayData.attendance?.id ?? null, summary, completedWork: completedWork ?? null, progress: progress ?? null,
        blockers: blockers ?? null, nextPlan: nextPlan ?? null, additionalNotes: additionalNotes ?? null, snapshot: reportSnapshot(dayData),
      };
      const status = submit || revising ? "SUBMITTED" : "DRAFT";
      const saved = await tx.dailyReport.upsert({
        where: { organizationId_userId_reportDate: key },
        create: { ...key, ...content, status, submittedAt: submit ? now : null },
        update: { ...content, status, ...(submit ? { submittedAt: now } : {}) },
        select: { id: true },
      });
      await tx.dailyReportTask.deleteMany({ where: { dailyReportId: saved.id } });
      if (dayData.tasks.length) await tx.dailyReportTask.createMany({ data: dayData.tasks.map((task) => ({ dailyReportId: saved.id, taskId: task.id, titleSnapshot: task.title, statusSnapshot: task.status, completedToday: task.completedToday, minutesSpent: Math.floor(task.milliseconds / 60000) })) });

      const pulseFields = { score: pulse === "SMOOTH" ? 5 : pulse === "NORMAL" ? 3 : 1, mood: pulse, note: pulse === "BLOCKED" ? pulseBlocker : null };
      if (existing?.pulse) await tx.teamPulse.update({ where: { id: existing.pulse.id }, data: pulseFields });
      if (team) await tx.teamPulse.upsert({
        where: { teamId_userId_pulseDate: { teamId: team.teamId, userId: user.id, pulseDate: reportDate } },
        create: { organizationId, teamId: team.teamId, userId: user.id, dailyReportId: saved.id, pulseDate: reportDate, ...pulseFields },
        update: { dailyReportId: saved.id, ...pulseFields },
      });
      if (submit || !existing || revising) await tx.activityLog.create({ data: { organizationId, actorId: user.id, action: revising ? "daily_report.revised" : submit ? "daily_report.submitted" : "daily_report.draft_created", entityType: "daily_report", entityId: saved.id, metadata: { reportDate: dateKey, provisional: dayData.provisional } } });
      if (submit) {
        const reviewers = await getAuthorizedReviewerIds(tx, organizationId, user.id);
        const requiresAttention = pulse === "BLOCKED" || Boolean(blockers);
        await createNotifications(tx, reviewers, { organizationId, actorId: user.id, type: "REPORT_SUBMITTED", title: requiresAttention ? "Report requires attention" : "Daily report submitted", message: `${user.name || user.email} submitted the ${dateKey} report.`, link: `/dashboard/reports/${saved.id}`, relatedEntityType: "daily_report", relatedEntityId: saved.id, eventId: `daily_report.submitted:${saved.id}`, metadata: { reportId: saved.id, reportDate: dateKey, requiresAttention } });
      }
      return { id: saved.id, message: revising ? "Submitted report revised." : submit ? "Daily report submitted." : "Draft saved." };
    });
    if (!result.id) return { message: result.message };
    refresh(result.id);
    return { success: true, message: result.message };
  } catch {
    return { message: "The report could not be saved. Refresh and try again." };
  }
}

export async function updateDailyReport(_state: FormState, formData: FormData): Promise<FormState> {
  const operation = formData.get("operation");
  if (operation !== "save" && operation !== "submit") return { message: "Choose a valid report action." };
  return persist(formData, operation === "submit");
}

export async function reviewDailyReport(_state: FormState, formData: FormData): Promise<FormState> {
  const organizationId = value(formData, "organizationId");
  const id = value(formData, "reportId");
  const version = value(formData, "version");
  if (!id || !organizationId || !version) return { message: "The report could not be verified." };
  const { user } = await requireOrganizationPermission(organizationId, "reports:read-all");
  try {
    const outcome = await prisma.$transaction(async (tx) => {
      const target = await tx.dailyReport.findFirst({ where: { id, organizationId }, select: { userId: true } });
      if (!target) return "The report could not be verified.";
      if (target.userId === user.id) return "You cannot review your own report.";
      for (const userId of [target.userId, user.id].sort()) await lockTransaction(tx, userId);
      const role = await assertActiveOrganizationAccess(tx, organizationId, user.id, "reports:read-all");
      const report = await tx.dailyReport.findFirst({ where: { id, organizationId, user: reportUserScope(organizationId, role, user.id) }, select: { userId: true, reportDate: true, status: true, updatedAt: true } });
      if (!report) return "The report could not be verified.";
      if (report.status === "REVIEWED") return "This report has already been reviewed.";
      if (report.status !== "SUBMITTED") return "Only submitted reports can be reviewed.";
      if (report.updatedAt.toISOString() !== version) return "The report changed. Refresh the page to read the latest revision before reviewing.";
      const dateKey = report.reportDate.toISOString().slice(0, 10);
      await tx.dailyReport.update({ where: { id }, data: { status: "REVIEWED", reviewedAt: new Date(), reviewedById: user.id } });
      await tx.activityLog.create({ data: { organizationId, actorId: user.id, action: "daily_report.reviewed", entityType: "daily_report", entityId: id, metadata: { reportDate: dateKey } } });
      await createNotification(tx, { organizationId, userId: report.userId, actorId: user.id, type: "REPORT_REVIEWED", title: "Daily report reviewed", message: `Your ${dateKey} report was reviewed.`, link: `/employee/reports?date=${dateKey}`, relatedEntityType: "daily_report", relatedEntityId: id, eventId: `daily_report.reviewed:${id}`, metadata: { reportId: id, reportDate: dateKey } });
      return null;
    });
    if (outcome) return { message: outcome };
    refresh(id);
    return { success: true, message: "Report reviewed." };
  } catch {
    return { message: "The review could not be saved. Refresh and try again." };
  }
}

export async function getTodayReportData() {
  const { user, organization } = await requireCurrentOrganization("reports:manage-own");
  const settings = await getReportSettings(organization.id);
  const now = new Date();
  return getReportDayData(organization.id, user.id, reportWorkday(now, settings), settings, now);
}

export async function getMyReportHistory() { const { user, organization } = await requireCurrentOrganization("reports:manage-own"); return prisma.dailyReport.findMany({ where: { organizationId: organization.id, userId: user.id }, orderBy: { reportDate: "desc" }, take: 100 }); }
export async function getReportById(organizationId: string, reportId: string) {
  const { user, membership } = await requireOrganizationPermission(organizationId, "reports:read-all");
  return prisma.dailyReport.findFirst({ where: { id: reportId, organizationId, user: reportUserScope(organizationId, membership?.role ?? user.role, user.id) }, include: {
    user: { select: { name: true, email: true, jobTitle: true } }, reviewedBy: { select: { name: true, email: true } }, pulse: true,
    tasks: { orderBy: [{ completedToday: "desc" }, { titleSnapshot: "asc" }] },
  } });
}

async function managerScope(organizationId: string): Promise<Prisma.DailyReportWhereInput> {
  const { user, membership } = await requireOrganizationPermission(organizationId, "reports:read-all");
  return { organizationId, user: reportUserScope(organizationId, membership?.role ?? user.role, user.id) };
}
export async function getManagerReports(organizationId: string) { return prisma.dailyReport.findMany({ where: await managerScope(organizationId), orderBy: { reportDate: "desc" }, take: 100 }); }
export async function getDailyTeamSummary(organizationId: string, reportDate: string) { const scope = await managerScope(organizationId); if (!isValidDateKey(reportDate)) return []; return prisma.dailyReport.groupBy({ where: { ...scope, reportDate: databaseDate(reportDate) }, by: ["status"], _count: { _all: true } }); }
