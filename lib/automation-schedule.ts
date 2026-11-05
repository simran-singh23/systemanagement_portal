import { dateKeyInZone, parseClockMinutes, shiftDateKey, zonedDateTimeToUtc, zonedParts } from "@/lib/date-time";
import { isValidDateKey } from "@/lib/date-time";
import { z } from "zod";

export const AUTOMATION_TYPES = ["CHECK_IN_REMINDER", "MISSING_CHECK_IN", "LUNCH_REMINDER", "TASK_DEADLINE", "DAILY_REPORT_REMINDER", "MISSING_DAILY_REPORT", "DAILY_TEAM_SUMMARY", "DAILY_EMAIL_REPORT"] as const;
export type AutomationName = typeof AUTOMATION_TYPES[number];

export const automationPayloadSchema = z.object({ organizationId: z.string().min(1), automation: z.enum(AUTOMATION_TYPES), workDate: z.string().refine(isValidDateKey), scheduledFor: z.iso.datetime(), runKey: z.string().min(1).max(300) });
export type AutomationPayload = z.infer<typeof automationPayloadSchema>;

export function validClock(value: string) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(value); }
export function validTimeZone(value: string) { try { new Intl.DateTimeFormat("en", { timeZone: value }).format(); return true; } catch { return false; } }

export function localMinuteOfDay(now: Date, timezone: string) {
  const parts = zonedParts(now, timezone);
  return parts.hour * 60 + parts.minute;
}

export function scheduleContext(now: Date, timezone: string, clock: string, workdayStart: string, workdayEnd: string) {
  const localDate = dateKeyInZone(now, timezone);
  const overnight = parseClockMinutes(workdayEnd) <= parseClockMinutes(workdayStart);
  const belongsToPreviousShift = overnight && parseClockMinutes(clock) <= parseClockMinutes(workdayEnd);
  const workDate = belongsToPreviousShift ? shiftDateKey(localDate, -1) : localDate;
  return { workDate, scheduledFor: zonedDateTimeToUtc(localDate, clock, timezone), due: localMinuteOfDay(now, timezone) >= parseClockMinutes(clock), overnight };
}

export function reportingScheduleContext(now: Date, timezone: string, clock: string, workdayStart: string, workdayEnd: string) {
  const context = scheduleContext(now, timezone, clock, workdayStart, workdayEnd);
  const afterOvernightShift = context.overnight && parseClockMinutes(clock) < parseClockMinutes(workdayStart);
  return { ...context, workDate: afterOvernightShift ? shiftDateKey(dateKeyInZone(now, timezone), -1) : context.workDate };
}

export function workdayRangeUtc(workDate: string, timezone: string, workdayStart: string, workdayEnd: string) {
  const overnight = parseClockMinutes(workdayEnd) <= parseClockMinutes(workdayStart);
  return { start: zonedDateTimeToUtc(workDate, workdayStart, timezone), end: zonedDateTimeToUtc(overnight ? shiftDateKey(workDate, 1) : workDate, workdayEnd, timezone), overnight };
}

export function localHourBucket(now: Date, timezone: string) {
  const parts = zonedParts(now, timezone);
  const date = dateKeyInZone(now, timezone);
  return { date, hour: parts.hour, key: `${date}T${String(parts.hour).padStart(2, "0")}` };
}
