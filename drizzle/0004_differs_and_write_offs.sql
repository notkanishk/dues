CREATE TABLE "write_offs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"expense_id" uuid NOT NULL,
	"refund_id" uuid,
	"amount_paise" bigint NOT NULL,
	"currency" char(3) DEFAULT 'INR' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "write_offs_refund_id_unique" UNIQUE("refund_id"),
	CONSTRAINT "write_offs_amount" CHECK ("write_offs"."amount_paise" > 0)
);
--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN "differs_from_document" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "write_offs" ADD CONSTRAINT "write_offs_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "write_offs" ADD CONSTRAINT "write_offs_refund_id_refunds_id_fk" FOREIGN KEY ("refund_id") REFERENCES "public"."refunds"("id") ON DELETE no action ON UPDATE no action;