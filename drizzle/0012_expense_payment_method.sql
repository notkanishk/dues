-- Additive. An Expense's Payment method (expense-tracking "Expense ownership and fields"): nullable, so every existing
-- Expense stays "not recorded". The key names the Expense's own Claimant, so another Claimant's method is refused.
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_link_target" UNIQUE("id","claimant_id");--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "payment_method_id" uuid;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_payment_method_fk" FOREIGN KEY ("payment_method_id","claimant_id") REFERENCES "public"."payment_methods"("id","claimant_id") ON DELETE no action ON UPDATE no action;
