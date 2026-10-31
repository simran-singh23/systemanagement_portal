import assert from "node:assert/strict";
import test from "node:test";
import { attendanceWorkdayKey, dateKeyInZone, dayRangeInZone, durationMinutes, formatDuration, isLateCheckIn, zonedDateTimeToUtc } from "./date-time";

test("date keys respect the configured organization timezone", () => {
  const instant = new Date("2026-10-21T20:00:00.000Z");
  assert.equal(dateKeyInZone(instant, "Asia/Kolkata"), "2026-10-22");
  assert.equal(dateKeyInZone(instant, "America/New_York"), "2026-10-21");
});

test("local midnight converts to the correct UTC instant", () => {
  assert.equal(zonedDateTimeToUtc("2026-10-22", "09:00", "Asia/Kolkata").toISOString(), "2026-10-22T03:30:00.000Z");
});

test("day ranges remain a half-open interval", () => {
  const range = dayRangeInZone("2026-10-22", "Asia/Kolkata");
  assert.equal(range.start.toISOString(), "2026-10-21T18:30:00.000Z");
  assert.equal(range.end.toISOString(), "2026-10-22T18:30:00.000Z");
});

test("durations never become negative and format consistently", () => {
  const start = new Date("2026-10-22T09:00:00.000Z");
  assert.equal(durationMinutes(start, new Date("2026-10-22T10:35:59.000Z")), 95);
  assert.equal(durationMinutes(start, new Date("2026-10-22T08:00:00.000Z")), 0);
  assert.equal(formatDuration(95), "1h 35m");
});

test("overnight attendance stays on the shift's starting workday", () => {
  const afterMidnight = new Date("2026-10-22T20:00:00.000Z"); // 01:30 on October 23 in Kolkata
  assert.equal(attendanceWorkdayKey(afterMidnight, "Asia/Kolkata", "22:00", "06:00", true), "2026-10-22");
  assert.equal(attendanceWorkdayKey(afterMidnight, "Asia/Kolkata", "09:00", "18:00", false), "2026-10-23");
  assert.equal(attendanceWorkdayKey(new Date("2026-10-23T01:00:00.000Z"), "Asia/Kolkata", "22:00", "06:00", true), "2026-10-23");
  assert.equal(isLateCheckIn(afterMidnight, "2026-10-22", "Asia/Kolkata", "22:00", 15), true);
  assert.equal(isLateCheckIn(new Date("2026-10-22T16:44:00.000Z"), "2026-10-22", "Asia/Kolkata", "22:00", 15), false);
});
