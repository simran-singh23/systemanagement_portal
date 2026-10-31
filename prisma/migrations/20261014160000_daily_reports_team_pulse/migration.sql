ALTER TYPE "PulseMood" ADD VALUE IF NOT EXISTS 'SMOOTH';
ALTER TYPE "PulseMood" ADD VALUE IF NOT EXISTS 'NORMAL';

ALTER TABLE "daily_reports"
  ADD COLUMN "attendance_id" TEXT,
  ADD COLUMN "completed_work" TEXT,
  ADD COLUMN "progress" TEXT,
  ADD COLUMN "additional_notes" TEXT,
  ADD COLUMN "snapshot" JSONB;

ALTER TABLE "daily_report_tasks"
  ADD COLUMN "title_snapshot" TEXT,
  ADD COLUMN "status_snapshot" "TaskStatus",
  ADD COLUMN "completed_today" BOOLEAN NOT NULL DEFAULT false;

UPDATE "daily_report_tasks" drt
SET "title_snapshot" = t."title",
    "status_snapshot" = t."status"
FROM "tasks" t
WHERE t."id" = drt."task_id";

ALTER TABLE "daily_report_tasks" ALTER COLUMN "title_snapshot" SET NOT NULL;
ALTER TABLE "daily_report_tasks" ALTER COLUMN "status_snapshot" SET NOT NULL;

ALTER TABLE "team_pulses" ADD COLUMN "daily_report_id" TEXT;
ALTER TABLE "organization_settings" ADD COLUMN "allow_report_before_checkout" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "daily_report_tasks" DROP CONSTRAINT "daily_report_tasks_task_id_fkey";
ALTER TABLE "daily_report_tasks" ADD CONSTRAINT "daily_report_tasks_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "daily_reports" ADD CONSTRAINT "daily_reports_attendance_id_fkey" FOREIGN KEY ("attendance_id") REFERENCES "attendance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "team_pulses" ADD CONSTRAINT "team_pulses_daily_report_id_fkey" FOREIGN KEY ("daily_report_id") REFERENCES "daily_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "daily_reports_attendance_id_idx" ON "daily_reports"("attendance_id");
CREATE UNIQUE INDEX "team_pulses_daily_report_id_key" ON "team_pulses"("daily_report_id");
