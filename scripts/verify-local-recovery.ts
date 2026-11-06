import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { Client } from "pg";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { assertLocalDatabaseUrl } from "../lib/local-database";
import { hashPassword, verifyPassword } from "../lib/password";

async function main() {
  const configured = new URL(assertLocalDatabaseUrl(process.env.TEST_DATABASE_URL, "test"));
  const suffix = randomUUID().replaceAll("-", "");
  const sourceName = `teamflow_test_recovery_${suffix}`;
  const restoredName = `teamflow_test_restore_${suffix}`;
  const urlFor = (name: string) => {
    const url = new URL(configured);
    url.pathname = `/${name}`;
    url.search = "";
    return url.toString();
  };
  const admin = new Client({ connectionString: urlFor("postgres") });
  const created: string[] = [];
  const directory = mkdtempSync(join(tmpdir(), "teamflow-recovery-"));
  const sourceUrl = urlFor(sourceName);
  const restoredUrl = urlFor(restoredName);
  const started = performance.now();
  const environment = { ...process.env, DATABASE_URL: sourceUrl, DIRECT_URL: sourceUrl };
  const pgTool = (tool: string) => process.env.PG_BIN ? join(process.env.PG_BIN, tool) : tool;
  function run(file: string, args: string[], env = environment) {
    return execFileSync(file, args, { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 32 * 1024 * 1024 });
  }
  async function fingerprint(url: string) {
    const client = new Client({ connectionString: url });
    await client.connect();
    try {
      const tables = await client.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename");
      const counts: Record<string, number> = {};
      const hash = createHash("sha256");
      for (const { tablename } of tables.rows) {
        const quoted = '"' + tablename.replaceAll('"', '""') + '"';
        const rows = await client.query<{ row: string }>(`SELECT row_to_json(t)::text AS row FROM public.${quoted} t ORDER BY row_to_json(t)::text COLLATE "C"`);
        counts[tablename] = rows.rows.length;
        hash.update(tablename);
        for (const row of rows.rows) hash.update(row.row);
      }
      const constraints = await client.query<{ name: string; table_name: string; expression: string; validated: boolean; no_inherit: boolean }>("SELECT c.conname AS name, t.relname AS table_name, pg_get_expr(c.conbin, c.conrelid) AS expression, c.convalidated AS validated, c.connoinherit AS no_inherit FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace WHERE n.nspname = 'public' AND c.contype = 'c' ORDER BY t.relname, c.conname");
      const checks = [];
      for (const constraint of constraints.rows) {
        const table = '"' + constraint.table_name.replaceAll('"', '""') + '"';
        // PostgreSQL flattens equivalent nested AND expressions during restore.
        // Its planner gives both forms a canonical expression without executing them.
        const plan = await client.query(`EXPLAIN (FORMAT JSON, COSTS FALSE) SELECT * FROM public.${table} WHERE ${constraint.expression}`);
        checks.push({ name: constraint.name, table: constraint.table_name, validated: constraint.validated, noInherit: constraint.no_inherit, plan: plan.rows[0]["QUERY PLAN"] });
      }
      return { counts, digest: hash.digest("hex"), checks };
    } finally {
      await client.end();
    }
  }
  function schema(url: string) {
    return run(pgTool("pg_dump"), ["--dbname", url, "--schema-only", "--no-owner", "--no-acl"])
      .split("\n").filter((line) => !line.startsWith("\\restrict ") && !line.startsWith("\\unrestrict ") && !line.startsWith("--") && line.trim())
      .map((line) => line.replace(/(CONSTRAINT .+ CHECK )\(.+\)(,?)$/, "$1(verified_by_planner)$2")).join("\n");
  }

  try {
    await admin.connect();
    for (const name of [sourceName, restoredName]) {
      await admin.query(`CREATE DATABASE "${name}"`);
      created.push(name);
    }
    run(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"]);
    const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: sourceUrl }) });
    const password = "TeamFlow-recovery-fixture-123";
    let employeeId: string;
    try {
      const owner = await prisma.user.create({ data: { name: "Recovery owner", email: `owner-${suffix}@teamflow.test`, role: "SUPER_ADMIN", status: "ACTIVE", emailVerified: new Date(), passwordHash: await hashPassword(password) } });
      const employee = await prisma.user.create({ data: { name: "Recovery employee", email: `employee-${suffix}@teamflow.test`, role: "EMPLOYEE", status: "ACTIVE", emailVerified: new Date(), passwordHash: await hashPassword(password) } });
      employeeId = employee.id;
      const organization = await prisma.organization.create({ data: {
        name: "Recovery fixture", slug: `recovery-${suffix}`, ownerId: owner.id,
        members: { create: [{ userId: owner.id, role: "SUPER_ADMIN", status: "ACTIVE" }, { userId: employee.id, role: "EMPLOYEE", status: "ACTIVE" }] },
        settings: { create: { timezone: "UTC" } },
      } });
      const team = await prisma.team.create({ data: { organizationId: organization.id, name: "Recovery team", managerId: owner.id, members: { create: { userId: employee.id } } } });
      const task = await prisma.task.create({ data: { organizationId: organization.id, teamId: team.id, createdById: owner.id, assignedToId: employee.id, title: "Restored completed task", status: "COMPLETED", completedAt: new Date("2026-11-01T12:00:00Z") } });
      const attendance = await prisma.attendance.create({ data: { organizationId: organization.id, userId: employee.id, attendanceDate: new Date("2026-11-01"), checkInAt: new Date("2026-11-01T09:00:00Z"), checkOutAt: new Date("2026-11-01T17:00:00Z"), status: "PRESENT" } });
      const office = await prisma.workSession.create({ data: { organizationId: organization.id, userId: employee.id, attendanceId: attendance.id, startedAt: attendance.checkInAt!, endedAt: attendance.checkOutAt, durationMins: 480 } });
      await prisma.break.create({ data: { organizationId: organization.id, userId: employee.id, attendanceId: attendance.id, workSessionId: office.id, type: "LUNCH", startedAt: new Date("2026-11-01T13:00:00Z"), endedAt: new Date("2026-11-01T13:30:00Z"), durationMins: 30 } });
      const report = await prisma.dailyReport.create({ data: { organizationId: organization.id, userId: employee.id, attendanceId: attendance.id, reportDate: new Date("2026-11-01"), summary: "Completed the fixture work before recovery rehearsal.", status: "SUBMITTED", submittedAt: attendance.checkOutAt, tasks: { create: { taskId: task.id, titleSnapshot: task.title, statusSnapshot: "COMPLETED", completedToday: true, minutesSpent: 60 } } } });
      await prisma.teamPulse.create({ data: { organizationId: organization.id, userId: employee.id, teamId: team.id, dailyReportId: report.id, pulseDate: report.reportDate, mood: "NORMAL", score: 3 } });
      await prisma.activityLog.create({ data: { organizationId: organization.id, actorId: employee.id, action: "recovery.fixture", entityType: "daily_report", entityId: report.id } });
      await prisma.notification.create({ data: { organizationId: organization.id, userId: employee.id, type: "REPORT_REVIEWED", title: "Recovery fixture", eventId: `recovery:${suffix}` } });
    } finally {
      await prisma.$disconnect();
    }
    const before = await fingerprint(sourceUrl);
    const beforeSchema = schema(sourceUrl);
    const archive = join(directory, "backup.dump");
    run(pgTool("pg_dump"), ["--dbname", sourceUrl, "--format=custom", "--no-owner", "--no-acl", "--file", archive]);
    const restoreStarted = performance.now();
    run(pgTool("pg_restore"), ["--dbname", restoredUrl, "--no-owner", "--no-acl", "--exit-on-error", archive]);
    const restoreMilliseconds = Math.round(performance.now() - restoreStarted);
    assert.deepEqual(await fingerprint(restoredUrl), before, "Restored row counts and values differ.");
    const restoredSchema = schema(restoredUrl);
    if (restoredSchema !== beforeSchema) {
      const originalLines = beforeSchema.split("\n");
      const restoredLines = restoredSchema.split("\n");
      const index = originalLines.findIndex((line, position) => line !== restoredLines[position]);
      throw new Error(`Restored schema differs near ${originalLines[index]} / ${restoredLines[index]}`);
    }
    const restored = new PrismaClient({ adapter: new PrismaPg({ connectionString: restoredUrl }) });
    try {
      const migrations = await restored.$queryRaw<Array<{ migration_name: string; checksum: string; finished_at: Date | null; rolled_back_at: Date | null }>>`SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY migration_name`;
      const folders = readdirSync("prisma/migrations", { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
      assert.deepEqual(migrations.map((row) => row.migration_name), folders);
      for (const migration of migrations) {
        assert.ok(migration.finished_at && !migration.rolled_back_at);
        assert.equal(migration.checksum, createHash("sha256").update(readFileSync(join("prisma/migrations", migration.migration_name, "migration.sql"))).digest("hex"));
      }
      const employee = await restored.user.findUniqueOrThrow({ where: { id: employeeId! }, include: { organizationMembers: true } });
      assert.equal(await verifyPassword(employee.passwordHash!, password), true);
      assert.equal(employee.role, "EMPLOYEE");
      assert.equal(employee.organizationMembers[0].status, "ACTIVE");
    } finally {
      await restored.$disconnect();
    }
    const restoredEnv = { ...environment, DATABASE_URL: restoredUrl, DIRECT_URL: restoredUrl };
    run(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"], restoredEnv);
    assert.deepEqual(await fingerprint(restoredUrl), before, "Reapplying migrations changed the restored data.");
    console.log(JSON.stringify({ result: "passed", tables: Object.keys(before.counts).length, rows: Object.values(before.counts).reduce((sum, count) => sum + count, 0), restoreMilliseconds, totalMilliseconds: Math.round(performance.now() - started), checks: ["fresh migration chain", "data and schema restored", "migration checksums", "password and active membership restored", "migration retry preserves data"] }, null, 2));
  } finally {
    for (const name of created.reverse()) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.end();
    rmSync(directory, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown recovery verification error.";
  console.error(message.replace(/postgres(?:ql)?:\/\/[^\s"']+/g, "[database URL]"));
  process.exitCode = 1;
});
