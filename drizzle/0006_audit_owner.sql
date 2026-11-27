-- Who owns what an audit entry changed (identity-access, "Admin change audited"). Audit entries are never edited, by a
-- migration either, so there is no backfill: on a log with entries Postgres refuses this and nothing is touched.
ALTER TABLE "audit_log" ADD COLUMN "owner_id" uuid NOT NULL;
--> statement-breakpoint
-- TRUNCATE bypasses row triggers; refuse it too, so the log can't be emptied wholesale (platform-foundations).
CREATE TRIGGER "audit_log_no_truncate" BEFORE TRUNCATE ON "audit_log"
	FOR EACH STATEMENT EXECUTE FUNCTION "public"."audit_log_is_append_only"();
