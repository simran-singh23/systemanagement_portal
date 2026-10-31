CREATE TYPE "AutomationType" AS ENUM ('CHECK_IN_REMINDER', 'MISSING_CHECK_IN', 'LUNCH_REMINDER', 'TASK_DEADLINE', 'DAILY_REPORT_REMINDER', 'MISSING_DAILY_REPORT', 'DAILY_TEAM_SUMMARY');
CREATE TYPE "AutomationStatus" AS ENUM ('SUCCESS', 'FAILED', 'SKIPPED');

ALTER TABLE "organization_settings"
  ADD COLUMN "check_in_reminder_time" TEXT NOT NULL DEFAULT '09:00',
  ADD COLUMN "check_in_cutoff_time" TEXT NOT NULL DEFAULT '09:30',
  ADD COLUMN "daily_report_reminder_time" TEXT NOT NULL DEFAULT '17:30',
  ADD COLUMN "manager_summary_time" TEXT NOT NULL DEFAULT '19:00',
  ADD COLUMN "task_deadline_reminder_hours" INTEGER[] NOT NULL DEFAULT ARRAY[24, 2]::INTEGER[],
  ADD COLUMN "enable_check_in_reminders" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "enable_missing_check_in_alerts" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notify_managers_missing_check_in" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "enable_lunch_reminders" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "enable_task_deadline_reminders" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notify_managers_overdue_tasks" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "enable_daily_report_reminders" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "enable_missing_report_alerts" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notify_managers_missing_reports" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "enable_daily_team_summary" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "automation_executions" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "automation" "AutomationType" NOT NULL,
  "work_date" DATE NOT NULL,
  "scheduled_for" TIMESTAMPTZ(3) NOT NULL,
  "executed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" "AutomationStatus" NOT NULL,
  "notifications_created" INTEGER NOT NULL DEFAULT 0,
  "error_summary" TEXT,
  "run_key" TEXT NOT NULL,
  "metadata" JSONB,
  CONSTRAINT "automation_executions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "automation_executions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "automation_executions_run_key_key" ON "automation_executions"("run_key");
CREATE INDEX "automation_executions_organization_id_executed_at_idx" ON "automation_executions"("organization_id", "executed_at");
CREATE INDEX "automation_executions_organization_id_automation_work_date_idx" ON "automation_executions"("organization_id", "automation", "work_date");
CREATE INDEX "automation_executions_status_executed_at_idx" ON "automation_executions"("status", "executed_at");

CREATE TABLE "daily_team_summaries" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "work_date" DATE NOT NULL,
  "summary_data" JSONB NOT NULL,
  "generated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "daily_team_summaries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "daily_team_summaries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "daily_team_summaries_organization_id_work_date_version_key" ON "daily_team_summaries"("organization_id", "work_date", "version");
CREATE INDEX "daily_team_summaries_organization_id_generated_at_idx" ON "daily_team_summaries"("organization_id", "generated_at");
