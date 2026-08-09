ALTER TABLE "openfinance_ignored_series" ADD COLUMN "purchase_anchor" text;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD COLUMN "of_purchase_anchor" text;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD COLUMN "projetado" boolean DEFAULT false;--> statement-breakpoint
CREATE UNIQUE INDEX "openfinance_ignored_series_anchor_key" ON "openfinance_ignored_series" USING btree ("user_id","cartao_id","purchase_anchor") WHERE purchase_anchor IS NOT NULL;--> statement-breakpoint
CREATE INDEX "lancamentos_cartao_id_purchase_anchor_idx" ON "lancamentos" USING btree ("cartao_id","of_purchase_anchor");