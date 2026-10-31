ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'BREAK';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'REPORT_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'LEAVE_REQUESTED';

ALTER TABLE "notifications"
  ADD COLUMN "related_entity_type" TEXT,
  ADD COLUMN "related_entity_id" TEXT,
  ADD COLUMN "event_id" TEXT;

CREATE UNIQUE INDEX "notifications_user_id_event_id_key"
  ON "notifications"("user_id", "event_id");
CREATE INDEX "notifications_user_id_type_created_at_idx"
  ON "notifications"("user_id", "type", "created_at");
CREATE INDEX "notifications_organization_id_related_entity_type_related_entity_id_idx"
  ON "notifications"("organization_id", "related_entity_type", "related_entity_id");
