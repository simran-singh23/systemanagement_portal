import assert from "node:assert/strict";
import test from "node:test";
import { assertSafeTestDatabaseUrl } from "../helpers/test-database";

test("accepts an explicit local test database", () => {
  const value = "postgresql://postgres:postgres@127.0.0.1:5432/teamflow_test?schema=public";
  assert.equal(assertSafeTestDatabaseUrl(value), value);
});

test("rejects missing, remote, production-like, and non-PostgreSQL URLs", () => {
  assert.throws(() => assertSafeTestDatabaseUrl(undefined));
  assert.throws(() => assertSafeTestDatabaseUrl("postgresql://user:pass@db.example.com/teamflow_test"));
  assert.throws(() => assertSafeTestDatabaseUrl("postgresql://postgres:postgres@localhost/teamflow"));
  assert.throws(() => assertSafeTestDatabaseUrl("mysql://root:root@localhost/teamflow_test"));
});
