import { databaseDate, shiftDateKey } from "@/lib/date-time";

export type LeaveCalendarSettings = {
  workDays: readonly number[];
  holidayDateKeys?: ReadonlySet<string>;
};

export function dateKeysBetween(startDateKey: string, endDateKey: string) {
  const dates: string[] = [];
  for (let current = startDateKey; current <= endDateKey; current = shiftDateKey(current, 1)) dates.push(current);
  return dates;
}

export function workingLeaveDateKeys(startDateKey: string, endDateKey: string, settings: LeaveCalendarSettings) {
  const holidays = settings.holidayDateKeys ?? new Set<string>();
  return dateKeysBetween(startDateKey, endDateKey).filter((dateKey) => {
    const day = databaseDate(dateKey).getUTCDay();
    return settings.workDays.includes(day) && !holidays.has(dateKey);
  });
}

export function countWorkingLeaveDays(startDateKey: string, endDateKey: string, settings: LeaveCalendarSettings) {
  return workingLeaveDateKeys(startDateKey, endDateKey, settings).length;
}

export function monthBounds(month: string) {
  const valid = /^\d{4}-\d{2}$/.test(month) ? month : new Date().toISOString().slice(0, 7);
  const start = `${valid}-01`;
  const startDate = databaseDate(start);
  const endDate = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, 0));
  return { month: valid, start, end: endDate.toISOString().slice(0, 10) };
}
