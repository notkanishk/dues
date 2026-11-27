CREATE TABLE "fund_settings" (
	"claimant_id" uuid NOT NULL,
	"fund_id" uuid NOT NULL,
	"position" integer,
	"hidden" boolean DEFAULT false NOT NULL,
	CONSTRAINT "fund_settings_claimant_id_fund_id_pk" PRIMARY KEY("claimant_id","fund_id")
);
--> statement-breakpoint
CREATE TABLE "fund_versions" (
	"fund_id" uuid NOT NULL,
	"claimant_id" uuid NOT NULL,
	"mail" jsonb,
	"form_template" text,
	"file_name_pattern" text,
	"what_for_hint" text,
	"based_on" integer NOT NULL,
	CONSTRAINT "fund_versions_fund_id_claimant_id_pk" PRIMARY KEY("fund_id","claimant_id")
);
--> statement-breakpoint
CREATE TABLE "funds" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"creator_id" uuid,
	"name" text NOT NULL,
	"mail" jsonb,
	"notes" text,
	"form_template" text,
	"file_name_pattern" text,
	"claim_name_pattern" text,
	"what_for_hint" text,
	"team" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"team_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "funds_creator_or_team" CHECK ("funds"."creator_id" is not null or "funds"."team")
);
--> statement-breakpoint
ALTER TABLE "fund_settings" ADD CONSTRAINT "fund_settings_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_versions" ADD CONSTRAINT "fund_versions_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Makerspace is a Fund like any other, first by default (claims, "Funds define how a Claim is made"). One team Fund for
-- every Claimant, seeded here because no first sign-in exists yet to make it. No creator: only an admin edits its team
-- version. Its patterns are FUNCTIONAL §2's defaults; its To, CC and form file are set in the app (real data stays out).
INSERT INTO "funds" ("id", "name", "file_name_pattern", "claim_name_pattern", "team")
	VALUES ('00000000-0000-7000-8000-000000000001', 'Makerspace', '{purpose} - {what} {kind}', '{Month}{n}', true) ON CONFLICT ("id") DO NOTHING;
