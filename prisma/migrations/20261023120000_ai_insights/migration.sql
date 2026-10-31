CREATE TYPE "AiProvider" AS ENUM ('OPENAI');
CREATE TYPE "AiInsightType" AS ENUM ('DAILY_SUMMARY', 'BLOCKERS', 'WORKLOAD', 'ASSISTANT');
CREATE TYPE "AiGenerationStatus" AS ENUM ('SUCCEEDED', 'FAILED');
CREATE TYPE "AiFeedbackRating" AS ENUM ('HELPFUL', 'NOT_HELPFUL', 'INCORRECT');

ALTER TABLE "organization_settings"
  ADD COLUMN "ai_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "ai_summary_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "ai_assistant_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "ai_authorized_roles" "UserRole"[] NOT NULL DEFAULT ARRAY['SUPER_ADMIN', 'PRODUCT_MANAGER', 'TEAM_LEAD']::"UserRole"[],
  ADD COLUMN "ai_provider" "AiProvider" NOT NULL DEFAULT 'OPENAI',
  ADD COLUMN "ai_monthly_request_limit" INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN "ai_monthly_token_limit" INTEGER NOT NULL DEFAULT 500000,
  ADD COLUMN "ai_context_max_chars" INTEGER NOT NULL DEFAULT 16000,
  ADD COLUMN "ai_retention_days" INTEGER NOT NULL DEFAULT 7,
  ADD CONSTRAINT "organization_settings_ai_request_limit_check" CHECK ("ai_monthly_request_limit" BETWEEN 1 AND 5000),
  ADD CONSTRAINT "organization_settings_ai_token_limit_check" CHECK ("ai_monthly_token_limit" BETWEEN 1000 AND 50000000),
  ADD CONSTRAINT "organization_settings_ai_context_check" CHECK ("ai_context_max_chars" BETWEEN 4000 AND 50000),
  ADD CONSTRAINT "organization_settings_ai_retention_check" CHECK ("ai_retention_days" BETWEEN 1 AND 90);

CREATE TABLE "ai_generations" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "requested_by_id" TEXT NOT NULL,
  "type" "AiInsightType" NOT NULL,
  "status" "AiGenerationStatus" NOT NULL,
  "question" TEXT,
  "output" JSONB,
  "source_refs" JSONB NOT NULL,
  "context_hash" TEXT NOT NULL,
  "provider" "AiProvider" NOT NULL,
  "model" TEXT NOT NULL,
  "input_tokens" INTEGER NOT NULL DEFAULT 0,
  "output_tokens" INTEGER NOT NULL DEFAULT 0,
  "total_tokens" INTEGER NOT NULL DEFAULT 0,
  "error_code" TEXT,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_generations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_generations_usage_nonnegative" CHECK ("input_tokens" >= 0 AND "output_tokens" >= 0 AND "total_tokens" >= 0)
);

CREATE TABLE "ai_feedback" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "generation_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "rating" "AiFeedbackRating" NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ai_feedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_generations_organization_id_type_created_at_idx" ON "ai_generations"("organization_id", "type", "created_at");
CREATE INDEX "ai_generations_organization_id_requested_by_id_created_at_idx" ON "ai_generations"("organization_id", "requested_by_id", "created_at");
CREATE INDEX "ai_generations_organization_id_context_hash_expires_at_idx" ON "ai_generations"("organization_id", "context_hash", "expires_at");
CREATE UNIQUE INDEX "ai_feedback_generation_id_user_id_key" ON "ai_feedback"("generation_id", "user_id");
CREATE INDEX "ai_feedback_organization_id_created_at_idx" ON "ai_feedback"("organization_id", "created_at");
CREATE INDEX "ai_feedback_user_id_created_at_idx" ON "ai_feedback"("user_id", "created_at");

ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_feedback" ADD CONSTRAINT "ai_feedback_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_feedback" ADD CONSTRAINT "ai_feedback_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "ai_generations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_feedback" ADD CONSTRAINT "ai_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
