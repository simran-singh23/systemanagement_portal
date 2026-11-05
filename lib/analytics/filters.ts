import { z } from "zod";
import { dateKeyInZone, databaseDate, isValidDateKey, shiftDateKey } from "@/lib/date-time";
import type { AnalyticsFilters } from "@/lib/analytics/types";

const schema = z.object({ preset: z.enum(["today", "7d", "30d", "month", "custom"]).catch("30d"), start: z.string().refine(isValidDateKey).optional(), end: z.string().refine(isValidDateKey).optional(), team: z.string().max(100).optional(), department: z.string().max(100).optional(), employee: z.string().max(100).optional() });
export type AnalyticsSearch = Record<string, string | string[] | undefined>;

export function parseAnalyticsFilters(raw: AnalyticsSearch, timezone: string): AnalyticsFilters {
  const input = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
  const parsed = schema.parse(input);
  const today = dateKeyInZone(new Date(), timezone);
  let start = shiftDateKey(today, -29); let end = today;
  if (parsed.preset === "today") start = today;
  if (parsed.preset === "7d") start = shiftDateKey(today, -6);
  if (parsed.preset === "month") start = `${today.slice(0, 8)}01`;
  if (parsed.preset === "custom") { if (!parsed.start || !parsed.end) throw new Error("Choose both custom range dates."); start = parsed.start; end = parsed.end; }
  if (databaseDate(start) > databaseDate(end)) throw new Error("The analytics start date must be before the end date.");
  const days = Math.floor((databaseDate(end).getTime() - databaseDate(start).getTime()) / 86_400_000) + 1;
  if (days > 366) throw new Error("Analytics ranges are limited to 366 days.");
  return { preset: parsed.preset, start, end, teamId: parsed.team || undefined, department: parsed.department || undefined, employeeId: parsed.employee || undefined };
}

export function dateKeys(start: string, end: string) { const result: string[] = []; for (let key = start; key <= end; key = shiftDateKey(key, 1)) result.push(key); return result; }
export function previousRange(start: string, end: string) { const days = dateKeys(start, end).length; return { start: shiftDateKey(start, -days), end: shiftDateKey(start, -1) }; }
