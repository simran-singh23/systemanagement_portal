ALTER TABLE "organizations"
  ADD COLUMN "contact_email" TEXT,
  ADD COLUMN "contact_phone" TEXT,
  ADD COLUMN "description" TEXT;

ALTER TABLE "organization_holidays"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "organization_settings"
  ADD COLUMN "expected_daily_minutes" INTEGER NOT NULL DEFAULT 480,
  ADD COLUMN "overnight_shift_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "half_day_threshold_mins" INTEGER NOT NULL DEFAULT 240,
  ADD COLUMN "auto_finalize_absence" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "absence_finalization_time" TEXT NOT NULL DEFAULT '23:00',
  ADD COLUMN "allow_attendance_corrections" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "require_correction_approval" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "suggested_lunch_mins" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN "allowed_break_types" "BreakType"[] NOT NULL DEFAULT ARRAY['LUNCH', 'TEA', 'PERSONAL', 'OTHER']::"BreakType"[],
  ADD COLUMN "max_break_mins" INTEGER,
  ADD COLUMN "available_leave_types" "LeaveType"[] NOT NULL DEFAULT ARRAY['CASUAL', 'SICK', 'EARNED', 'UNPAID', 'OTHER']::"LeaveType"[],
  ADD COLUMN "require_leave_approval" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "leave_advance_notice_days" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "allow_past_date_leave_requests" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "allow_report_editing_after_submission" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "daily_email_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "daily_email_time" TEXT NOT NULL DEFAULT '19:15',
  ADD COLUMN "primary_report_recipient_id" TEXT,
  ADD COLUMN "additional_report_recipient_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "organization_settings"
  ADD CONSTRAINT "organization_settings_daily_minutes_check" CHECK ("expected_daily_minutes" BETWEEN 60 AND 1440),
  ADD CONSTRAINT "organization_settings_half_day_check" CHECK ("half_day_threshold_mins" BETWEEN 30 AND 720 AND "half_day_threshold_mins" < "expected_daily_minutes"),
  ADD CONSTRAINT "organization_settings_grace_check" CHECK ("late_grace_mins" BETWEEN 0 AND 180),
  ADD CONSTRAINT "organization_settings_break_minutes_check" CHECK ("max_break_mins" IS NULL OR "max_break_mins" BETWEEN 5 AND 480),
  ADD CONSTRAINT "organization_settings_notice_days_check" CHECK ("leave_advance_notice_days" BETWEEN 0 AND 365);
