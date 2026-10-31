import { defineConfig, devices } from "@playwright/test";
import { assertSafeTestDatabaseUrl } from "./tests/helpers/test-database";

const port = 3100;
const baseURL = `http://127.0.0.1:${port}`;
const testDatabase = assertSafeTestDatabaseUrl(process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/teamflow_test?schema=public");

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel: "chromium" },
    },
  ],
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    url: `${baseURL}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      AUTH_SECRET: process.env.AUTH_SECRET ?? "phase-20-browser-test-secret-at-least-32-characters",
      AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID ?? "browser-test-client-id",
      AUTH_GOOGLE_SECRET: process.env.AUTH_GOOGLE_SECRET ?? "browser-test-client-secret",
      DATABASE_URL: testDatabase,
      DIRECT_URL: testDatabase,
      AUTH_URL: baseURL,
      AUTH_TRUST_HOST: "true",
      // Provider calls stay disabled during local browser tests.
      RESEND_API_KEY: "",
      RESEND_FROM_EMAIL: "",
      RESEND_WEBHOOK_SECRET: "whsec_dGVhbWZsb3ctbG9jYWwtYnJvd3Nlci13ZWJob29rLXNlY3JldA==",
      INNGEST_DEV: "1",
    },
  },
});
