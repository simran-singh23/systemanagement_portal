-- Extend leave requests with employee notes, a server-calculated duration and attendance review state.
ALTER TABLE "leave_requests"
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "working_days" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "has_attendance_conflict" BOOLEAN NOT NULL DEFAULT false;

-- Link attendance projections to their originating leave request so cancellation is safe.
ALTER TABLE "attendance"
  ADD COLUMN "leave_request_id" TEXT;

ALTER TABLE "attendance"
  ADD CONSTRAINT "attendance_leave_request_id_fkey"
  FOREIGN KEY ("leave_request_id") REFERENCES "leave_requests"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "attendance_leave_request_id_idx" ON "attendance"("leave_request_id");
CREATE INDEX "leave_requests_organization_id_end_date_idx" ON "leave_requests"("organization_id", "end_date");

-- Organization-specific holidays are first-class records rather than global assumptions.
CREATE TABLE "organization_holidays" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "holiday_date" DATE NOT NULL,
  "name" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organization_holidays_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organization_holidays_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "organization_holidays_organization_id_holiday_date_key"
  ON "organization_holidays"("organization_id", "holiday_date");
CREATE INDEX "organization_holidays_organization_id_holiday_date_idx"
  ON "organization_holidays"("organization_id", "holiday_date");

ALTER TABLE "organization_settings"
  ADD COLUMN "allow_overlapping_leave_requests" BOOLEAN NOT NULL DEFAULT false;
