CREATE TABLE "mensagens_chat" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"valor_alvo" numeric(12, 2) NOT NULL,
	"prazo" date,
	"icone" text,
	"anotacao" text,
	"status" text DEFAULT 'ativa' NOT NULL,
	"conta_id" uuid,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "preferencias_usuario" ADD COLUMN "chat_model" text;--> statement-breakpoint
ALTER TABLE "preferencias_usuario" ADD COLUMN "chat_personality" text;--> statement-breakpoint
ALTER TABLE "mensagens_chat" ADD CONSTRAINT "mensagens_chat_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metas" ADD CONSTRAINT "metas_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metas" ADD CONSTRAINT "metas_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mensagens_chat_user_id_idx" ON "mensagens_chat" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mensagens_chat_user_id_created_at_idx" ON "mensagens_chat" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "metas_user_id_status_idx" ON "metas" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "metas_conta_id_idx" ON "metas" USING btree ("conta_id");