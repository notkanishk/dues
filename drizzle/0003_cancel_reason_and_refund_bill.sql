ALTER TABLE "bills" ADD COLUMN "cancel_reason" text;--> statement-breakpoint
ALTER TABLE "refunds" ADD COLUMN "bill_id" uuid;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_cancel_reason" CHECK ("bills"."cancel_reason" in ('cancelled', 'returned'));