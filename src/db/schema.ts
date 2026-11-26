import { sql } from "drizzle-orm";
import { bigint, boolean, char, check, date, pgSequence, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Keys and References (ADR 0005). The key is a UUIDv7 from Postgres's own uuidv7(), so every
// writer (app, psql, imports) gets the same time-ordered key without app code.
// The Reference is a type letter plus one global sequence per type, unpadded; a CHECK keeps
// the format and a trigger (in the migration) refuses any change once issued.
const key = () => uuid("id").primaryKey().default(sql`uuidv7()`);
const reference = (letter: string, seq: string) =>
  text("reference").notNull().unique().default(sql.raw(`'${letter}-' || nextval('${seq}')`));
const referenceFormat = (letter: string) => sql.raw(`reference ~ '^${letter}-[1-9][0-9]*$'`);

// Money is integer paise plus a currency code (platform-foundations). bigint in the database;
// read as a JS number, exact up to 2^53 paise.
const amountPaise = () => bigint("amount_paise", { mode: "number" }).notNull();
const currency = () => char("currency", { length: 3 }).notNull().default("INR");
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const expenseReferenceSeq = pgSequence("expense_reference_seq");

// Facts only; status, Open amount and "why it's open" are derived on read (design D3).
// Fund, Purpose, Payment method and Orderer links arrive with those entities.
export const expenses = pgTable(
  "expenses",
  {
    id: key(),
    reference: reference("E", "expense_reference_seq"),
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
