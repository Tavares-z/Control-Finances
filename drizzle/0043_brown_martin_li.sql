CREATE TABLE "openfinance_card_names" (
	"user_id" text NOT NULL,
	"pluggy_account_id" text NOT NULL,
	"nome" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "openfinance_card_names_user_id_pluggy_account_id_pk" PRIMARY KEY("user_id","pluggy_account_id")
);
--> statement-breakpoint
ALTER TABLE "openfinance_card_names" ADD CONSTRAINT "openfinance_card_names_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;