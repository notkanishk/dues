-- Additive. Every Expense is claimed from a Fund (expense-tracking "Expense ownership and fields"): an Expense already
-- logged takes Makerspace, the Fund every Claimant has and the prompt preselects; 0007 seeded it, so the key holds.
ALTER TABLE "expenses" ADD COLUMN "fund_id" uuid DEFAULT '00000000-0000-7000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "purpose_id" uuid;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_purpose_fk" FOREIGN KEY ("purpose_id","fund_id","claimant_id") REFERENCES "public"."purposes"("id","fund_id","claimant_id") ON DELETE no action ON UPDATE no action;