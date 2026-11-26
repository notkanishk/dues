CREATE SEQUENCE "public"."expense_reference_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"reference" text DEFAULT 'E-' || nextval('expense_reference_seq') NOT NULL,
	"claimant_id" uuid NOT NULL,
	"paid_on" date,
	"amount_paise" bigint NOT NULL,
	"currency" char(3) DEFAULT 'INR' NOT NULL,
	"kind" text,
	"payee" text,
	"vendor" text,
	"payback" boolean DEFAULT false NOT NULL,
	"order_ref" text,
	"what_for" text,
	"upi_ref" text,
	"source" text,
	"notes" text,
	"draft" boolean DEFAULT false NOT NULL,
	"closed_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_reference_unique" UNIQUE("reference"),
	CONSTRAINT "expenses_reference_format" CHECK (reference ~ '^E-[1-9][0-9]*$'),
	CONSTRAINT "expenses_kind" CHECK ("expenses"."kind" in ('online', 'shop', 'service')),
	CONSTRAINT "expenses_source" CHECK ("expenses"."source" in ('manual', 'document', 'amazon', 'back-fill')),
	CONSTRAINT "expenses_closed_reason" CHECK ("expenses"."closed_reason" in ('personal', 'duplicate', 'written_off'))
);
--> statement-breakpoint
-- Hand-written (drizzle-kit does not model triggers): a Reference never changes once issued (ADR 0005).
CREATE FUNCTION "public"."reference_is_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'Reference % cannot change', OLD.reference USING ERRCODE = 'check_violation';
END $$;--> statement-breakpoint
CREATE TRIGGER "expenses_reference_immutable" BEFORE UPDATE OF "reference" ON "expenses"
	FOR EACH ROW WHEN (NEW.reference IS DISTINCT FROM OLD.reference) EXECUTE FUNCTION "public"."reference_is_immutable"();
