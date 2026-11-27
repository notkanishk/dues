import { sql } from "drizzle-orm";
import { type AnyPgColumn, bigint, boolean, char, check, date, foreignKey, index, integer, jsonb, pgSequence, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";

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
    // Every Expense is claimed from a Fund (expense-tracking "Expense ownership and fields"). No default: every write
    // names one (Books' default is the prompt's preselection); migration 0009 back-filled older Expenses with Makerspace.
    fundId: uuid("fund_id")
      .notNull()
      .references((): AnyPgColumn => funds.id),
    // Optional; a Purpose of the same Fund and the same Claimant (expenses_purpose_fk).
    purposeId: uuid("purpose_id"),
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
    foreignKey({
      name: "expenses_purpose_fk",
      columns: [t.purposeId, t.fundId, t.claimantId],
      foreignColumns: [purposes.id, purposes.fundId, purposes.claimantId],
    }),
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
    // "No more invoices" (W2.9): how an Order's expected Bill was closed out; set while closed out, cleared by undo.
    closedAs: text("closed_as"),
    // A leftover's No bill (Claim without a bill) names the expected Bill it came from, so undo finds it.
    fromBillId: uuid("from_bill_id").references((): AnyPgColumn => bills.id),
    createdAt: createdAt(),
  },
  (t) => [
    check("bills_reference_format", referenceFormat("B")),
    check("bills_kind", sql`${t.kind} in ('invoice', 'informal', 'payment_proof', 'no_bill')`),
    check("bills_cancel_reason", sql`${t.cancelReason} in ('cancelled', 'returned')`),
    check("bills_closed_as", sql`${t.closedAs} in ('refund_coming', 'claim_without_bill', 'not_claiming')`),
    unique("bills_id_expense_id_unique").on(t.id, t.expenseId), // target of write_offs' (bill_id, expense_id) key
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
// A row names either a Refund written off on closing (refund_id) or the expected Bill whose remainder "Not claiming"
// closed (bill_id, W2.9); undo of Not claiming removes that row.
export const writeOffs = pgTable(
  "write_offs",
  {
    id: key(),
    expenseId: uuid("expense_id").notNull().references(() => expenses.id),
    refundId: uuid("refund_id").unique(), // a Refund is written off once, and only on its own Expense (the key below)
    billId: uuid("bill_id").unique(), // an expected Bill's remainder likewise, once and on its own Expense
    amountPaise: amountPaise().notNull(),
    currency: currency(),
    createdAt: createdAt(),
  },
  (t) => [
    check("write_offs_amount", sql`${t.amountPaise} > 0`),
    check("write_offs_names_one", sql`num_nonnulls(${t.refundId}, ${t.billId}) = 1`),
    foreignKey({ name: "write_offs_refund_expense_fk", columns: [t.refundId, t.expenseId], foreignColumns: [refunds.id, refunds.expenseId] }),
    foreignKey({ name: "write_offs_bill_expense_fk", columns: [t.billId, t.expenseId], foreignColumns: [bills.id, bills.expenseId] }),
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
// same transaction. who = actor, whose = owner, what = command and event, when = at, plus from-state and to-state.
// Triggers in the migration refuse UPDATE and DELETE (platform-foundations: never edited or deleted).
// An idempotency key, when given, is used once (design D4).
export const auditLog = pgTable(
  "audit_log",
  {
    id: key(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    actorId: uuid("actor_id").notNull(),
    // The Claimant whose books the entry changes: the actor, unless an admin acted on another Claimant's data (identity-access).
    ownerId: uuid("owner_id").notNull(),
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

// Funds (claims "Funds define how a Claim is made", identity-access "Fund sharing and edit rights"). A Fund's row is its
// team version; a private Fund is one whose team flag is off. No creator only for Makerspace, which the migration seeds.
// mail is {to: string[], cc: string[], subject, body}. Notes stay here: no template query selects them.
export const funds = pgTable(
  "funds",
  {
    id: key(),
    creatorId: uuid("creator_id"),
    name: text("name").notNull(),
    mail: jsonb("mail"),
    notes: text("notes"),
    formTemplate: text("form_template"),
    fileNamePattern: text("file_name_pattern"),
    claimNamePattern: text("claim_name_pattern"),
    whatForHint: text("what_for_hint"),
    team: boolean("team").notNull().default(false),
    archived: boolean("archived").notNull().default(false),
    // Goes up when a field "my version" can override changes, so a personal version can tell it is behind.
    teamVersion: integer("team_version").notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [check("funds_creator_or_team", sql`${t.creatorId} is not null or ${t.team}`)],
);

// "My version": one Claimant's override of a team Fund's mail, form, file-name pattern or hint. Null = the team's.
export const fundVersions = pgTable(
  "fund_versions",
  {
    fundId: uuid("fund_id").notNull().references(() => funds.id),
    claimantId: uuid("claimant_id").notNull(),
    mail: jsonb("mail"),
    formTemplate: text("form_template"),
    fileNamePattern: text("file_name_pattern"),
    whatForHint: text("what_for_hint"),
    // The team version this one was last set against; behind it means "Team version updated. Compare".
    basedOn: integer("based_on").notNull(),
  },
  (t) => [primaryKey({ columns: [t.fundId, t.claimantId] })],
);

// Each Claimant's own order and hiding of Funds (expense-tracking, "Funds on the upload prompt"), and their own Advance
// on it (identity-access "Advance is a personal amount on a Fund"): one total, null while off. Never a top-up row: an
// edit replaces the total and the audit log keeps the history. Advance left is derived on read, never stored (D3).
export const fundSettings = pgTable(
  "fund_settings",
  {
    claimantId: uuid("claimant_id").notNull(),
    fundId: uuid("fund_id").notNull().references(() => funds.id),
    position: integer("position"),
    hidden: boolean("hidden").notNull().default(false),
    advancePaise: bigint("advance_paise", { mode: "number" }),
  },
  (t) => [primaryKey({ columns: [t.claimantId, t.fundId] }), check("fund_settings_advance_paise", sql`${t.advancePaise} >= 0`)],
);

// Purposes (expense-tracking "Purpose"): an optional group inside a Fund, one Claimant's own. Ending one ("End trip")
// clears active; its Expenses keep it. (id, fund_id, claimant_id) is the target of the Expense's link, so the database
// itself refuses a Purpose of another Fund or another Claimant on an Expense.
export const purposes = pgTable(
  "purposes",
  {
    id: key(),
    claimantId: uuid("claimant_id").notNull(),
    fundId: uuid("fund_id").notNull().references(() => funds.id),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [unique("purposes_link_target").on(t.id, t.fundId, t.claimantId), index("purposes_claimant_id_idx").on(t.claimantId)],
);

// Payment methods (identity-access "Claimant-defined Payment methods"): one Claimant's own labels, none hard-coded, each
// with optional match hints for reading a payment confirmation. Archived: no longer offered; Expenses that used it keep it.
export const paymentMethods = pgTable(
  "payment_methods",
  {
    id: key(),
    claimantId: uuid("claimant_id").notNull(),
    label: text("label").notNull(),
    hintBank: text("hint_bank"),
    hintCardLast4: text("hint_card_last4"),
    hintUpiHandle: text("hint_upi_handle"),
    archived: boolean("archived").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    check("payment_methods_card_last4", sql`${t.hintCardLast4} ~ '^[0-9]{4}$'`),
    index("payment_methods_claimant_id_idx").on(t.claimantId),
  ],
);
