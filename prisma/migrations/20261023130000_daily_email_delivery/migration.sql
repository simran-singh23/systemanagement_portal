ALTER TYPE "AutomationType" ADD VALUE IF NOT EXISTS 'DAILY_EMAIL_REPORT';

CREATE TYPE "EmailDeliveryStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'DELIVERED', 'FAILED');

CREATE TABLE "email_deliveries" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "report_date" DATE NOT NULL,
  "report_version" INTEGER NOT NULL DEFAULT 1,
  "email_type" TEXT NOT NULL DEFAULT 'DAILY_TEAM_REPORT',
  "recipient_email" TEXT NOT NULL,
  "provider_message_id" TEXT,
  "status" "EmailDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT,
  "sent_at" TIMESTAMPTZ(3),
  "delivered_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "email_deliveries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "email_deliveries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "email_deliveries_provider_message_id_key" ON "email_deliveries"("provider_message_id");
CREATE UNIQUE INDEX "email_deliveries_organization_id_report_date_email_type_rec_key" ON "email_deliveries"("organization_id", "report_date", "email_type", "recipient_email", "report_version");
CREATE INDEX "email_deliveries_organization_id_report_date_status_idx" ON "email_deliveries"("organization_id", "report_date", "status");
CREATE INDEX "email_deliveries_status_updated_at_idx" ON "email_deliveries"("status", "updated_at");
