-- Shared, database-backed rate-limit counters for horizontally scaled deployments.
CREATE TABLE "rate_limit_buckets" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "window_start" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rate_limit_buckets_scope_key_hash_window_start_key"
ON "rate_limit_buckets"("scope", "key_hash", "window_start");

CREATE INDEX "rate_limit_buckets_expires_at_idx"
ON "rate_limit_buckets"("expires_at");
