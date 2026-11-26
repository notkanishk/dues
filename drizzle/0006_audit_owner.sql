-- Who owns what an audit entry changed (identity-access, "Admin change audited"): the actor, unless an admin acted on
-- another Claimant's data. Additive: added nullable, backfilled, then made required.
ALTER TABLE "audit_log" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
-- Backfill from the entity's Expense: every event names it (BillMoved by its destination). An entry naming none (rows
-- written by hand) takes its actor, which was always the owner before this migration: every load was scoped to the actor.
-- The append-only trigger is lifted for this one backfill only, inside the migration's transaction.
ALTER TABLE "audit_log" DISABLE TRIGGER "audit_log_append_only";--> statement-breakpoint
UPDATE "audit_log" AS a SET "owner_id" = coalesce(
	(SELECT e."claimant_id" FROM "expenses" AS e WHERE e."id"::text = coalesce(a."payload"->>'expenseId', a."payload"->>'toExpenseId')),
	a."actor_id"
);--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE TRIGGER "audit_log_append_only";--> statement-breakpoint
ALTER TABLE "audit_log" ALTER COLUMN "owner_id" SET NOT NULL;
