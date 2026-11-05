import assert from "node:assert/strict";
import test from "node:test";
import { dailyReportSchema } from "./validations";
import { dayRangeInZone } from "./date-time";
import { isValidDateKey } from "./date-time";
import { buildReportTaskEvidence, isReportExpected } from "./report-evidence";
import { leaveRequestSchema, notificationFiltersSchema } from "./validations";

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

test("calendar date validation rejects normalized impossible dates and accepts leap days", () => {
  assert.equal(isValidDateKey("2026-02-31"), false);
  assert.equal(isValidDateKey("2026-02-29"), false);
  assert.equal(isValidDateKey("2024-02-29"), true);
  assert.equal(dailyReportSchema.safeParse({ ...base, reportDate: "2026-02-31" }).success, false);
  assert.equal(leaveRequestSchema.safeParse({ organizationId: "org", type: "SICK", startDate: "2026-02-31", endDate: "2026-02-31", reason: "A medical appointment and recovery.", notes: "" }).success, false);
  assert.equal(notificationFiltersSchema.safeParse({ date: "2026-02-31" }).success, false);
});

test("report evidence clips task time and excludes present-day tasks from history", () => {
  const attendance = { startedAt: new Date("2026-10-14T09:00:00Z"), endedAt: new Date("2026-10-14T10:00:00Z") };
  const task = { id: "task-1", title: "Evidence", status: "IN_PROGRESS" };
  const evidence = buildReportTaskEvidence({
    sessions: [
      { taskId: task.id, task, startedAt: new Date("2026-10-14T08:30:00Z"), endedAt: new Date("2026-10-14T10:30:00Z") },
      { taskId: task.id, task, startedAt: new Date("2026-10-14T09:30:00Z"), endedAt: new Date("2026-10-14T10:15:00Z") },
    ],
    completedTasks: [], currentTasks: [{ id: "current", title: "Current task", status: "BLOCKED" }],
    attendance, reportDate: "2026-10-14", today: "2026-10-15", now: new Date("2026-10-15T12:00:00Z"),
  });
  assert.deepEqual(evidence, [{ ...task, milliseconds: 60 * 60_000, completedToday: false }]);
});

test("manager report expectations exclude holidays and disabled report policy", () => {
  assert.equal(isReportExpected("2026-10-14", [1, 2, 3, 4, 5], false, true), true);
  assert.equal(isReportExpected("2026-10-14", [1, 2, 3, 4, 5], true, true), false);
  assert.equal(isReportExpected("2026-10-18", [1, 2, 3, 4, 5], false, true), false);
  assert.equal(isReportExpected("2026-10-14", [1, 2, 3, 4, 5], false, false), false);
});
