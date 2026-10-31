ALTER TYPE "BreakType" ADD VALUE IF NOT EXISTS 'TEA';
ALTER TYPE "BreakType" ADD VALUE IF NOT EXISTS 'PERSONAL';

ALTER TABLE "work_sessions"
  ADD COLUMN "organization_id" TEXT,
  ADD COLUMN "task_id" TEXT;

UPDATE "work_sessions" ws
SET "organization_id" = a."organization_id"
FROM "attendance" a
WHERE a."id" = ws."attendance_id";

ALTER TABLE "work_sessions" ALTER COLUMN "organization_id" SET NOT NULL;

ALTER TABLE "breaks"
  ADD COLUMN "organization_id" TEXT,
  ADD COLUMN "user_id" TEXT,
  ADD COLUMN "attendance_id" TEXT;

UPDATE "breaks" b
SET "organization_id" = ws."organization_id",
    "user_id" = ws."user_id",
    "attendance_id" = ws."attendance_id"
FROM "work_sessions" ws
WHERE ws."id" = b."work_session_id";

ALTER TABLE "breaks" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "breaks" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "breaks" ALTER COLUMN "attendance_id" SET NOT NULL;

ALTER TABLE "organization_settings"
  ADD COLUMN "lunch_reminder_time" TEXT NOT NULL DEFAULT '14:00';

ALTER TABLE "work_sessions" ADD CONSTRAINT "work_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_sessions" ADD CONSTRAINT "work_sessions_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "breaks" ADD CONSTRAINT "breaks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "breaks" ADD CONSTRAINT "breaks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "breaks" ADD CONSTRAINT "breaks_attendance_id_fkey" FOREIGN KEY ("attendance_id") REFERENCES "attendance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX IF EXISTS "work_sessions_one_active_per_user_idx";
CREATE UNIQUE INDEX "work_sessions_one_active_attendance_per_user_idx" ON "work_sessions"("user_id") WHERE "ended_at" IS NULL AND "task_id" IS NULL;
CREATE UNIQUE INDEX "work_sessions_one_active_task_per_user_idx" ON "work_sessions"("user_id") WHERE "ended_at" IS NULL AND "task_id" IS NOT NULL;
CREATE UNIQUE INDEX "breaks_one_active_per_user_idx" ON "breaks"("user_id") WHERE "ended_at" IS NULL;

CREATE INDEX "work_sessions_organization_id_started_at_idx" ON "work_sessions"("organization_id", "started_at");
CREATE INDEX "work_sessions_task_id_started_at_idx" ON "work_sessions"("task_id", "started_at");
CREATE INDEX "breaks_organization_id_started_at_idx" ON "breaks"("organization_id", "started_at");
CREATE INDEX "breaks_user_id_started_at_idx" ON "breaks"("user_id", "started_at");
CREATE INDEX "breaks_attendance_id_started_at_idx" ON "breaks"("attendance_id", "started_at");
