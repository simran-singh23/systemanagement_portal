const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function assertSafeTestDatabaseUrl(value: string | undefined) {
  if (!value) throw new Error("TEST_DATABASE_URL is required for database integration tests.");

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("TEST_DATABASE_URL must be a valid PostgreSQL URL.");
  }

  const databaseName = url.pathname.replace(/^\//, "").toLowerCase();
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("TEST_DATABASE_URL must use PostgreSQL.");
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error("Integration tests only accept a loopback PostgreSQL host.");
  }
  if (!databaseName.includes("test")) {
    throw new Error("The test database name must contain 'test'.");
  }

  return value;
}
