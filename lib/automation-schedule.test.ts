import assert from "node:assert/strict";
import test from "node:test";
import { automationPayloadSchema, localHourBucket, reportingScheduleContext, scheduleContext, validClock, validTimeZone, workdayRangeUtc } from "@/lib/automation-schedule";

test("organization schedule uses its timezone instead of server time", () => {
  const now = new Date("2026-10-14T03:31:00.000Z");
  const context = scheduleContext(now, "Asia/Kolkata", "09:00", "09:00", "18:00");
  assert.equal(context.workDate, "2026-10-14");
  assert.equal(context.due, true);
  assert.equal(context.scheduledFor.toISOString(), "2026-10-14T03:30:00.000Z");
});

test("post-midnight overnight reminders belong to the originating workday", () => {
  const now = new Date("2026-10-14T20:35:00.000Z");
  const context = scheduleContext(now, "Asia/Kolkata", "02:00", "22:00", "06:00");
  assert.equal(context.workDate, "2026-10-14");
  assert.equal(context.scheduledFor.toISOString(), "2026-10-14T20:30:00.000Z");
  const range = workdayRangeUtc("2026-10-14", "Asia/Kolkata", "22:00", "06:00");
  assert.equal(range.start.toISOString(), "2026-10-14T16:30:00.000Z");
  assert.equal(range.end.toISOString(), "2026-10-15T00:30:00.000Z");
});

test("after-shift daily reports refer to the overnight shift that just ended", () => {
  const context = reportingScheduleContext(new Date("2026-10-15T13:45:00.000Z"), "Asia/Kolkata", "19:00", "22:00", "06:00");
  assert.equal(context.workDate, "2026-10-14");
  assert.equal(context.due, true);
  assert.equal(context.scheduledFor.toISOString(), "2026-10-15T13:30:00.000Z");
});

test("hour buckets and configuration validators are stable", () => {
  assert.deepEqual(localHourBucket(new Date("2026-10-14T18:45:00.000Z"), "UTC"), { date: "2026-10-14", hour: 18, key: "2026-10-14T18" });
  assert.equal(validClock("23:59"), true);
  assert.equal(validClock("24:00"), false);
  assert.equal(validTimeZone("Asia/Kolkata"), true);
  assert.equal(validTimeZone("Mars/Olympus"), false);
});

test("automation payload rejects impossible calendar dates", () => {
  const valid = { organizationId: "org", automation: "DAILY_TEAM_SUMMARY", workDate: "2026-10-14", scheduledFor: "2026-10-14T18:00:00.000Z", runKey: "org:summary:2026-10-14" };
  assert.equal(automationPayloadSchema.safeParse(valid).success, true);
  assert.equal(automationPayloadSchema.safeParse({ ...valid, workDate: "2026-02-31" }).success, false);
});
