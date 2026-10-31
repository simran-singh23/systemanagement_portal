import assert from "node:assert/strict";
import test from "node:test";
import { validateMigrationTestDatabaseUrl } from "../helpers/migration-safety";

const validTarget = "postgresql://review_user:review_password@127.0.0.1:5432/teamflow_migration_test_20261029_a1b2c3?schema=public";

function assertRejectedWithoutLeaking(value: string) {
  assert.throws(() => validateMigrationTestDatabaseUrl(value), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.message.includes("review_user"), false);
    assert.equal(error.message.includes("review_password"), false);
    assert.equal(error.message.includes(value), false);
    return true;
  });
}

test("accepts a dedicated local test URL and returns target metadata without credentials", () => {
  const target = validateMigrationTestDatabaseUrl(validTarget);
  assert.deepEqual(target, {
    host: "127.0.0.1",
    port: 5432,
    database: "teamflow_migration_test_20261029_a1b2c3",
    schema: "public",
  });
  assert.equal(JSON.stringify(target).includes("review_user"), false);
  assert.equal(JSON.stringify(target).includes("review_password"), false);
});

test("accepts localhost and IPv6 loopback authorities", () => {
  assert.equal(
    validateMigrationTestDatabaseUrl("postgres://u:p@localhost/teamflow_migration_test_local_123?schema=public").host,
    "localhost",
  );
  assert.equal(
    validateMigrationTestDatabaseUrl("postgres://u:p@[::1]:5432/teamflow_migration_test_ipv6_123?schema=public").host,
    "[::1]",
  );
});

test("rejects malformed URLs and malformed percent-encoded database paths generically", () => {
  for (const value of [
    "not a URL",
    "postgresql://[",
    "postgresql://u:review_password@localhost:5432/teamflow_migration_test_%ZZ?schema=public",
  ]) assertRejectedWithoutLeaking(value);
});

test("rejects remote IPv4 and DNS hosts", () => {
  for (const value of [
    "postgresql://u:review_password@db.example.com:5432/teamflow_migration_test_remote_123?schema=public",
    "postgresql://u:review_password@10.0.0.4:5432/teamflow_migration_test_private_123?schema=public",
    "postgresql://u:review_password@[2001:db8::1]:5432/teamflow_migration_test_ipv6_remote_123?schema=public",
  ]) assertRejectedWithoutLeaking(value);
});

test("rejects authority ports other than the verified local PostgreSQL port", () => {
  assertRejectedWithoutLeaking("postgresql://u:review_password@127.0.0.1:5433/teamflow_migration_test_port_123?schema=public");
});

test("rejects protected names, including percent-encoded protected database paths", () => {
  assertRejectedWithoutLeaking("postgresql://u:review_password@localhost:5432/teamflow?schema=public");
  assertRejectedWithoutLeaking("postgresql://u:review_password@localhost:5432/teamflow_rehearsal_20261028?schema=public");
  assertRejectedWithoutLeaking("postgresql://u:review_password@localhost:5432/%74eamflow?schema=public");
  assertRejectedWithoutLeaking("postgresql://u:review_password@localhost:5432/teamflow_migration_test%2Fteamflow?schema=public");
  assertRejectedWithoutLeaking("postgresql://u:review_password@localhost:5432/teamflow_test?schema=public");
});

test("rejects all query parameters except one schema=public value", () => {
  for (const query of [
    "schema=public&host=remote.example",
    "schema=public&hostaddr=203.0.113.10",
    "schema=public&port=5433",
    "schema=public&dbname=teamflow",
    "schema=public&schema=public",
    "schema=public&%68ost=remote.example",
    "schema=private",
  ]) {
    assertRejectedWithoutLeaking(`postgresql://u:review_password@localhost:5432/teamflow_migration_test_query_123?${query}`);
  }
});

test("rejects non-PostgreSQL protocols", () => {
  assertRejectedWithoutLeaking("mysql://u:review_password@localhost:5432/teamflow_migration_test_mysql_123?schema=public");
});
