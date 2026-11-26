ALTER TABLE "bills" ADD COLUMN "closed_as" text;--> statement-breakpoint
ALTER TABLE "bills" ADD COLUMN "from_bill_id" uuid;--> statement-breakpoint
ALTER TABLE "write_offs" ADD COLUMN "bill_id" uuid;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_from_bill_id_bills_id_fk" FOREIGN KEY ("from_bill_id") REFERENCES "public"."bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_id_expense_id_unique" UNIQUE("id","expense_id");--> statement-breakpoint
ALTER TABLE "write_offs" ADD CONSTRAINT "write_offs_bill_expense_fk" FOREIGN KEY ("bill_id","expense_id") REFERENCES "public"."bills"("id","expense_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "write_offs" ADD CONSTRAINT "write_offs_bill_id_unique" UNIQUE("bill_id");--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_closed_as" CHECK ("bills"."closed_as" in ('refund_coming', 'claim_without_bill', 'not_claiming'));--> statement-breakpoint
ALTER TABLE "write_offs" ADD CONSTRAINT "write_offs_names_one" CHECK (num_nonnulls("write_offs"."refund_id", "write_offs"."bill_id") = 1);