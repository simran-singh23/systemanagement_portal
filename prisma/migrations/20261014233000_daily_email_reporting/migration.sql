ALTER TYPE "AutomationType" ADD VALUE 'DAILY_EMAIL_REPORT';

CREATE TYPE "EmailType" AS ENUM ('DAILY_TEAM_REPORT');
CREATE TYPE "EmailDeliveryStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'DELIVERED', 'FAILED');

ALTER TABLE "organization_settings"
  ADD COLUMN "daily_email_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "daily_email_time" TEXT NOT NULL DEFAULT '19:15',
  ADD COLUMN "primary_report_recipient_id" TEXT,
  ADD COLUMN "additional_report_recipient_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "email_deliveries" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "recipient_user_id" TEXT NOT NULL,
  "report_date" DATE NOT NULL,
  "email_type" "EmailType" NOT NULL DEFAULT 'DAILY_TEAM_REPORT',
  "recipient_email" TEXT NOT NULL,
  "report_version" INTEGER NOT NULL DEFAULT 1,
  "delivery_key" TEXT NOT NULL,
  "provider_message_id" TEXT,
  "status" "EmailDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT,
  "last_attempt_at" TIMESTAMPTZ(3),
  "sent_at" TIMESTAMPTZ(3),
  "delivered_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "email_deliveries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "email_deliveries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "email_deliveries_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "email_deliveries_delivery_key_key" ON "email_deliveries"("delivery_key");
CREATE UNIQUE INDEX "email_deliveries_provider_message_id_key" ON "email_deliveries"("provider_message_id");
CREATE UNIQUE INDEX "email_deliveries_organization_id_report_date_email_type_recipient_user_id_report_version_key" ON "email_deliveries"("organization_id", "report_date", "email_type", "recipient_user_id", "report_version");
CREATE INDEX "email_deliveries_organization_id_created_at_idx" ON "email_deliveries"("organization_id", "created_at");
CREATE INDEX "email_deliveries_organization_id_status_report_date_idx" ON "email_deliveries"("organization_id", "status", "report_date");
CREATE INDEX "email_deliveries_recipient_user_id_report_date_idx" ON "email_deliveries"("recipient_user_id", "report_date");

CREATE TABLE "email_webhook_events" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT,
  "email_delivery_id" TEXT,
  "provider_event_id" TEXT NOT NULL,
  "provider_message_id" TEXT,
  "event_type" TEXT NOT NULL,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL,
  "processed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_webhook_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "email_webhook_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "email_webhook_events_email_delivery_id_fkey" FOREIGN KEY ("email_delivery_id") REFERENCES "email_deliveries"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "email_webhook_events_provider_event_id_key" ON "email_webhook_events"("provider_event_id");
CREATE INDEX "email_webhook_events_provider_message_id_idx" ON "email_webhook_events"("provider_message_id");
CREATE INDEX "email_webhook_events_email_delivery_id_occurred_at_idx" ON "email_webhook_events"("email_delivery_id", "occurred_at");
