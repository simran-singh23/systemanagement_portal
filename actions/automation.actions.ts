"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrganizationPermission } from "@/lib/dal/auth";
import { prisma } from "@/lib/prisma";
import { validTimeZone } from "@/lib/automation-schedule";

export type AutomationSettingsState = { success?: boolean; message?: string };

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const schema = z.object({
  organizationId: z.string().min(1), timezone: z.string().min(1).max(100),
  workdayStart: clock, workdayEnd: clock,
  checkInReminderTime: clock, checkInCutoffTime: clock, lunchReminderTime: clock,
  dailyReportReminderTime: clock, dailyReportDueTime: clock, managerSummaryTime: clock,
  taskDeadlineReminderHours: z.string().regex(/^\s*\d+(\s*,\s*\d+)*\s*$/),
});
const enabled = (formData: FormData, key: string) => formData.get(key) === "on";

export async function updateAutomationSettings(_state: AutomationSettingsState, formData: FormData): Promise<AutomationSettingsState> {
  const parsed = schema.safeParse(Object.fromEntries(["organizationId", "timezone", "workdayStart", "workdayEnd", "checkInReminderTime", "checkInCutoffTime", "lunchReminderTime", "dailyReportReminderTime", "dailyReportDueTime", "managerSummaryTime", "taskDeadlineReminderHours"].map((key) => [key, String(formData.get(key) ?? "")])));
  if (!parsed.success || !validTimeZone(parsed.data?.timezone ?? "")) return { message: "Check the timezone, HH:MM schedules, and comma-separated deadline hours." };
  await requireOrganizationPermission(parsed.data.organizationId, "organization:manage");
  const hours = [...new Set(parsed.data.taskDeadlineReminderHours.split(",").map(Number).filter((value) => value > 0 && value <= 720))].sort((a, b) => b - a);
  if (!hours.length) return { message: "Add at least one task deadline reminder window between 1 and 720 hours." };
  const workDays = [...new Set(formData.getAll("workDays").map(Number).filter((value) => Number.isInteger(value) && value >= 0 && value <= 6))].sort();
  if (!workDays.length) return { message: "Select at least one working day." };
  const settingsData = {
    timezone: parsed.data.timezone, workdayStart: parsed.data.workdayStart, workdayEnd: parsed.data.workdayEnd, workDays,
    checkInReminderTime: parsed.data.checkInReminderTime, checkInCutoffTime: parsed.data.checkInCutoffTime,
    lunchReminderTime: parsed.data.lunchReminderTime, dailyReportReminderTime: parsed.data.dailyReportReminderTime,
    dailyReportDueTime: parsed.data.dailyReportDueTime, managerSummaryTime: parsed.data.managerSummaryTime,
    taskDeadlineReminderHours: hours,
    enableCheckInReminders: enabled(formData, "enableCheckInReminders"), enableMissingCheckInAlerts: enabled(formData, "enableMissingCheckInAlerts"),
    notifyManagersMissingCheckIn: enabled(formData, "notifyManagersMissingCheckIn"), enableLunchReminders: enabled(formData, "enableLunchReminders"),
    enableTaskDeadlineReminders: enabled(formData, "enableTaskDeadlineReminders"), notifyManagersOverdueTasks: enabled(formData, "notifyManagersOverdueTasks"),
    enableDailyReportReminders: enabled(formData, "enableDailyReportReminders"), enableMissingReportAlerts: enabled(formData, "enableMissingReportAlerts"),
    notifyManagersMissingReports: enabled(formData, "notifyManagersMissingReports"), enableDailyTeamSummary: enabled(formData, "enableDailyTeamSummary"),
  };
  await prisma.organizationSettings.upsert({ where: { organizationId: parsed.data.organizationId }, create: { organizationId: parsed.data.organizationId, ...settingsData }, update: settingsData });
  revalidatePath("/dashboard/automations");
  return { success: true, message: "Automation settings saved." };
}
