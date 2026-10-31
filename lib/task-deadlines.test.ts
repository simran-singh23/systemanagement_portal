import assert from "node:assert/strict";
import test from "node:test";
import { taskDeadlineWindows } from "./task-deadlines";

test("task deadline windows follow the organization timezone, not the machine timezone", () => {
  // This instant is already October 22 in Kolkata while still October 21 in New York.
  const now = new Date("2026-10-21T20:00:00.000Z");
  const kolkata = taskDeadlineWindows(now, "Asia/Kolkata");
  const newYork = taskDeadlineWindows(now, "America/New_York");

  assert.equal(kolkata.today.start.toISOString(), "2026-10-21T18:30:00.000Z");
  assert.equal(kolkata.today.end.toISOString(), "2026-10-22T18:30:00.000Z");
  assert.equal(newYork.today.start.toISOString(), "2026-10-21T04:00:00.000Z");
  assert.equal(newYork.today.end.toISOString(), "2026-10-22T04:00:00.000Z");
});

test("local midnight boundaries are half-open for due-today tasks", () => {
  const windows = taskDeadlineWindows(new Date("2026-10-21T20:00:00.000Z"), "Asia/Kolkata");
  const isDueToday = (dueAt: Date) => dueAt >= windows.today.start && dueAt < windows.today.end;

  assert.equal(isDueToday(new Date(windows.today.start.getTime() - 1)), false);
  assert.equal(isDueToday(windows.today.start), true);
  assert.equal(isDueToday(new Date(windows.today.end.getTime() - 1)), true);
  assert.equal(isDueToday(windows.today.end), false);
});

test("overdue remains an absolute-instant comparison while today's calendar window is zoned", () => {
  const now = new Date("2026-10-21T20:00:00.000Z");
  const windows = taskDeadlineWindows(now, "Asia/Kolkata");
  const overdue = (dueAt: Date) => dueAt < now;

  assert.equal(overdue(new Date(now.getTime() - 1)), true);
  assert.equal(overdue(now), false);
  assert.equal(overdue(new Date(now.getTime() + 1)), false);
  assert.equal(windows.today.start.getTime() < now.getTime(), true);
});

test("next seven days starts now and ends at the seventh local calendar boundary", () => {
  const now = new Date("2026-10-21T20:00:00.000Z");
  const windows = taskDeadlineWindows(now, "Asia/Kolkata");
  const inNextSevenDays = (dueAt: Date) => dueAt >= windows.nextSevenDays.start && dueAt < windows.nextSevenDays.end;

  assert.equal(inNextSevenDays(now), true);
  assert.equal(inNextSevenDays(new Date(windows.nextSevenDays.end.getTime() - 1)), true);
  assert.equal(inNextSevenDays(windows.nextSevenDays.end), false);
  assert.equal(windows.nextSevenDays.end.toISOString(), "2026-10-28T18:30:00.000Z");
});

test("seven-day deadline windows respect daylight-saving transitions", () => {
  const spring = taskDeadlineWindows(new Date("2026-03-08T05:00:00.000Z"), "America/New_York");
  const fall = taskDeadlineWindows(new Date("2026-11-01T04:00:00.000Z"), "America/New_York");

  assert.equal(spring.today.start.toISOString(), "2026-03-08T05:00:00.000Z");
  assert.equal(spring.today.end.toISOString(), "2026-03-09T04:00:00.000Z");
  assert.equal(spring.today.end.getTime() - spring.today.start.getTime(), 23 * 60 * 60 * 1000);
  assert.equal(spring.nextSevenDays.end.toISOString(), "2026-03-15T04:00:00.000Z");

  assert.equal(fall.today.start.toISOString(), "2026-11-01T04:00:00.000Z");
  assert.equal(fall.today.end.toISOString(), "2026-11-02T05:00:00.000Z");
  assert.equal(fall.today.end.getTime() - fall.today.start.getTime(), 25 * 60 * 60 * 1000);
  assert.equal(fall.nextSevenDays.end.toISOString(), "2026-11-08T05:00:00.000Z");
});
