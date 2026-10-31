"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireCurrentOrganization, requireOrganizationPermission } from "@/lib/dal/auth";
import { dailyReportSchema, type FormState } from "@/lib/validations";
import { databaseDate, dateKeyInZone } from "@/lib/date-time";
import { getReportDayData, reportSnapshot } from "@/lib/reports";
import { createNotifications, getAuthorizedReviewerIds } from "@/lib/notifications";
import { lockTransaction } from "@/lib/transaction-lock";

const value = (formData: FormData, key: string) => String(formData.get(key) ?? "");
const parse = (formData: FormData) => dailyReportSchema.safeParse({ organizationId: value(formData, "organizationId"), reportDate: value(formData, "reportDate"), summary: value(formData, "summary"), completedWork: value(formData, "completedWork"), progress: value(formData, "progress"), blockers: value(formData, "blockers"), nextPlan: value(formData, "nextPlan"), additionalNotes: value(formData, "additionalNotes"), pulse: value(formData, "pulse"), pulseBlocker: value(formData, "pulseBlocker") });
const refresh = (reportId?: string) => { revalidatePath("/employee/reports"); revalidatePath("/dashboard/reports"); revalidatePath("/employee"); revalidatePath("/dashboard"); if (reportId) revalidatePath(`/dashboard/reports/${reportId}`); };
async function lock(tx: Prisma.TransactionClient, organizationId: string, userId: string, date: string) { await lockTransaction(tx, `${organizationId}:${userId}:${date}`); }

async function persist(formData: FormData, submit: boolean): Promise<FormState> {
  const parsed = parse(formData);
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors, message: "Review the highlighted report fields." };
  const authorization = await requireOrganizationPermission(parsed.data.organizationId, "reports:manage-own");
  const [settings, teamMembership] = await Promise.all([
    prisma.organizationSettings.findUnique({ where: { organizationId: parsed.data.organizationId }, select: { timezone: true, workDays: true, allowReportBeforeCheckout: true, allowReportEditingAfterSubmission: true } }),
    prisma.teamMember.findFirst({ where: { userId: authorization.user.id, team: { organizationId: parsed.data.organizationId } }, select: { teamId: true } }),
  ]);
  if (!teamMembership) return { message: "A team assignment is required before submitting a Team Pulse." };
  const timezone = settings?.timezone ?? "Asia/Kolkata";
  const today = dateKeyInZone(new Date(), timezone);
  if (parsed.data.reportDate > today) return { message: "Reports cannot be created for a future workday." };
  const reportDate = databaseDate(parsed.data.reportDate);
  const dayData = await getReportDayData(parsed.data.organizationId, authorization.user.id, parsed.data.reportDate, timezone);
  const isConfiguredWorkday = (settings?.workDays ?? [1, 2, 3, 4, 5]).includes(reportDate.getUTCDay());
  if (!isConfiguredWorkday && !dayData.attendance) return { message: "This date is not a configured reporting workday." };
  if (submit && !dayData.attendance?.checkInAt) return { message: "A verified attendance record is required before submission." };
  if (submit && dayData.provisional && settings?.allowReportBeforeCheckout === false) return { message: "Your organization requires checkout before report submission." };
  const existing = await prisma.dailyReport.findUnique({ where: { organizationId_userId_reportDate: { organizationId: parsed.data.organizationId, userId: authorization.user.id, reportDate } }, select: { id: true, status: true } });
  if (existing?.status === "REVIEWED" || (existing?.status === "SUBMITTED" && !settings?.allowReportEditingAfterSubmission)) return { message: "This report is already submitted and read-only." };
  const now = new Date();
  try {
    const report = await prisma.$transaction(async (tx) => {
      await lock(tx, parsed.data.organizationId, authorization.user.id, parsed.data.reportDate);
      const locked = await tx.dailyReport.findUnique({ where: { organizationId_userId_reportDate: { organizationId: parsed.data.organizationId, userId: authorization.user.id, reportDate } }, select: { id: true, status: true } });
      if (locked?.status === "REVIEWED" || (locked?.status === "SUBMITTED" && !settings?.allowReportEditingAfterSubmission)) throw new Error("REPORT_ALREADY_SUBMITTED");
      const revisingSubmitted = locked?.status === "SUBMITTED";
      const saved = await tx.dailyReport.upsert({ where: { organizationId_userId_reportDate: { organizationId: parsed.data.organizationId, userId: authorization.user.id, reportDate } }, create: { organizationId: parsed.data.organizationId, userId: authorization.user.id, attendanceId: dayData.attendance?.id, reportDate, status: submit ? "SUBMITTED" : "DRAFT", summary: parsed.data.summary, completedWork: parsed.data.completedWork, progress: parsed.data.progress, blockers: parsed.data.blockers, nextPlan: parsed.data.nextPlan, additionalNotes: parsed.data.additionalNotes, snapshot: reportSnapshot(dayData), submittedAt: submit ? now : null }, update: { attendanceId: dayData.attendance?.id, status: revisingSubmitted ? "SUBMITTED" : submit ? "SUBMITTED" : "DRAFT", summary: parsed.data.summary, completedWork: parsed.data.completedWork, progress: parsed.data.progress, blockers: parsed.data.blockers, nextPlan: parsed.data.nextPlan, additionalNotes: parsed.data.additionalNotes, snapshot: reportSnapshot(dayData), submittedAt: revisingSubmitted ? undefined : submit ? now : null } });
      await tx.dailyReportTask.deleteMany({ where: { dailyReportId: saved.id } });
      if (dayData.tasks.length) await tx.dailyReportTask.createMany({ data: dayData.tasks.map((task) => ({ dailyReportId: saved.id, taskId: task.id, titleSnapshot: task.title, statusSnapshot: task.status as "TODO" | "IN_PROGRESS" | "BLOCKED" | "REVIEW" | "COMPLETED" | "CANCELLED", completedToday: task.completedToday, minutesSpent: Math.floor(task.milliseconds / 60000) })) });
      await tx.teamPulse.upsert({ where: { teamId_userId_pulseDate: { teamId: teamMembership.teamId, userId: authorization.user.id, pulseDate: reportDate } }, create: { organizationId: parsed.data.organizationId, teamId: teamMembership.teamId, userId: authorization.user.id, dailyReportId: saved.id, pulseDate: reportDate, score: parsed.data.pulse === "SMOOTH" ? 5 : parsed.data.pulse === "NORMAL" ? 3 : 1, mood: parsed.data.pulse, note: parsed.data.pulse === "BLOCKED" ? parsed.data.pulseBlocker : null }, update: { dailyReportId: saved.id, score: parsed.data.pulse === "SMOOTH" ? 5 : parsed.data.pulse === "NORMAL" ? 3 : 1, mood: parsed.data.pulse, note: parsed.data.pulse === "BLOCKED" ? parsed.data.pulseBlocker : null } });
      if (submit || !locked || revisingSubmitted) await tx.activityLog.create({ data: { organizationId: parsed.data.organizationId, actorId: authorization.user.id, action: revisingSubmitted ? "daily_report.revised" : submit ? "daily_report.submitted" : "daily_report.draft_created", entityType: "daily_report", entityId: saved.id, metadata: { reportDate: parsed.data.reportDate, provisional: dayData.provisional } } });
      if (submit) {
        const reviewers = await getAuthorizedReviewerIds(tx, parsed.data.organizationId, authorization.user.id);
        const requiresAttention = parsed.data.pulse === "BLOCKED" || Boolean(parsed.data.blockers);
        await createNotifications(tx, reviewers, { organizationId: parsed.data.organizationId, actorId: authorization.user.id, type: "REPORT_SUBMITTED", title: requiresAttention ? "Report requires attention" : "Daily report submitted", message: `${authorization.user.name || authorization.user.email} submitted the ${parsed.data.reportDate} report.`, link: `/dashboard/reports/${saved.id}`, relatedEntityType: "daily_report", relatedEntityId: saved.id, eventId: `daily_report.submitted:${saved.id}`, metadata: { reportId: saved.id, reportDate: parsed.data.reportDate, requiresAttention } });
      }
      return saved;
    });
    refresh(report.id);
    return { success: true, message: existing?.status === "SUBMITTED" ? "Submitted report revised." : submit ? "Daily report submitted." : "Draft saved." };
  } catch (error) {
    return { message: error instanceof Error && error.message === "REPORT_ALREADY_SUBMITTED" ? "This report was already submitted in another request." : "The report could not be saved. Refresh and try again." };
  }
}

