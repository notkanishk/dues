import { sql } from "drizzle-orm";
import { bigint, boolean, char, check, date, integer, jsonb, pgSequence, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Keys and References (ADR 0005). The key is a UUIDv7 from Postgres's own uuidv7(), so every
// writer (app, psql, imports) gets the same time-ordered key without app code.
// The Reference is a type letter plus one global sequence per type, unpadded. Only the database
// issues it: a BEFORE INSERT trigger (in the migration) takes the next value and refuses a supplied
// one, a CHECK keeps the format, and a BEFORE UPDATE trigger refuses any change once issued.
// The column has no default; the app sends DEFAULT (null) and the trigger fills it.
const key = () => uuid("id").primaryKey().default(sql`uuidv7()`);
const reference = () =>
  text("reference")
    .notNull()
    .unique()
    .$defaultFn(() => sql`default`);
const referenceFormat = (letter: string) => sql.raw(`reference ~ '^${letter}-[1-9][0-9]*$'`);

// Money is integer paise plus a currency code (platform-foundations). bigint in the database;
// read as a JS number, exact up to 2^53 paise. Nullable on Expenses and Bills: a payment whose
// amount can't be read is still recorded, amount blank (document-intake, reminders).
const amountPaise = () => bigint("amount_paise", { mode: "number" });
const currency = () => char("currency", { length: 3 }).notNull().default("INR");
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const expenseReferenceSeq = pgSequence("expense_reference_seq");

// Facts only; status, Open amount and "why it's open" are derived on read (design D3).
// Fund, Purpose, Payment method and Orderer links arrive with those entities.
export const expenses = pgTable(
  "expenses",
  {
    id: key(),
    reference: reference(),
    claimantId: uuid("claimant_id").notNull(), // FK once the Claimants table exists (task 2.7)
    paidOn: date("paid_on"),
    amountPaise: amountPaise(),
    currency: currency(),
    kind: text("kind"),
    payee: text("payee"),
    vendor: text("vendor"),
    payback: boolean("payback").notNull().default(false),
    orderRef: text("order_ref"),
    whatFor: text("what_for"),
    upiRef: text("upi_ref"),
    source: text("source"),
    notes: text("notes"),
    draft: boolean("draft").notNull().default(false),
    closedReason: text("closed_reason"),
    createdAt: createdAt(),
  },
  (t) => [
    check("expenses_reference_format", referenceFormat("E")),
    check("expenses_kind", sql`${t.kind} in ('online', 'shop', 'service')`),
    check("expenses_source", sql`${t.source} in ('manual', 'document', 'amazon', 'back-fill')`),
    check("expenses_closed_reason", sql`${t.closedReason} in ('personal', 'duplicate', 'written_off')`),
  ],
);

export const billReferenceSeq = pgSequence("bill_reference_seq");

// Status (expected, ready, claimed, reimbursed, cancelled) is derived from these facts (design D3).
// Claim membership, review and file name arrive with Claims and Bill review.
export const bills = pgTable(
  "bills",
  {
    id: key(),
    reference: reference(),
    expenseId: uuid("expense_id").notNull().references(() => expenses.id),
    kind: text("kind").notNull(),
    billNo: text("bill_no"), // as the vendor printed it; never the Reference
    billDate: date("bill_date"),
    amountPaise: amountPaise(),
    currency: currency(),
    description: text("description"),
    fulfilledOn: date("fulfilled_on"),
    paperlessId: integer("paperless_id"),
    remarks: text("remarks"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    check("bills_reference_format", referenceFormat("B")),
    check("bills_kind", sql`${t.kind} in ('invoice', 'informal', 'payment_proof', 'no_bill')`),
  ],
);

export const refundReferenceSeq = pgSequence("refund_reference_seq");

// expected until refunded_on is set, then received.
export const refunds = pgTable(
  "refunds",
  {
    id: key(),
    reference: reference(),
    expenseId: uuid("expense_id").notNull().references(() => expenses.id),
    amountPaise: amountPaise().notNull(),
    currency: currency(),
    reason: text("reason").notNull(),
    refundedOn: date("refunded_on"),
    createdAt: createdAt(),
  },
  (t) => [
    check("refunds_reference_format", referenceFormat("R")),
    check("refunds_reason", sql`${t.reason} in ('cancelled', 'returned', 'partial')`),
  ],
);

export const owedToUniversityReferenceSeq = pgSequence("owed_to_university_reference_seq");

// open until repaid_on is set, then repaid. The Claim link arrives with the Claims table.
export const owedToUniversity = pgTable(
  "owed_to_university",
  {
    id: key(),
    reference: reference(),
    claimantId: uuid("claimant_id").notNull(),
    billId: uuid("bill_id").notNull().references(() => bills.id),
    amountPaise: amountPaise().notNull(),
    currency: currency(),
    repaidOn: date("repaid_on"),
    createdAt: createdAt(),
  },
  () => [check("owed_to_university_reference_format", referenceFormat("O"))],
);

// Append-only (design D2): one row per event Books decides, written before the state rows in the
// same transaction. who = actor, what = command and event, when = at, plus from-state and to-state.
// Refusing UPDATE and DELETE is task 2.9's (the Books shell and its database role).
export const auditLog = pgTable("audit_log", {
  id: key(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  actorId: uuid("actor_id").notNull(),
  command: text("command").notNull(),
  event: text("event").notNull(),
  entity: text("entity").notNull(),
  entityId: uuid("entity_id").notNull(),
  fromState: text("from_state"),
  toState: text("to_state"),
  payload: jsonb("payload"),
  idempotencyKey: text("idempotency_key"),
});
