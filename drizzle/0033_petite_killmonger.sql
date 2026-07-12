CREATE TABLE "assinaturas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"valor" numeric(12, 2) NOT NULL,
	"forma_pagamento" text NOT NULL,
	"dia_cobranca" integer NOT NULL,
	"data_inicio" date NOT NULL,
	"data_fim" date,
	"status" text DEFAULT 'ativa' NOT NULL,
	"ultimo_periodo_gerado" text,
	"icone" text,
	"anotacao" text,
	"conta_id" uuid,
	"cartao_id" uuid,
	"categoria_id" uuid,
	"pagador_id" uuid,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pre_lancamentos" ADD COLUMN "assinatura_id" uuid;--> statement-breakpoint
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_cartao_id_cartoes_id_fk" FOREIGN KEY ("cartao_id") REFERENCES "public"."cartoes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_pagador_id_pagadores_id_fk" FOREIGN KEY ("pagador_id") REFERENCES "public"."pagadores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assinaturas_user_id_status_idx" ON "assinaturas" USING btree ("user_id","status");--> statement-breakpoint
ALTER TABLE "pre_lancamentos" ADD CONSTRAINT "pre_lancamentos_assinatura_id_assinaturas_id_fk" FOREIGN KEY ("assinatura_id") REFERENCES "public"."assinaturas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pre_lancamentos_assinatura_id_idx" ON "pre_lancamentos" USING btree ("assinatura_id");