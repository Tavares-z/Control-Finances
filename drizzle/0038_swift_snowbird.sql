CREATE TABLE "openfinance_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"pluggy_item_id" text NOT NULL,
	"connector_name" text,
	"conta_id" uuid,
	"pluggy_account_id" text,
	"status" text,
	"consent_expires_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pre_lancamentos" ADD COLUMN "external_source_id" text;--> statement-breakpoint
ALTER TABLE "openfinance_connections" ADD CONSTRAINT "openfinance_connections_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "openfinance_connections" ADD CONSTRAINT "openfinance_connections_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "openfinance_connections_user_id_idx" ON "openfinance_connections" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "openfinance_connections_user_id_pluggy_item_id_key" ON "openfinance_connections" USING btree ("user_id","pluggy_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pre_lancamentos_user_id_external_source_id_key" ON "pre_lancamentos" USING btree ("user_id","external_source_id") WHERE external_source_id IS NOT NULL;