export async function saveDailyReportDraft(_state: FormState, formData: FormData) { return persist(formData, false); }
export async function submitDailyReport(_state: FormState, formData: FormData) { return persist(formData, true); }
export async function saveTeamPulse(_state: FormState, formData: FormData) { return persist(formData, false); }

export async function getTodayReportData() {
  const { user, organization } = await requireCurrentOrganization("reports:manage-own");
  const settings = await prisma.organizationSettings.findUnique({ where: { organizationId: organization.id }, select: { timezone: true } });
  const timezone = settings?.timezone ?? "Asia/Kolkata";
  return getReportDayData(organization.id, user.id, dateKeyInZone(new Date(), timezone), timezone);
}

export async function getMyReportHistory() { const { user, organization } = await requireCurrentOrganization("reports:manage-own"); return prisma.dailyReport.findMany({ where: { organizationId: organization.id, userId: user.id }, orderBy: { reportDate: "desc" }, take: 100 }); }
export async function getReportById(organizationId: string, reportId: string) { const auth = await requireOrganizationPermission(organizationId, "reports:read-all"); return prisma.dailyReport.findFirst({ where: { id: reportId, organizationId, ...(auth.membership?.role === "TEAM_LEAD" ? { user: { teamMembers: { some: { team: { managerId: auth.user.id } } } } } : {}) }, include: { user: true, tasks: true, pulse: true } }); }
export async function getManagerReports(organizationId: string) { const auth = await requireOrganizationPermission(organizationId, "reports:read-all"); return prisma.dailyReport.findMany({ where: { organizationId, ...(auth.membership?.role === "TEAM_LEAD" ? { user: { teamMembers: { some: { team: { managerId: auth.user.id } } } } } : {}) }, orderBy: { reportDate: "desc" }, take: 100 }); }
export async function getDailyTeamSummary(organizationId: string, reportDate: string) { const auth = await requireOrganizationPermission(organizationId, "reports:read-all"); return prisma.dailyReport.groupBy({ where: { organizationId, reportDate: databaseDate(reportDate), ...(auth.membership?.role === "TEAM_LEAD" ? { user: { teamMembers: { some: { team: { managerId: auth.user.id } } } } } : {}) }, by: ["status"], _count: { _all: true } }); }
