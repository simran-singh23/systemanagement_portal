import type { BreakType, LeaveType, UserRole } from "@prisma/client";
import { validClock, validTimeZone } from "@/lib/automation-schedule";

export const WEEK_DAYS = [
  { value: 0, short: "Sun", label: "Sunday" },
  { value: 1, short: "Mon", label: "Monday" },
  { value: 2, short: "Tue", label: "Tuesday" },
  { value: 3, short: "Wed", label: "Wednesday" },
  { value: 4, short: "Thu", label: "Thursday" },
  { value: 5, short: "Fri", label: "Friday" },
  { value: 6, short: "Sat", label: "Saturday" },
] as const;

export const ALL_BREAK_TYPES: BreakType[] = ["LUNCH", "TEA", "PERSONAL", "OTHER"];
export const ALL_LEAVE_TYPES: LeaveType[] = ["CASUAL", "SICK", "EARNED", "UNPAID", "OTHER"];

export const ORGANIZATION_SETTINGS_DEFAULTS = {
  timezone: "Asia/Kolkata",
  workdayStart: "09:00",
  workdayEnd: "18:00",
  workDays: [1, 2, 3, 4, 5],
  lateGraceMins: 15,
  expectedDailyMinutes: 480,
  overnightShiftEnabled: false,
  halfDayThresholdMins: 240,
  autoFinalizeAbsence: false,
  absenceFinalizationTime: "23:00",
  allowAttendanceCorrections: false,
  requireCorrectionApproval: true,
  lunchReminderTime: "14:00",
  suggestedLunchMins: 60,
  allowedBreakTypes: ALL_BREAK_TYPES,
  maxBreakMins: null as number | null,
  checkInReminderTime: "09:00",
  checkInCutoffTime: "09:30",
  dailyReportReminderTime: "17:30",
  dailyReportDueTime: "18:00",
  managerSummaryTime: "19:00",
  taskDeadlineReminderHours: [24, 2],
  requireDailyReports: true,
  allowEmployeeTaskEdit: false,
  allowReportBeforeCheckout: true,
  allowOverlappingLeaveRequests: false,
  availableLeaveTypes: ALL_LEAVE_TYPES,
  requireLeaveApproval: true,
  leaveAdvanceNoticeDays: 0,
  allowPastDateLeaveRequests: false,
  allowReportEditingAfterSubmission: false,
  enableCheckInReminders: true,
  enableMissingCheckInAlerts: true,
  notifyManagersMissingCheckIn: true,
  enableLunchReminders: true,
  enableTaskDeadlineReminders: true,
  notifyManagersOverdueTasks: true,
  enableDailyReportReminders: true,
  enableMissingReportAlerts: true,
  notifyManagersMissingReports: true,
  enableDailyTeamSummary: true,
  dailyEmailEnabled: false,
  dailyEmailTime: "19:15",
  primaryReportRecipientId: null as string | null,
  additionalReportRecipientIds: [] as string[],
  aiEnabled: false,
  aiSummaryEnabled: false,
  aiAssistantEnabled: false,
  aiAuthorizedRoles: ["SUPER_ADMIN", "PRODUCT_MANAGER", "TEAM_LEAD"] as UserRole[],
  aiProvider: "OPENAI" as const,
  aiMonthlyRequestLimit: 100,
  aiMonthlyTokenLimit: 500_000,
  aiContextMaxChars: 16_000,
  aiRetentionDays: 7,
};

export function sortedUniqueDays(values: FormDataEntryValue[]) {
  return [...new Set(values.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort();
}

export function parsedPositiveHours(value: string) {
  return [...new Set(value.split(",").map(Number).filter((hour) => Number.isInteger(hour) && hour > 0 && hour <= 720))].sort((a, b) => b - a);
}

export function validateOfficeWindow(start: string, end: string, overnight: boolean) {
  if (!validClock(start) || !validClock(end)) return "Use valid 24-hour office times.";
  if (start === end) return "Office start and end cannot be the same.";
  if (!overnight && end < start) return "Enable overnight shifts when office end is on the next day.";
  return null;
}

export function validateTimezone(value: string) {
  return validTimeZone(value);
}

export function settingsImpactSummary(keys: string[]) {
  const areas = new Set<string>();
  for (const key of keys) {
    if (["workdayStart", "workdayEnd", "workDays", "timezone", "lateGraceMins", "checkInCutoffTime"].includes(key)) areas.add("attendance");
    if (["workdayStart", "workdayEnd", "workDays", "timezone", "expectedDailyMinutes"].includes(key)) areas.add("analytics");
    if (["workDays", "availableLeaveTypes", "leaveAdvanceNoticeDays", "allowPastDateLeaveRequests", "allowOverlappingLeaveRequests"].includes(key)) areas.add("leave");
    if (["dailyReportReminderTime", "dailyReportDueTime", "requireDailyReports", "allowReportBeforeCheckout"].includes(key)) areas.add("daily reports");
    if (key.startsWith("enable") || key.startsWith("notify") || key.includes("Reminder")) areas.add("automations");
    if (key.startsWith("ai")) areas.add("AI insights");
  }
  return [...areas];
}
