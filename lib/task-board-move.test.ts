import assert from "node:assert/strict";
import test from "node:test";
import { validBoardSnapshot } from "./task-board-move";

const current = [{ id: "a", status: "TODO" as const }, { id: "b", status: "TODO" as const }, { id: "c", status: "REVIEW" as const }];

test("board move accepts a complete consistent source and destination", () => {
  assert.equal(validBoardSnapshot({ taskId: "a", fromStatus: "TODO", toStatus: "REVIEW", columns: [{ status: "TODO", taskIds: ["b"] }, { status: "REVIEW", taskIds: ["c", "a"] }] }, current), true);
});

test("board move rejects hidden status changes, omissions and duplicate columns", () => {
  assert.equal(validBoardSnapshot({ taskId: "a", fromStatus: "TODO", toStatus: "REVIEW", columns: [{ status: "TODO", taskIds: [] }, { status: "REVIEW", taskIds: ["a", "b", "c"] }] }, current), false);
  assert.equal(validBoardSnapshot({ taskId: "a", fromStatus: "TODO", toStatus: "REVIEW", columns: [{ status: "TODO", taskIds: ["b"] }, { status: "REVIEW", taskIds: ["a"] }] }, current), false);
  assert.equal(validBoardSnapshot({ taskId: "a", fromStatus: "TODO", toStatus: "TODO", columns: [{ status: "TODO", taskIds: ["a", "b"] }, { status: "TODO", taskIds: [] }] }, current), false);
});
