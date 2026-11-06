"use server";

import { revalidatePath } from "next/cache";
import type { BreakType, LeaveType, UserRole } from "@prisma/client";
import { z } from "zod";
import { requireCurrentOrganization } from "@/lib/dal/auth";
import { dateKeyInZone, databaseDate, isValidDateKey } from "@/lib/date-time";
import {
  ALL_BREAK_TYPES,
  ALL_LEAVE_TYPES,
  parsedPositiveHours,
  settingsImpactSummary,
  sortedUniqueDays,
  validateOfficeWindow,
  validateAutomationScheduleOrder,
  validateTimezone,
  ORGANIZATION_SETTINGS_DEFAULTS,
} from "@/lib/organization-settings";
import { prisma } from "@/lib/prisma";
import { emailSenderConfigured } from "@/lib/email/delivery";
import { reportRecipientWhere } from "@/lib/email/recipients";

export type SettingsActionState = { success?: boolean; message?: string; errors?: Record<string, string[]> };

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM time.");
const optionalText = (max: number) => z.string().trim().max(max).transform((value) => value || null);
const integer = (min: number, max: number) => z.coerce.number().int().min(min).max(max);
const settingsSchema = z.object({
  organizationId: z.string().min(1),
  name: z.string().trim().min(2, "Organization name is required.").max(120),
  contactEmail: z.union([z.literal(""), z.email("Enter a valid contact email.")]).transform((value) => value || null),
  contactPhone: optionalText(40),
  logoUrl: z.union([z.literal(""), z.url("Enter a valid logo URL.")]).transform((value) => value || null),
  description: optionalText(1000),
  timezone: z.string().min(1).max(100),
  workdayStart: clock,
  workdayEnd: clock,
  lateGraceMins: integer(0, 180),
  expectedDailyMinutes: integer(60, 1440),
  halfDayThresholdMins: integer(30, 720),
  lunchReminderTime: clock,
  suggestedLunchMins: integer(5, 240),
  maxBreakMins: z.union([z.literal(""), z.coerce.number().int().min(5).max(480)]).transform((value) => value === "" ? null : value),
  checkInReminderTime: clock,
  checkInCutoffTime: clock,
  dailyReportReminderTime: clock,
  dailyReportDueTime: clock,
  managerSummaryTime: clock,
  dailyEmailTime: clock,
  leaveAdvanceNoticeDays: integer(0, 365),
  taskDeadlineReminderHours: z.string().trim().min(1),
  primaryReportRecipientId: optionalText(100),
  aiMonthlyRequestLimit: integer(1, 5000),
  aiMonthlyTokenLimit: integer(1000, 50_000_000),
  aiContextMaxChars: integer(4000, 50_000),
  aiRetentionDays: integer(1, 90),
});

const field = (data: FormData, name: string) => String(data.get(name) ?? "");
const checked = (data: FormData, name: string) => data.get(name) === "on";
const refreshSettings = () => {
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/automations");
  revalidatePath("/dashboard/attendance");
  revalidatePath("/employee/attendance");
  revalidatePath("/dashboard/reports");
  revalidatePath("/employee/reports");
  revalidatePath("/dashboard/leave");
  revalidatePath("/employee/leave");
  revalidatePath("/dashboard/analytics");
  revalidatePath("/dashboard/ai-assistant");
  revalidatePath("/dashboard");
};

async function settingsAdmin(inputOrganizationId: string) {
  const context = await requireCurrentOrganization("organization:manage");
  if (context.organization.id !== inputOrganizationId) throw new Error("ORGANIZATION_SCOPE");
  return context;
}

function parseSettings(formData: FormData) {
  const names = ["organizationId", "name", "contactEmail", "contactPhone", "logoUrl", "description", "timezone", "workdayStart", "workdayEnd", "lateGraceMins", "expectedDailyMinutes", "halfDayThresholdMins", "lunchReminderTime", "suggestedLunchMins", "maxBreakMins", "checkInReminderTime", "checkInCutoffTime", "dailyReportReminderTime", "dailyReportDueTime", "managerSummaryTime", "dailyEmailTime", "leaveAdvanceNoticeDays", "taskDeadlineReminderHours", "primaryReportRecipientId", "aiMonthlyRequestLimit", "aiMonthlyTokenLimit", "aiContextMaxChars", "aiRetentionDays"];
  return settingsSchema.safeParse(Object.fromEntries(names.map((name) => [name, field(formData, name)])));
}

