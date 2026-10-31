import { z } from "zod";
import { zonedDateTimeToUtc, zonedParts } from "./date-time";

export const taskDateSchema = z.iso.datetime({ local: true, offset: true });

export function taskDateInput(value: Date | null, timeZone: string) {
  if (!value) return "";
  const parts = zonedParts(value, timeZone);
  const pad = (number: number) => String(number).padStart(2, "0");
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function parseTaskDate(value: string | undefined, timeZone: string) {
  if (!value) return null;
  if (!taskDateSchema.safeParse(value).success) throw new Error("Enter a valid task date and time.");
  if (/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return new Date(value);
  const [date, clock] = value.split("T");
  const result = zonedDateTimeToUtc(date, clock, timeZone);
  // A wall-clock time skipped by daylight saving must not silently move to
  // another hour. The user can choose a real time on the organization's clock.
  if (taskDateInput(result, timeZone) !== value.slice(0, 16)) throw new Error("This task time does not exist in the organization’s timezone. Choose another time.");
  const seconds = Number(clock.split(":")[2] || "0");
  result.setUTCMilliseconds(Math.round(seconds * 1000));
  return result;
}
