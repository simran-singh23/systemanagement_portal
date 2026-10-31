import { assertLocalDatabaseUrl } from "../../lib/local-database";

export function assertSafeTestDatabaseUrl(value: string | undefined) {
  return assertLocalDatabaseUrl(value, "test");
}
