CREATE TABLE "purposes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"claimant_id" uuid NOT NULL,
	"fund_id" uuid NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purposes_link_target" UNIQUE("id","fund_id","claimant_id")
);
--> statement-breakpoint
ALTER TABLE "purposes" ADD CONSTRAINT "purposes_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "purposes_claimant_id_idx" ON "purposes" USING btree ("claimant_id");