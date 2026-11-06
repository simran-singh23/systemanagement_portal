import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";

const configuration = {
  DATABASE_URL: "postgresql://release:synthetic-password@db.teamflow.test:5432/teamflow?sslmode=require",
  DIRECT_URL: "postgresql://release:synthetic-password@db.teamflow.test:5432/teamflow?sslmode=require",
  AUTH_SECRET: "synthetic-production-check-secret-over-32-characters",
  AUTH_URL: "https://portal.teamflow.test",
  AUTH_TRUST_HOST: "true",
  AUTH_GOOGLE_ID: "synthetic-client",
  AUTH_GOOGLE_SECRET: "synthetic-google-secret",
  RESEND_API_KEY: "re_synthetic_key",
  RESEND_FROM_EMAIL: "TeamFlow <sender@teamflow.test>",
  RESEND_WEBHOOK_SECRET: "whsec_synthetic",
  INNGEST_EVENT_KEY: "synthetic-event",
  INNGEST_SIGNING_KEY: "synthetic-signing",
  INNGEST_DEV: "",
};

function run(changes: Record<string, string> = {}) {
  const result = spawnSync(process.execPath, [resolve("scripts/check-production-env.mjs")], {
    env: { ...process.env, ...configuration, ...changes }, encoding: "utf8",
  });
  const output = result.stdout + result.stderr;
  assert.ok(!output.includes("synthetic-password"));
  assert.ok(!output.includes(configuration.AUTH_SECRET));
  return { status: result.status, output };
}

test("production validator accepts a complete synthetic configuration without contacting services", () => {
  assert.equal(run().status, 0);
});

test("production validator rejects loopback databases, insecure TLS and noncanonical auth origins", () => {
  for (const DATABASE_URL of [
    "postgresql://user:pass@[::1]:5432/teamflow?sslmode=require",
    "postgresql://user:pass@127.0.0.2:5432/teamflow?sslmode=require",
    "postgresql://user:pass@db.teamflow.test/teamflow?sslmode=require&sslmode=disable",
    "postgresql://user:pass@db.teamflow.test/teamflow?sslmode=require&ssl=false",
  ]) assert.equal(run({ DATABASE_URL }).status, 1);
  for (const AUTH_URL of ["http://portal.teamflow.test", "https://localhost", "https://portal.teamflow.test/login", "https://user:pass@portal.teamflow.test", "https://portal.teamflow.test?debug=1"]) {
    assert.equal(run({ AUTH_URL }).status, 1);
  }
});

test("production validator requires grouped email credentials and rejects development job mode", () => {
  assert.match(run({ RESEND_WEBHOOK_SECRET: "" }).output, /RESEND_WEBHOOK_SECRET is required/);
  assert.equal(run({ INNGEST_DEV: "1" }).status, 1);
  assert.equal(run({ AUTH_SECRET: "short" }).status, 1);
});
