ALTER TABLE "openfinance_connections" ADD COLUMN IF NOT EXISTS "pluggy_available_credit_limit" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "openfinance_connections" ADD COLUMN IF NOT EXISTS "pluggy_credit_limit" numeric(12, 2);
