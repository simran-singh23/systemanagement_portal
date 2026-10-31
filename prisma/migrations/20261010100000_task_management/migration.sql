-- Align task workflow states with the Phase 5 task lifecycle.
ALTER TYPE "TaskStatus" RENAME VALUE 'IN_REVIEW' TO 'REVIEW';
ALTER TYPE "TaskStatus" ADD VALUE 'BLOCKED' BEFORE 'REVIEW';

-- Track planned starts separately from creation and preserve archived work.
ALTER TABLE "tasks"
ADD COLUMN "start_at" TIMESTAMPTZ(3),
ADD COLUMN "archived_at" TIMESTAMPTZ(3);

CREATE INDEX "tasks_organization_id_archived_at_due_at_idx"
ON "tasks"("organization_id", "archived_at", "due_at");
