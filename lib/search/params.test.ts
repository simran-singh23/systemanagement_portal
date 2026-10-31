import assert from "node:assert/strict";
import test from "node:test";
import { allowedValue, boundedPage, globalSearchSchema, parsePagination, safeQuery } from "./params";

test("global search requires a bounded useful query", () => {
  assert.equal(globalSearchSchema.safeParse({ q: "a" }).success, false);
  assert.equal(globalSearchSchema.safeParse({ q: " dashboard " }).data?.q, "dashboard");
  assert.equal(globalSearchSchema.safeParse({ q: "x".repeat(101) }).success, false);
});

test("pagination accepts only approved sizes and safe pages", () => {
  assert.deepEqual(parsePagination({ page: "3", pageSize: "50" }), { page: 3, pageSize: 50, skip: 100 });
  assert.deepEqual(parsePagination({ page: "-4", pageSize: "5000" }), { page: 1, pageSize: 20, skip: 0 });
  assert.deepEqual(boundedPage(99, 41, 20), { page: 3, pages: 3 });
});

test("filter helpers reject unknown allowlist values", () => {
  assert.equal(allowedValue("newest", ["newest", "oldest"] as const), "newest");
  assert.equal(allowedValue("DROP TABLE", ["newest", "oldest"] as const), undefined);
  assert.equal(safeQuery(`  ${"x".repeat(150)}  `).length, 100);
});
