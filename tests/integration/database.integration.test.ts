import assert from "node:assert/strict";
import test from "node:test";
import { assertSafeTestDatabaseUrl } from "../helpers/test-database";

const configuredTestDatabase = process.env.TEST_DATABASE_URL;

test("Prisma can query the isolated test database", {
  skip: configuredTestDatabase ? false : "TEST_DATABASE_URL is not configured; production data will never be used as a fallback.",
}, async () => {
  process.env.DATABASE_URL = assertSafeTestDatabaseUrl(configuredTestDatabase);
  const { prisma } = await import("../../lib/prisma");

  try {
    const rows = await prisma.$queryRaw<Array<{ value: number }>>`SELECT 1::int AS value`;
    assert.equal(rows[0]?.value, 1);
  } finally {
    await prisma.$disconnect();
  }
});