export async function updateOrganizationSettings(_state: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  const parsed = parseSettings(formData);
  if (!parsed.success) return { message: "Review the highlighted settings.", errors: parsed.error.flatten().fieldErrors };

  const workDays = sortedUniqueDays(formData.getAll("workDays"));
  const allowedBreakTypes = formData.getAll("allowedBreakTypes").filter((value): value is BreakType => ALL_BREAK_TYPES.includes(value as BreakType));
  const availableLeaveTypes = formData.getAll("availableLeaveTypes").filter((value): value is LeaveType => ALL_LEAVE_TYPES.includes(value as LeaveType));
  const reminderHours = parsedPositiveHours(parsed.data.taskDeadlineReminderHours);
  const overnightShiftEnabled = checked(formData, "overnightShiftEnabled");
  const dailyEmailEnabled = checked(formData, "dailyEmailEnabled");
  const aiEnabled = checked(formData, "aiEnabled");
  const allowedAiRoles: UserRole[] = ["SUPER_ADMIN", "PRODUCT_MANAGER", "TEAM_LEAD"];
  const aiAuthorizedRoles = formData.getAll("aiAuthorizedRoles").filter((value): value is UserRole => allowedAiRoles.includes(value as UserRole));
  const officeError = validateOfficeWindow(parsed.data.workdayStart, parsed.data.workdayEnd, overnightShiftEnabled);
  if (!validateTimezone(parsed.data.timezone)) return { message: "Choose a valid IANA timezone." };
  if (officeError) return { message: officeError };
  const scheduleError = validateAutomationScheduleOrder({ ...parsed.data, overnight: overnightShiftEnabled, dailyEmailEnabled, dailyEmailTime: parsed.data.dailyEmailTime });
  if (scheduleError) return { message: scheduleError };
  if (!workDays.length) return { message: "Select at least one working day." };
  if (!allowedBreakTypes.length) return { message: "Allow at least one break type." };
  if (!availableLeaveTypes.length) return { message: "Enable at least one leave type." };
  if (!reminderHours.length) return { message: "Add at least one task reminder window from 1 to 720 hours." };
  if (parsed.data.halfDayThresholdMins >= parsed.data.expectedDailyMinutes) return { message: "Half-day threshold must be shorter than the expected workday." };
  if (aiEnabled && !aiAuthorizedRoles.length) return { message: "Authorize at least one manager role for AI insights." };
  if (aiEnabled && (!process.env.OPENAI_API_KEY?.trim() || !process.env.OPENAI_MODEL?.trim())) return { message: "Configure OPENAI_API_KEY and OPENAI_MODEL before enabling AI insights." };
  if (dailyEmailEnabled && (!emailSenderConfigured() || !process.env.RESEND_WEBHOOK_SECRET?.trim())) return { message: "Configure the verified Resend sender, webhook secret and application URL before enabling daily email." };
  if (dailyEmailEnabled && process.env.NODE_ENV !== "production" && !process.env.RESEND_TEST_RECIPIENTS?.trim()) return { message: "Configure RESEND_TEST_RECIPIENTS before enabling email outside production." };
  if (dailyEmailEnabled && !checked(formData, "enableDailyTeamSummary")) return { message: "Keep the daily team summary enabled before enabling email delivery." };
  if (dailyEmailEnabled && !parsed.data.primaryReportRecipientId) return { message: "Select a verified primary report recipient before enabling email delivery." };
  const context = await settingsAdmin(parsed.data.organizationId);
  const additionalReportRecipientIds = [...new Set(formData.getAll("additionalReportRecipientIds").map(String).filter(Boolean))];
  const recipientIds = [...additionalReportRecipientIds, parsed.data.primaryReportRecipientId].filter((value): value is string => Boolean(value));
  if (recipientIds.length) {
    const permitted = await prisma.user.findMany({
      where: { ...reportRecipientWhere(context.organization.id), id: { in: recipientIds } },
      select: { email: true },
    });
    if (permitted.length !== new Set(recipientIds).size) return { message: "Report recipients must be active, verified organization managers." };
    if (dailyEmailEnabled && process.env.NODE_ENV !== "production") {
      const allowlist = new Set((process.env.RESEND_TEST_RECIPIENTS ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean));
      if (permitted.some((item) => !allowlist.has(item.email.toLowerCase()))) return { message: "In development, all selected recipients must be in RESEND_TEST_RECIPIENTS." };
    }
  }
  if (parsed.data.primaryReportRecipientId && additionalReportRecipientIds.includes(parsed.data.primaryReportRecipientId)) return { message: "The primary recipient cannot also be an additional recipient." };

  const organizationData = { name: parsed.data.name, contactEmail: parsed.data.contactEmail, contactPhone: parsed.data.contactPhone, logoUrl: parsed.data.logoUrl, description: parsed.data.description };
  const previous = await prisma.organizationSettings.findUnique({ where: { organizationId: context.organization.id } });
  const settingsData = {
    timezone: parsed.data.timezone,
    workdayStart: parsed.data.workdayStart,
    workdayEnd: parsed.data.workdayEnd,
    workDays,
    lateGraceMins: parsed.data.lateGraceMins,
    expectedDailyMinutes: parsed.data.expectedDailyMinutes,
    overnightShiftEnabled,
    halfDayThresholdMins: parsed.data.halfDayThresholdMins,
    autoFinalizeAbsence: previous?.autoFinalizeAbsence ?? ORGANIZATION_SETTINGS_DEFAULTS.autoFinalizeAbsence,
    absenceFinalizationTime: previous?.absenceFinalizationTime ?? ORGANIZATION_SETTINGS_DEFAULTS.absenceFinalizationTime,
    allowAttendanceCorrections: previous?.allowAttendanceCorrections ?? ORGANIZATION_SETTINGS_DEFAULTS.allowAttendanceCorrections,
    requireCorrectionApproval: previous?.requireCorrectionApproval ?? ORGANIZATION_SETTINGS_DEFAULTS.requireCorrectionApproval,
    lunchReminderTime: parsed.data.lunchReminderTime,
    suggestedLunchMins: parsed.data.suggestedLunchMins,
    allowedBreakTypes,
    maxBreakMins: parsed.data.maxBreakMins,
    checkInReminderTime: parsed.data.checkInReminderTime,
    checkInCutoffTime: parsed.data.checkInCutoffTime,
    dailyReportReminderTime: parsed.data.dailyReportReminderTime,
    dailyReportDueTime: parsed.data.dailyReportDueTime,
    managerSummaryTime: parsed.data.managerSummaryTime,
    taskDeadlineReminderHours: reminderHours,
    requireDailyReports: checked(formData, "requireDailyReports"),
    allowEmployeeTaskEdit: previous?.allowEmployeeTaskEdit ?? ORGANIZATION_SETTINGS_DEFAULTS.allowEmployeeTaskEdit,
    allowReportBeforeCheckout: checked(formData, "allowReportBeforeCheckout"),
    allowReportEditingAfterSubmission: checked(formData, "allowReportEditingAfterSubmission"),
    allowOverlappingLeaveRequests: checked(formData, "allowOverlappingLeaveRequests"),
    availableLeaveTypes,
    requireLeaveApproval: true,
    leaveAdvanceNoticeDays: parsed.data.leaveAdvanceNoticeDays,
    allowPastDateLeaveRequests: checked(formData, "allowPastDateLeaveRequests"),
    enableCheckInReminders: checked(formData, "enableCheckInReminders"),
    enableMissingCheckInAlerts: checked(formData, "enableMissingCheckInAlerts"),
    notifyManagersMissingCheckIn: checked(formData, "notifyManagersMissingCheckIn"),
    enableLunchReminders: checked(formData, "enableLunchReminders"),
    enableTaskDeadlineReminders: checked(formData, "enableTaskDeadlineReminders"),
    notifyManagersOverdueTasks: checked(formData, "notifyManagersOverdueTasks"),
    enableDailyReportReminders: checked(formData, "enableDailyReportReminders"),
    enableMissingReportAlerts: checked(formData, "enableMissingReportAlerts"),
    notifyManagersMissingReports: checked(formData, "notifyManagersMissingReports"),
    enableDailyTeamSummary: checked(formData, "enableDailyTeamSummary"),
    dailyEmailEnabled,
    dailyEmailTime: parsed.data.dailyEmailTime,
    primaryReportRecipientId: parsed.data.primaryReportRecipientId,
    additionalReportRecipientIds,
    aiEnabled,
    aiSummaryEnabled: aiEnabled && checked(formData, "aiSummaryEnabled"),
    aiAssistantEnabled: aiEnabled && checked(formData, "aiAssistantEnabled"),
    aiAuthorizedRoles,
    aiProvider: "OPENAI" as const,
    aiMonthlyRequestLimit: parsed.data.aiMonthlyRequestLimit,
    aiMonthlyTokenLimit: parsed.data.aiMonthlyTokenLimit,
    aiContextMaxChars: parsed.data.aiContextMaxChars,
    aiRetentionDays: parsed.data.aiRetentionDays,
  };

  const changedFields = Object.entries(settingsData).filter(([key, value]) => JSON.stringify(previous?.[key as keyof typeof previous]) !== JSON.stringify(value)).map(([key]) => key);
  if (context.organization.name !== organizationData.name) changedFields.push("organizationName");

  await prisma.$transaction(async (tx) => {
    await tx.organization.update({ where: { id: context.organization.id }, data: organizationData });
    await tx.organizationSettings.upsert({ where: { organizationId: context.organization.id }, create: { organizationId: context.organization.id, ...settingsData }, update: settingsData });
    await tx.activityLog.create({ data: { organizationId: context.organization.id, actorId: context.user.id, action: "organization.settings_updated", entityType: "organization_settings", entityId: previous?.id ?? context.organization.id, metadata: { changedFields, affectedSystems: settingsImpactSummary(changedFields) } } });
  });
  refreshSettings();
  return { success: true, message: changedFields.length ? "Organization policies saved. New rules apply to future activity." : "Settings are already up to date." };
}

