import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

let productionPrisma: PrismaClient | undefined;

function databaseUrl() {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error("DATABASE_URL is required. Configure .env.local or run npm run setup:local.");
  return value;
}

const createPrismaClient = () => {
  const pool = new Pool({ connectionString: databaseUrl() });
  attachDatabasePool(pool);
  const adapter = new PrismaPg(pool, { disposeExternalPool: true });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
};

function getPrismaClient() {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;
  productionPrisma ??= createPrismaClient();
  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = productionPrisma;
  return productionPrisma;
}

function lazyDelegate(delegate: object) {
  return new Proxy(delegate, {
    get(target, property) {
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

// Next.js imports route modules during build to collect route configuration.
// Defer environment validation and client construction until a request actually
// uses Prisma so a missing runtime secret does not fail module collection.
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getPrismaClient();
    const value = Reflect.get(client, property, client) as unknown;
    if (typeof value === "function") return value.bind(client);
    if (value !== null && typeof value === "object") return lazyDelegate(value);
    return value;
  },
});
