-- Keep provider retry requests identical even when the source report changes.
ALTER TABLE "email_deliveries" ADD COLUMN "request_payload" JSONB;