const holidaySchema = z.object({ organizationId: z.string().min(1), holidayId: z.string().optional(), holidayDate: z.string().refine(isValidDateKey), name: z.string().trim().min(2).max(100), description: z.string().trim().max(500).transform((value) => value || null) });

async function mutateHoliday(mode: "create" | "update", _state: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  const parsed = holidaySchema.safeParse({ organizationId: field(formData, "organizationId"), holidayId: field(formData, "holidayId") || undefined, holidayDate: field(formData, "holidayDate"), name: field(formData, "name"), description: field(formData, "description") });
  if (!parsed.success) return { message: "Enter a future date and a holiday name.", errors: parsed.error.flatten().fieldErrors };
  const context = await settingsAdmin(parsed.data.organizationId);
  const settings = await prisma.organizationSettings.findUnique({ where: { organizationId: context.organization.id }, select: { timezone: true } });
  const today = dateKeyInZone(new Date(), settings?.timezone ?? "Asia/Kolkata");
  if (parsed.data.holidayDate < today) return { message: "Past holidays are historical records and cannot be changed here." };
  try {
    const holiday = mode === "create"
      ? await prisma.organizationHoliday.create({ data: { organizationId: context.organization.id, holidayDate: databaseDate(parsed.data.holidayDate), name: parsed.data.name, description: parsed.data.description } })
      : await prisma.organizationHoliday.update({ where: { id: parsed.data.holidayId, organizationId: context.organization.id, holidayDate: { gte: databaseDate(today) } }, data: { holidayDate: databaseDate(parsed.data.holidayDate), name: parsed.data.name, description: parsed.data.description } });
    await prisma.activityLog.create({ data: { organizationId: context.organization.id, actorId: context.user.id, action: `organization.holiday_${mode === "create" ? "created" : "updated"}`, entityType: "organization_holiday", entityId: holiday.id, metadata: { holidayDate: parsed.data.holidayDate } } });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
    return { message: code === "P2002" ? "A holiday already exists on that date." : "The holiday could not be saved." };
  }
  refreshSettings();
  return { success: true, message: mode === "create" ? "Holiday added." : "Holiday updated." };
}

export async function createHoliday(state: SettingsActionState, formData: FormData) { return mutateHoliday("create", state, formData); }
export async function updateHoliday(state: SettingsActionState, formData: FormData) { return mutateHoliday("update", state, formData); }

export async function deleteHoliday(_state: SettingsActionState, formData: FormData): Promise<SettingsActionState> {
  const organizationId = field(formData, "organizationId");
  const holidayId = field(formData, "holidayId");
  if (!organizationId || !holidayId) return { message: "The holiday could not be verified." };
  const context = await settingsAdmin(organizationId);
  const settings = await prisma.organizationSettings.findUnique({ where: { organizationId }, select: { timezone: true } });
  const today = databaseDate(dateKeyInZone(new Date(), settings?.timezone ?? "Asia/Kolkata"));
  const deleted = await prisma.organizationHoliday.deleteMany({ where: { id: holidayId, organizationId, holidayDate: { gte: today } } });
  if (!deleted.count) return { message: "Only current or future holidays can be removed." };
  await prisma.activityLog.create({ data: { organizationId, actorId: context.user.id, action: "organization.holiday_deleted", entityType: "organization_holiday", entityId: holidayId } });
  refreshSettings();
  return { success: true, message: "Holiday removed." };
}
