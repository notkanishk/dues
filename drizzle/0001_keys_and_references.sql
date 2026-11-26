CREATE SEQUENCE "public"."bill_reference_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."expense_reference_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."owed_to_university_reference_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."refund_reference_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" uuid NOT NULL,
	"command" text NOT NULL,
	"event" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"from_state" text,
	"to_state" text,
	"payload" jsonb,
	"idempotency_key" text
);
--> statement-breakpoint
CREATE TABLE "bills" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"reference" text DEFAULT 'B-' || nextval('bill_reference_seq') NOT NULL,
	"expense_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"bill_no" text,
	"bill_date" date,
	"amount_paise" bigint NOT NULL,
	"currency" char(3) DEFAULT 'INR' NOT NULL,
	"description" text,
	"fulfilled_on" date,
	"paperless_id" integer,
	"remarks" text,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bills_reference_unique" UNIQUE("reference"),
	CONSTRAINT "bills_reference_format" CHECK (reference ~ '^B-[1-9][0-9]*$'),
	CONSTRAINT "bills_kind" CHECK ("bills"."kind" in ('invoice', 'informal', 'payment_proof', 'no_bill'))
);
--> statement-breakpoint
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
CREATE TABLE "owed_to_university" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"reference" text DEFAULT 'O-' || nextval('owed_to_university_reference_seq') NOT NULL,
	"claimant_id" uuid NOT NULL,
	"bill_id" uuid NOT NULL,
	"amount_paise" bigint NOT NULL,
	"currency" char(3) DEFAULT 'INR' NOT NULL,
	"repaid_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "owed_to_university_reference_unique" UNIQUE("reference"),
	CONSTRAINT "owed_to_university_reference_format" CHECK (reference ~ '^O-[1-9][0-9]*$')
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"reference" text DEFAULT 'R-' || nextval('refund_reference_seq') NOT NULL,
	"expense_id" uuid NOT NULL,
	"amount_paise" bigint NOT NULL,
	"currency" char(3) DEFAULT 'INR' NOT NULL,
	"reason" text NOT NULL,
	"refunded_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_reference_unique" UNIQUE("reference"),
	CONSTRAINT "refunds_reference_format" CHECK (reference ~ '^R-[1-9][0-9]*$'),
	CONSTRAINT "refunds_reason" CHECK ("refunds"."reason" in ('cancelled', 'returned', 'partial'))
);
--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owed_to_university" ADD CONSTRAINT "owed_to_university_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Hand-written (drizzle-kit does not model triggers): a Reference never changes once issued (ADR 0005).
CREATE FUNCTION "public"."reference_is_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'Reference % cannot change', OLD.reference USING ERRCODE = 'check_violation';
END $$;--> statement-breakpoint
CREATE TRIGGER "expenses_reference_immutable" BEFORE UPDATE OF "reference" ON "expenses"
	FOR EACH ROW WHEN (NEW.reference IS DISTINCT FROM OLD.reference) EXECUTE FUNCTION "public"."reference_is_immutable"();--> statement-breakpoint
CREATE TRIGGER "bills_reference_immutable" BEFORE UPDATE OF "reference" ON "bills"
	FOR EACH ROW WHEN (NEW.reference IS DISTINCT FROM OLD.reference) EXECUTE FUNCTION "public"."reference_is_immutable"();--> statement-breakpoint
CREATE TRIGGER "refunds_reference_immutable" BEFORE UPDATE OF "reference" ON "refunds"
	FOR EACH ROW WHEN (NEW.reference IS DISTINCT FROM OLD.reference) EXECUTE FUNCTION "public"."reference_is_immutable"();--> statement-breakpoint
CREATE TRIGGER "owed_to_university_reference_immutable" BEFORE UPDATE OF "reference" ON "owed_to_university"
	FOR EACH ROW WHEN (NEW.reference IS DISTINCT FROM OLD.reference) EXECUTE FUNCTION "public"."reference_is_immutable"();
