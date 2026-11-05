import test from "node:test";
import assert from "node:assert/strict";
import { dateKeys, parseAnalyticsFilters, previousRange } from "@/lib/analytics/filters";

test("custom analytics filters preserve a bookmarkable bounded range", () => {
  const filters = parseAnalyticsFilters({ preset: "custom", start: "2026-10-01", end: "2026-10-21", team: "team-1" }, "Asia/Kolkata");
  assert.deepEqual(filters, { preset: "custom", start: "2026-10-01", end: "2026-10-21", teamId: "team-1", department: undefined, employeeId: undefined });
});

test("analytics filters reject reversed and excessive ranges", () => {
  assert.throws(() => parseAnalyticsFilters({ preset: "custom", start: "2026-10-21", end: "2026-10-01" }, "UTC"));
  assert.throws(() => parseAnalyticsFilters({ preset: "custom", start: "2025-01-01", end: "2026-10-21" }, "UTC"));
  assert.throws(() => parseAnalyticsFilters({ preset: "custom", start: "2026-02-31", end: "2026-03-10" }, "UTC"));
});

test("previous period has the same number of calendar days", () => {
  const previous = previousRange("2026-10-15", "2026-10-21");
  assert.deepEqual(previous, { start: "2026-10-08", end: "2026-10-14" });
  assert.equal(dateKeys(previous.start, previous.end).length, 7);
});
