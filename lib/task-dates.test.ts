import assert from "node:assert/strict";
import test from "node:test";
import { parseTaskDate, taskDateInput } from "./task-dates";

test("task deadlines use the organization clock and round-trip into the editor", () => {
  const date = parseTaskDate("2026-11-02T18:00", "Asia/Kolkata");
  assert.equal(date?.toISOString(), "2026-11-02T12:30:00.000Z");
  assert.equal(taskDateInput(date, "Asia/Kolkata"), "2026-11-02T18:00");
  assert.equal(parseTaskDate("2026-11-02T18:00", "UTC")?.toISOString(), "2026-11-02T18:00:00.000Z");
  assert.equal(parseTaskDate(undefined, "UTC"), null);
});

test("absolute task timestamps retain their instant", () => {
  assert.equal(parseTaskDate("2026-11-02T18:00:00Z", "Asia/Kolkata")?.toISOString(), "2026-11-02T18:00:00.000Z");
  assert.equal(parseTaskDate("2026-11-02T18:00:45.123+05:30", "UTC")?.toISOString(), "2026-11-02T12:30:45.123Z");
});

test("task dates reject calendar overflow and nonexistent daylight-saving times", () => {
  assert.throws(() => parseTaskDate("2026-02-30T10:00", "UTC"));
  assert.throws(() => parseTaskDate("2026-03-08T02:30", "America/New_York"), /does not exist/);
  assert.equal(parseTaskDate("2026-03-08T03:30", "America/New_York")?.toISOString(), "2026-03-08T07:30:00.000Z");
});
