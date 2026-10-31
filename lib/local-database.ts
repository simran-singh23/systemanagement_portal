const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Guard commands that create, migrate, or seed local development/test data. */
export function assertLocalDatabaseUrl(value: string | undefined, kind: "development" | "test") {
  if (!value) throw new Error(`An explicit ${kind} database URL is required.`);
  let url: URL;
  let database: string;
  try {
    url = new URL(value);
    database = decodeURIComponent(url.pathname.slice(1));
  } catch {
    throw new Error("Local database URL is malformed.");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error("Local setup and tests require a loopback PostgreSQL host.");
  }
  const pattern = kind === "development" ? /^teamflow_dev(?:_[a-z0-9_]+)?$/ : /^teamflow_(?:migration_)?test(?:_[a-z0-9_]+)?$/;
  if (database.length > 63 || !pattern.test(database)) {
    throw new Error(`Use a dedicated teamflow_${kind === "development" ? "dev" : "test"} database.`);
  }
  const schemas = url.searchParams.getAll("schema");
  if (url.hash || [...url.searchParams.keys()].some((key) => key !== "schema") || schemas.length > 1 || (schemas.length === 1 && schemas[0] !== "public")) {
    throw new Error("Local database URLs may only specify schema=public.");
  }
  return value;
}

export function assertLocalSetupTargets(environment: Record<string, string | undefined>) {
  const development = assertLocalDatabaseUrl(environment.DATABASE_URL, "development");
  const direct = assertLocalDatabaseUrl(environment.DIRECT_URL || development, "development");
  const runtimeUrl = new URL(development);
  const directUrl = new URL(direct);
  if (runtimeUrl.pathname !== directUrl.pathname || (runtimeUrl.port || "5432") !== (directUrl.port || "5432")) {
    throw new Error("Local DATABASE_URL and DIRECT_URL must target the same database and port.");
  }
  const test = assertLocalDatabaseUrl(environment.TEST_DATABASE_URL, "test");
  return { development, direct, test };
}
