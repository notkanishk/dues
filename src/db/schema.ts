import { sql } from "drizzle-orm";
import { bigint, boolean, char, check, date, foreignKey, index, integer, jsonb, pgSequence, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";

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
    // Null until a document says what the Bill is: an online Order's expected Bill and a shop or
    // service Bill wait for their document (W2, W3); the spec names no kind for them.
    kind: text("kind"),
    billNo: text("bill_no"), // as the vendor printed it; never the Reference
    billDate: date("bill_date"),
    amountPaise: amountPaise(),
    currency: currency(),
    description: text("description"),
    fulfilledOn: date("fulfilled_on"),
    paperlessId: integer("paperless_id"),
    // "differs from the document": edited after its document was attached, until the Claimant confirms it (expense-tracking).
    differsFromDocument: boolean("differs_from_document").notNull().default(false),
    remarks: text("remarks"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    // Why it was cancelled: returned is for good (expense-tracking, Return before submission); cancelled may be undone (2.13d).
    cancelReason: text("cancel_reason"),
    createdAt: createdAt(),
  },
  (t) => [
    check("bills_reference_format", referenceFormat("B")),
    check("bills_kind", sql`${t.kind} in ('invoice', 'informal', 'payment_proof', 'no_bill')`),
    check("bills_cancel_reason", sql`${t.cancelReason} in ('cancelled', 'returned')`),
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
    billId: uuid("bill_id").references(() => bills.id), // the Bill it came from; null for one no command made
    amountPaise: amountPaise().notNull(),
    currency: currency(),
    reason: text("reason").notNull(),
    refundedOn: date("refunded_on"),
    createdAt: createdAt(),
  },
  (t) => [
    check("refunds_reference_format", referenceFormat("R")),
    check("refunds_reason", sql`${t.reason} in ('cancelled', 'returned', 'partial')`),
    unique("refunds_id_expense_id_unique").on(t.id, t.expenseId), // target of write_offs' (refund_id, expense_id) key
  ],
);

// Every written-off amount, one row each; Σ amount_paise per Expense is the "Σ written off" of the Open amount (FUNCTIONAL §1).
// Today a row comes only from a Refund written off on closing (refund_id). The remainder "Not claiming" closes (task
// 2.13d) joins the same way: a row with a bill_id column it adds, and undo removes the row.
export const writeOffs = pgTable(
  "write_offs",
  {
    id: key(),
    expenseId: uuid("expense_id").notNull().references(() => expenses.id),
    refundId: uuid("refund_id").unique(), // a Refund is written off once, and only on its own Expense (the key below)
    amountPaise: amountPaise().notNull(),
    currency: currency(),
    createdAt: createdAt(),
  },
  (t) => [
    check("write_offs_amount", sql`${t.amountPaise} > 0`),
    foreignKey({ name: "write_offs_refund_expense_fk", columns: [t.refundId, t.expenseId], foreignColumns: [refunds.id, refunds.expenseId] }),
    index("write_offs_expense_id_idx").on(t.expenseId),
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
// Triggers in the migration refuse UPDATE and DELETE (platform-foundations: never edited or deleted).
// An idempotency key, when given, is used once (design D4).
export const auditLog = pgTable(
  "audit_log",
  {
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
  },
  (t) => [uniqueIndex("audit_log_idempotency_key").on(t.idempotencyKey).where(sql`${t.idempotencyKey} is not null`)],
);

// Idempotency keys (design D4): the first result of a keyed command, returned again on replay.
// The command is kept so the same key with a different command is refused (idempotency_conflict).
export const idempotencyKeys = pgTable("idempotency_keys", {
  key: text("key").primaryKey(),
  claimantId: uuid("claimant_id").notNull(),
  command: jsonb("command").notNull(),
  result: jsonb("result").notNull(),
  at: timestamp("at", { withTimezone: true }).notNull(),
});
