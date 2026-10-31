import type { Prisma } from "@prisma/client";

export async function lockTransaction(tx: Prisma.TransactionClient, key: string) {
  // PostgreSQL advisory locks return void. $queryRaw attempts to deserialize
  // that unsupported result and aborts the transaction with Prisma's pg adapter.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}
