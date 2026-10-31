ALTER TYPE "AutomationType" ADD VALUE 'DAILY_EMAIL_REPORT';

-- The daily-email settings columns, EmailDeliveryStatus and email_deliveries are created by
-- 20261021230000_organization_policy_settings and 20261023130000_daily_email_delivery.
-- Creating them here as well made clean installs fail.
