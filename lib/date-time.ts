const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string) {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;
  const next = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  formatterCache.set(timeZone, next);
  return next;
}

export function zonedParts(date: Date, timeZone: string) {
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second) };
}

export function dateKeyInZone(date: Date, timeZone: string) {
  const { year, month, day } = zonedParts(date, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function databaseDate(dateKey: string) { return new Date(`${dateKey}T00:00:00.000Z`); }

export function shiftDateKey(dateKey: string, days: number) {
  const date = databaseDate(dateKey); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10);
}

export function attendanceWorkdayKey(now: Date, timeZone: string, workdayStart: string, workdayEnd: string, overnightShiftEnabled: boolean) {
  const localDate = dateKeyInZone(now, timeZone);
  if (!overnightShiftEnabled || parseClockMinutes(workdayEnd) > parseClockMinutes(workdayStart)) return localDate;
  return minutesInZone(now, timeZone) < parseClockMinutes(workdayEnd) ? shiftDateKey(localDate, -1) : localDate;
}

export function isLateCheckIn(now: Date, workdayKey: string, timeZone: string, workdayStart: string, graceMinutes: number) {
  return now.getTime() > zonedDateTimeToUtc(workdayKey, workdayStart, timeZone).getTime() + graceMinutes * 60_000;
}

export function zonedDateTimeToUtc(dateKey: string, clock: string, timeZone: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute] = clock.split(":").map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let result = new Date(target);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = zonedParts(result, timeZone);
    const represented = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    result = new Date(result.getTime() + target - represented);
  }
  return result;
}

export function dayRangeInZone(dateKey: string, timeZone: string) {
  return { start: zonedDateTimeToUtc(dateKey, "00:00", timeZone), end: zonedDateTimeToUtc(shiftDateKey(dateKey, 1), "00:00", timeZone) };
}

export function minutesInZone(date: Date, timeZone: string) { const parts = zonedParts(date, timeZone); return parts.hour * 60 + parts.minute; }
export function parseClockMinutes(value: string) { const [hours, minutes] = value.split(":").map(Number); return hours * 60 + minutes; }
export function durationMinutes(start: Date | null, end: Date | null, fallbackEnd = new Date()) { if (!start) return 0; return Math.max(0, Math.floor(((end || fallbackEnd).getTime() - start.getTime()) / 60000)); }
export function formatDuration(totalMinutes: number) { const hours = Math.floor(totalMinutes / 60); const minutes = totalMinutes % 60; return `${hours}h ${String(minutes).padStart(2, "0")}m`; }

export function formatTimeInZone(date: Date | null, timeZone: string) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function formatDateInZone(date: Date, timeZone: string, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone,
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...options,
  }).format(date);
}
