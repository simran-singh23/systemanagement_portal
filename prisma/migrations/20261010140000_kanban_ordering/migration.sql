ALTER TABLE "tasks" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

WITH ordered_tasks AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "organization_id", "status"
    ORDER BY "created_at" ASC
  ) - 1 AS next_position
  FROM "tasks"
)
UPDATE "tasks"
SET "position" = ordered_tasks.next_position
FROM ordered_tasks
WHERE "tasks"."id" = ordered_tasks."id";

CREATE INDEX "tasks_organization_id_status_position_idx"
ON "tasks"("organization_id", "status", "position");
