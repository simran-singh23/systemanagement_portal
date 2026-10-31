import assert from "node:assert/strict";
import test from "node:test";
import { unionMilliseconds, workingSummary } from "./work-time";

const at = (hour: number, minute = 0) => new Date(Date.UTC(2026, 9, 14, hour, minute));

test("merges overlapping intervals instead of double-counting", () => {
  const total = unionMilliseconds([
    { startedAt: at(9), endedAt: at(10) },
    { startedAt: at(9, 30), endedAt: at(10, 30) },
  ], at(12));
  assert.equal(total, 90 * 60 * 1000);
});

test("calculates office, break, task, and unallocated time independently", () => {
  const summary = workingSummary({
    attendance: { startedAt: at(9), endedAt: at(18) },
    breaks: [{ startedAt: at(13), endedAt: at(14) }],
    tasks: [{ startedAt: at(9), endedAt: at(12) }, { startedAt: at(14), endedAt: at(17, 45) }],
    now: at(19),
  });
  assert.deepEqual(summary, {
    officeMs: 540 * 60 * 1000,
    breakMs: 60 * 60 * 1000,
    netMs: 480 * 60 * 1000,
    taskMs: 405 * 60 * 1000,
    unallocatedMs: 75 * 60 * 1000,
  });
});

test("clips intervals to attendance and prevents negative totals", () => {
  const summary = workingSummary({
    attendance: { startedAt: at(9), endedAt: at(10) },
    breaks: [{ startedAt: at(8), endedAt: at(9, 15) }],
    tasks: [{ startedAt: at(8), endedAt: at(11) }],
    now: at(12),
  });
  assert.equal(summary.breakMs, 15 * 60 * 1000);
  assert.equal(summary.taskMs, 60 * 60 * 1000);
  assert.equal(summary.unallocatedMs, 0);
});
