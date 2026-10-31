import assert from "node:assert/strict";
import test from "node:test";
import { assertLocalDatabaseUrl, assertLocalSetupTargets } from "./local-database";

const development = "postgresql://dev@127.0.0.1:5432/teamflow_dev?schema=public";
const testDatabase = "postgresql://dev@127.0.0.1:5432/teamflow_test?schema=public";

test("local setup accepts explicit matching development and separate test targets", () => {
  assert.deepEqual(assertLocalSetupTargets({ DATABASE_URL: development, TEST_DATABASE_URL: testDatabase }), {
    development, direct: development, test: testDatabase,
  });
  assert.equal(assertLocalDatabaseUrl("postgres://dev@[::1]:55432/teamflow_test_run_123", "test"), "postgres://dev@[::1]:55432/teamflow_test_run_123");
});

test("local setup refuses a migration target different from the runtime database", () => {
  for (const direct of [development.replace("teamflow_dev", "teamflow_dev_other"), development.replace(":5432", ":55432")]) {
    assert.throws(() => assertLocalSetupTargets({ DATABASE_URL: development, DIRECT_URL: direct, TEST_DATABASE_URL: testDatabase }));
  }
});

test("test database guards reject misleading names, encoded protected targets and URL overrides", () => {
  for (const value of [
    undefined,
    "postgresql://localhost/latest_production",
    "postgresql://localhost/teamflow_rehearsal_20261028",
    "postgresql://localhost/%74eamflow",
    "postgresql://localhost/teamflow_test?host=remote.example",
    "postgresql://localhost/teamflow_test?schema=private",
    "postgresql://localhost/teamflow_test?schema=public&schema=private",
    "postgresql://localhost/teamflow_test_%ZZ",
    "postgresql://remote.example/teamflow_test",
    development,
  ]) assert.throws(() => assertLocalDatabaseUrl(value, "test"));
});
