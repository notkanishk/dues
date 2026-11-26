CREATE TABLE "idempotency_keys" (
	"key" text PRIMARY KEY NOT NULL,
	"claimant_id" uuid NOT NULL,
	"command" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bills" ALTER COLUMN "kind" DROP NOT NULL;