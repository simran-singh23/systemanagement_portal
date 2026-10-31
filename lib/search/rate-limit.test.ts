import assert from "node:assert/strict";
import test from "node:test";
import { consumeSearchRateLimit } from "./rate-limit";

test("search limiter bounds bursts and resets after its window", () => {
  const key = `test-${Math.random()}`;
  for (let index = 0; index < 40; index += 1) assert.equal(consumeSearchRateLimit(key, 1_000).allowed, true);
  assert.equal(consumeSearchRateLimit(key, 1_000).allowed, false);
  assert.equal(consumeSearchRateLimit(key, 61_001).allowed, true);
});
