-- Password authentication alongside existing Auth.js JWT/OAuth accounts.
ALTER TABLE "users"
  ADD COLUMN "password_hash" TEXT,
  ADD COLUMN "auth_version" INTEGER NOT NULL DEFAULT 0;

CREATE TYPE "PasswordTokenPurpose" AS ENUM ('INITIAL_SETUP', 'PASSWORD_RESET');

CREATE TABLE "password_tokens" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "purpose" "PasswordTokenPurpose" NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "consumed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "password_tokens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "auth_rate_limits" (
  "key_hash" TEXT NOT NULL,
  "window_started_at" TIMESTAMPTZ(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "auth_rate_limits_pkey" PRIMARY KEY ("key_hash")
);

CREATE TABLE "auth_security_events" (
  "id" TEXT NOT NULL,
  "user_id" TEXT,
  "event" TEXT NOT NULL,
  "subject_hash" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auth_security_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "password_tokens_token_hash_key" ON "password_tokens"("token_hash");
CREATE INDEX "password_tokens_user_id_purpose_expires_at_idx" ON "password_tokens"("user_id", "purpose", "expires_at");
CREATE INDEX "password_tokens_expires_at_idx" ON "password_tokens"("expires_at");
CREATE INDEX "auth_rate_limits_window_started_at_idx" ON "auth_rate_limits"("window_started_at");
CREATE INDEX "auth_security_events_user_id_created_at_idx" ON "auth_security_events"("user_id", "created_at");
CREATE INDEX "auth_security_events_event_created_at_idx" ON "auth_security_events"("event", "created_at");

ALTER TABLE "password_tokens"
  ADD CONSTRAINT "password_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auth_security_events"
  ADD CONSTRAINT "auth_security_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
