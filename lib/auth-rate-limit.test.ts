import assert from "node:assert/strict";
import test from "node:test";
import { isAttemptAllowed } from "./auth-rate-limit";

test("login limit allows the configured boundary and rejects the next attempt", () => {
  assert.equal(isAttemptAllowed(8, 8), true);
  assert.equal(isAttemptAllowed(9, 8), false);
  assert.equal(isAttemptAllowed(0, 8), true);
});
