import assert from "node:assert/strict";
import test from "node:test";
import { countWorkingLeaveDays, dateKeysBetween, workingLeaveDateKeys } from "@/lib/leave";
import { leaveRequestSchema } from "@/lib/validations";

test("date range includes same-day and both boundaries", () => {
  assert.deepEqual(dateKeysBetween("2026-10-14", "2026-10-14"), ["2026-10-14"]);
  assert.equal(dateKeysBetween("2026-10-14", "2026-10-16").length, 3);
});

test("leave duration follows configured workdays", () => {
  assert.equal(countWorkingLeaveDays("2026-10-12", "2026-10-18", { workDays: [1, 2, 3, 4, 5] }), 5);
  assert.equal(countWorkingLeaveDays("2026-10-12", "2026-10-18", { workDays: [1, 2, 3, 4, 5, 6] }), 6);
});

test("configured holidays are excluded", () => {
  const days = workingLeaveDateKeys("2026-10-12", "2026-10-16", { workDays: [1, 2, 3, 4, 5], holidayDateKeys: new Set(["2026-10-14"]) });
  assert.deepEqual(days, ["2026-10-12", "2026-10-13", "2026-10-15", "2026-10-16"]);
});

test("leave validation rejects reversed date ranges", () => {
  const result = leaveRequestSchema.safeParse({ organizationId: "org", type: "CASUAL", startDate: "2026-10-18", endDate: "2026-10-16", reason: "A valid leave request reason.", notes: "" });
  assert.equal(result.success, false);
});

test("same-day leave request passes validation", () => {
  const result = leaveRequestSchema.safeParse({ organizationId: "org", type: "SICK", startDate: "2026-10-14", endDate: "2026-10-14", reason: "Medical appointment and recovery.", notes: "" });
  assert.equal(result.success, true);
});
