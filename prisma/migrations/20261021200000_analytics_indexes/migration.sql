CREATE INDEX "tasks_organization_id_created_at_idx" ON "tasks"("organization_id", "created_at");
CREATE INDEX "tasks_organization_id_completed_at_idx" ON "tasks"("organization_id", "completed_at");
CREATE INDEX "daily_reports_organization_id_submitted_at_idx" ON "daily_reports"("organization_id", "submitted_at");
