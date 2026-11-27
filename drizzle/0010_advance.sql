-- Additive. A Claimant's own Advance on a Fund (identity-access "Advance is a personal amount on a Fund"): null is off,
-- so every existing fund_settings row stays off. No top-up table: an edit replaces the total; the audit log keeps it.
ALTER TABLE "fund_settings" ADD COLUMN "advance_paise" bigint;--> statement-breakpoint
ALTER TABLE "fund_settings" ADD COLUMN "advance_currency" char(3) DEFAULT 'INR' NOT NULL;--> statement-breakpoint
ALTER TABLE "fund_settings" ADD CONSTRAINT "fund_settings_advance_paise" CHECK ("fund_settings"."advance_paise" >= 0);