import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { assertSafeTestDatabaseUrl } from "../helpers/test-database";
import { lockTransaction } from "../../lib/transaction-lock";

const configuredTestDatabase = process.env.TEST_DATABASE_URL;

test("migrations and database session constraints", {
  skip: configuredTestDatabase ? false : "TEST_DATABASE_URL is not configured; production data will never be used as a fallback.",
}, async (context) => {
  const connectionString = assertSafeTestDatabaseUrl(configuredTestDatabase);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    await context.test("application advisory locks execute without deserializing PostgreSQL void results", async () => {
      await prisma.$transaction(async (tx) => {
        await lockTransaction(tx, "backend-lock-regression");
        const rows = await tx.$queryRaw<Array<{ held: boolean }>>`SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND pid = pg_backend_pid() AND granted) AS held`;
        assert.equal(rows[0]?.held, true);
      });
    });

    await context.test("all migration files are applied with matching checksums", async () => {
      const directory = join(process.cwd(), "prisma/migrations");
      const names = readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
      const rows = await prisma.$queryRaw<Array<{ migration_name: string; checksum: string; finished_at: Date | null; rolled_back_at: Date | null }>>`SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY migration_name`;
      const applied = rows.filter((row) => !row.rolled_back_at);
      assert.deepEqual(applied.map((row) => row.migration_name), names);
      for (const row of applied) {
        assert.ok(row.finished_at, `${row.migration_name} did not finish`);
        const checksum = createHash("sha256").update(readFileSync(join(directory, row.migration_name, "migration.sql"))).digest("hex");
        assert.equal(row.checksum, checksum, `${row.migration_name} checksum changed after application`);
      }
    });

    await context.test("email delivery uses the canonical schema after a clean migration", async () => {
      const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'email_deliveries'`;
      const names = new Set(columns.map((column) => column.column_name));
      assert.ok(names.has("recipient_email"));
      assert.ok(names.has("report_version"));
      assert.equal(names.has("recipient_user_id"), false);
      assert.equal(names.has("delivery_key"), false);
      // Reading through Prisma also checks every field expected by the generated client.
      await prisma.emailDelivery.findMany({ take: 1 });
      await prisma.organizationSettings.findMany({ take: 1 });
    });

    await context.test("one office session, task timer and break per employee are enforced by PostgreSQL", async () => {
      const rollback = new Error("ROLL_BACK_TEST_FIXTURE");
      await assert.rejects(prisma.$transaction(async (tx) => {
        const user = await tx.user.create({ data: { email: `constraints-${randomUUID()}@teamflow.test` } });
        const organization = await tx.organization.create({ data: { name: "Constraint test", slug: `constraints-${user.id}`, ownerId: user.id } });
        const task = await tx.task.create({ data: { organizationId: organization.id, createdById: user.id, assignedToId: user.id, title: "Timer constraint test" } });
        const attendance = await tx.attendance.create({ data: { organizationId: organization.id, userId: user.id, attendanceDate: new Date("2026-10-31T00:00:00Z"), checkInAt: new Date() } });
        const data = { organizationId: organization.id, userId: user.id, attendanceId: attendance.id, startedAt: new Date() };
        const office = await tx.workSession.create({ data });
        // A task timer must coexist with the office session, but a second of either must fail.
        await tx.workSession.create({ data: { ...data, taskId: task.id } });
        const expectDuplicate = async (operation: () => Promise<unknown>) => {
          await tx.$executeRaw`SAVEPOINT duplicate_guard`;
          await assert.rejects(operation(), (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002"));
          await tx.$executeRaw`ROLLBACK TO SAVEPOINT duplicate_guard`;
        };
        await expectDuplicate(() => tx.workSession.create({ data }));
        await expectDuplicate(() => tx.workSession.create({ data: { ...data, taskId: task.id } }));
        const breakData = { ...data, workSessionId: office.id, type: "LUNCH" as const };
        await tx.break.create({ data: breakData });
        await expectDuplicate(() => tx.break.create({ data: breakData }));
        await tx.workSession.updateMany({ where: { userId: user.id, endedAt: null }, data: { endedAt: new Date(), durationMins: 0 } });
        await tx.break.updateMany({ where: { userId: user.id, endedAt: null }, data: { endedAt: new Date(), durationMins: 0 } });
        await tx.workSession.create({ data });
        await tx.break.create({ data: breakData });
        throw rollback;
      }), (error: unknown) => error === rollback);
    });
  } finally {
    await prisma.$disconnect();
  }
});
