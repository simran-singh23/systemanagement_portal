import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { userInfo } from "node:os";
import { loadEnvConfig } from "@next/env";
import { Client } from "pg";
import { assertLocalSetupTargets } from "../lib/local-database";

async function main() {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
    throw new Error("Local setup cannot run in production.");
  }
  if (!existsSync(".env") && !existsSync(".env.local")) {
    const url = new URL("postgresql://127.0.0.1/teamflow_dev?schema=public");
    url.username = process.env.PGUSER || userInfo().username;
    url.password = process.env.PGPASSWORD || "";
    url.port = process.env.PGPORT || "5432";
    const testUrl = new URL(url);
    testUrl.pathname = "/teamflow_test";
    const values = {
      DATABASE_URL: process.env.DATABASE_URL || url.toString(),
      DIRECT_URL: process.env.DIRECT_URL || process.env.DATABASE_URL || url.toString(),
      TEST_DATABASE_URL: process.env.TEST_DATABASE_URL || testUrl.toString(),
      AUTH_SECRET: process.env.AUTH_SECRET || randomBytes(32).toString("base64url"),
      AUTH_TRUST_HOST: "true",
      AUTH_URL: process.env.AUTH_URL || "http://localhost:3000",
      INNGEST_DEV: "1",
      SEED_DEV_PASSWORD: process.env.SEED_DEV_PASSWORD || randomBytes(18).toString("base64url"),
    };
    // Validate before creating a file or connecting to any database.
    assertLocalSetupTargets(values);
    writeFileSync(".env.local", Object.entries(values).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join("\n") + "\n", { flag: "wx", mode: 0o600 });
    console.log("Created .env.local with a random demo password. Existing environment files are never overwritten.");
  }
  loadEnvConfig(process.cwd(), true);
  const targets = assertLocalSetupTargets(process.env);
  for (const connectionString of [targets.direct, targets.test]) {
    const url = new URL(connectionString);
    const database = decodeURIComponent(url.pathname.slice(1));
    const adminUrl = new URL(url);
    adminUrl.pathname = "/postgres";
    adminUrl.search = "";
    const client = new Client({ connectionString: adminUrl.toString() });
    try {
      await client.connect();
      const found = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [database]);
      if (!found.rowCount) await client.query(`CREATE DATABASE "${database}"`);
    } finally {
      await client.end();
    }
    console.log(`Applying migrations to ${database}`);
    execFileSync("npm", ["run", "db:deploy"], {
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: connectionString, DIRECT_URL: connectionString },
    });
  }
  execFileSync("npm", ["run", "db:seed"], { stdio: "inherit" });
  console.log("TeamFlow is ready. Run npm run dev, then sign in as admin@teamflow.dev or employee@teamflow.dev using SEED_DEV_PASSWORD from your environment file.");
  if (!process.env.SEED_DEV_PASSWORD) console.log("SEED_DEV_PASSWORD is unset; configure it and rerun npm run db:seed to enable demo password login.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Local setup failed.");
  process.exitCode = 1;
});
