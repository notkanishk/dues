-- Additive: a new table; no existing row changes. Each Claimant's own Payment methods (identity-access), none seeded.
CREATE TABLE "payment_methods" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"claimant_id" uuid NOT NULL,
	"label" text NOT NULL,
	"hint_bank" text,
	"hint_card_last4" text,
	"hint_upi_handle" text,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_methods_card_last4" CHECK ("payment_methods"."hint_card_last4" ~ '^[0-9]{4}$')
);
--> statement-breakpoint
CREATE INDEX "payment_methods_claimant_id_idx" ON "payment_methods" USING btree ("claimant_id");