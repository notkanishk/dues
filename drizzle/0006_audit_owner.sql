-- Who owns what an audit entry changed (identity-access, "Admin change audited"). Audit entries are never edited, by a
-- migration either, so there is no backfill: on a log with entries Postgres refuses this and nothing is touched.
ALTER TABLE "audit_log" ADD COLUMN "owner_id" uuid NOT NULL;
