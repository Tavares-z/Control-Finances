ALTER TABLE "cartoes" ALTER COLUMN "limite" SET DEFAULT '0';--> statement-breakpoint
UPDATE "cartoes" SET "limite" = '0' WHERE "limite" IS NULL;--> statement-breakpoint
ALTER TABLE "cartoes" ALTER COLUMN "limite" SET NOT NULL;