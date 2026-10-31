import assert from "node:assert/strict";
import test from "node:test";
import { dailyReportSchema } from "./validations";
import { dayRangeInZone } from "./date-time";

const base = { organizationId: "org", reportDate: "2026-10-14", summary: "Completed the planned implementation work.", completedWork: "", progress: "", blockers: "", nextPlan: "", additionalNotes: "", pulse: "NORMAL", pulseBlocker: "" };

test("blocked pulse requires a work blocker description", () => {
  const result = dailyReportSchema.safeParse({ ...base, pulse: "BLOCKED" });
  assert.equal(result.success, false);
});

test("valid daily report fields pass validation", () => {
  const result = dailyReportSchema.safeParse({ ...base, pulse: "BLOCKED", pulseBlocker: "Waiting for API access." });
  assert.equal(result.success, true);
});

test("organization day range uses configured timezone", () => {
  const range = dayRangeInZone("2026-10-14", "Asia/Kolkata");
  assert.equal(range.start.toISOString(), "2026-10-13T18:30:00.000Z");
  assert.equal(range.end.toISOString(), "2026-10-14T18:30:00.000Z");
});
