import { dateKeyInZone, dayRangeInZone, shiftDateKey } from "./date-time";

/**
 * UTC instants for task deadline filters based on the organization's calendar.
 * The seven-day window starts now and ends at local midnight seven calendar
 * days after today, so DST changes do not shift its calendar boundaries.
 */
export function taskDeadlineWindows(now: Date, timeZone: string) {
  const todayKey = dateKeyInZone(now, timeZone);
  const today = dayRangeInZone(todayKey, timeZone);
  const sevenDayEndKey = shiftDateKey(todayKey, 7);

  return {
    today,
    nextSevenDays: {
      start: now,
      end: dayRangeInZone(sevenDayEndKey, timeZone).start,
    },
  };
}
