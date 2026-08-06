-- Idempotente (prod foi construído por push; tracking do drizzle vazio em prod).
CREATE TABLE IF NOT EXISTS "openfinance_ignored_series" (
	"user_id" text NOT NULL,
	"cartao_id" uuid NOT NULL,
	"descricao" text NOT NULL,
	"qtde_parcela" smallint,
	"amount_key" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "openfinance_ignored_series" ADD CONSTRAINT "openfinance_ignored_series_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "openfinance_ignored_series" ADD CONSTRAINT "openfinance_ignored_series_cartao_id_cartoes_id_fk" FOREIGN KEY ("cartao_id") REFERENCES "public"."cartoes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "openfinance_ignored_series_key" ON "openfinance_ignored_series" USING btree ("user_id","cartao_id","descricao",coalesce("qtde_parcela", -1),coalesce("amount_key", -1));
