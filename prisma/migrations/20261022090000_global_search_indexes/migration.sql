-- Trigram indexes support bounded, organization-scoped ILIKE searches without
-- introducing a separate search service. PostgreSQL still applies organization
-- and authorization predicates from every query.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "users_name_trgm_idx" ON "users" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "users_email_trgm_idx" ON "users" USING GIN ("email" gin_trgm_ops);
CREATE INDEX "teams_name_trgm_idx" ON "teams" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "tasks_title_trgm_idx" ON "tasks" USING GIN ("title" gin_trgm_ops) WHERE "archived_at" IS NULL;
CREATE INDEX "tasks_description_trgm_idx" ON "tasks" USING GIN ("description" gin_trgm_ops) WHERE "archived_at" IS NULL;
CREATE INDEX "daily_reports_summary_trgm_idx" ON "daily_reports" USING GIN ("summary" gin_trgm_ops);

CREATE INDEX "organization_members_org_status_user_idx" ON "organization_members" ("organization_id", "status", "user_id");
CREATE INDEX "leave_requests_org_user_created_idx" ON "leave_requests" ("organization_id", "user_id", "created_at" DESC);
