// Books' imperative shell (design §1, D2–D6): one transaction per command, around the pure core.
import { isDeepStrictEqual } from "node:util";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { auditLog, bills, expenses, idempotencyKeys, refunds } from "@/src/db/schema";
import { type Money, zero } from "@/src/money/money";
import {
  type Actor,
  apply,
  type BillKind,
  type BillState,
  type BillStatus,
  type Command,
  decide,
  deriveBill,
  deriveExpense,
  type Event,
  type ExpenseState,
  type ExpenseStatus,
  type Job,
  type RefundReason,
  type Rejected,
  type Slice,
} from "./core";

export type Tx = Parameters<Parameters<NodePgDatabase["transaction"]>[0]>[0];
export type Result = { readonly ok: true; readonly events: readonly Event[] } | Rejected;
export type Deps = {
  readonly db: NodePgDatabase;
  readonly now: () => Date;
  /** Writes a follow-up job in the command's transaction (the real queue, or a recording list in tests). */
  readonly enqueue: (tx: Tx, job: Job) => Promise<void>;
};

/** A Claimant's writes run one at a time (design D5). Held until the transaction ends. */
export const lockClaimant = (tx: Tx, claimantId: string) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`claimant:${claimantId}`}, 0))`);

const notFound: Rejected = { ok: false, reason: "not_found" };
const conflict: Rejected = { ok: false, reason: "idempotency_conflict" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const money = (paise: number | null, currency: string): Money | null => (paise === null ? null : { paise, currency: currency as "INR" });

/**
 * The one place Books loads rows. Scoped to the Actor's Claimant: another Claimant's Expense is
 * simply absent, so callers answer not_found and existence does not leak (design D6).
 */
async function loadExpenses(q: NodePgDatabase | Tx, actor: Actor, ids: readonly string[]) {
  const wanted = ids.filter((id) => UUID.test(id));
  if (wanted.length === 0) return [];
  const rows = await q
    .select()
    .from(expenses)
    .where(and(inArray(expenses.id, wanted), eq(expenses.claimantId, actor.claimantId)));
  if (rows.length === 0) return [];
  const found = rows.map((r) => r.id);
  const billRows = await q.select().from(bills).where(inArray(bills.expenseId, found)).orderBy(bills.id);
  const refundRows = await q.select().from(refunds).where(inArray(refunds.expenseId, found)).orderBy(refunds.id);
  return rows.map((row) => {
    // Each Bill carries its database-issued reference with its state, so reads never pair two arrays by position.
    const ownBills: (BillState & { reference: string })[] = billRows
      .filter((b) => b.expenseId === row.id)
      .map((b) => ({
        id: b.id,
        reference: b.reference,
        kind: b.kind as BillKind | null,
        amount: money(b.amountPaise, b.currency),
        fulfilledOn: b.fulfilledOn,
        paperlessId: b.paperlessId,
        cancelled: b.cancelledAt !== null,
        claim: null, // ponytail: no Claims table yet; filled from Claim membership when Claims land
      }));
    const state: ExpenseState = {
      id: row.id,
      draft: row.draft,
      closedReason: row.closedReason,
      amount: money(row.amountPaise, row.currency),
      bills: ownBills,
      refunds: refundRows
        .filter((r) => r.expenseId === row.id)
        .map((r) => ({ id: r.id, amount: money(r.amountPaise, r.currency)!, reason: r.reason as RefundReason, received: r.refundedOn !== null })),
      writtenOff: zero, // ponytail: nothing is written off until task 2.13d stores it
    };
    return { row, bills: ownBills, refunds: refundRows.filter((r) => r.expenseId === row.id), state };
  });
}

// How many new rows each command may create, and which Expense it touches.
async function loadSlice(tx: Tx, actor: Actor, command: Command): Promise<Slice> {
  const [count, expenseIds] = await (async (): Promise<[number, string[]]> => {
    switch (command.type) {
      case "LogExpense":
        return [2, []];
      case "SplitExpectedBill":
      case "ExpectRefund":
      case "CancelBill":
        return [1, await expenseOfBill(tx, command.billId)];
    }
  })();
  // Keys come from Postgres's uuidv7() (ADR 0005), fetched first so the audit rows can name them.
  const { rows } = await tx.execute<{ id: string }>(sql`select uuidv7() as id from generate_series(1, ${count})`);
  const loaded = await loadExpenses(tx, actor, expenseIds);
  return { newIds: rows.map((r) => r.id), expenses: Object.fromEntries(loaded.map((e) => [e.state.id, e.state])) };
}

// Unscoped on purpose: loadExpenses applies the Actor's scope next, so another Claimant's Bill loads nothing.
async function expenseOfBill(tx: Tx, billId: string) {
  if (!UUID.test(billId)) return [];
  return (await tx.select({ id: bills.expenseId }).from(bills).where(eq(bills.id, billId))).map((r) => r.id);
}

type Entity = "expense" | "bill" | "refund";
const entityOf = (event: Event): [Entity, string] =>
  event.type === "ExpenseLogged" ? ["expense", event.expenseId] : "refundId" in event ? ["refund", event.refundId] : ["bill", event.billId];

function stateOf(slice: Slice, entity: Entity, id: string): ExpenseStatus | BillStatus | "expected" | "received" | null {
  if (entity === "expense") {
    const expense = slice.expenses[id];
    return expense ? deriveExpense(expense).status : null;
  }
  if (entity === "refund") {
    const refund = Object.values(slice.expenses).flatMap((e) => e.refunds).find((r) => r.id === id);
    return refund ? (refund.received ? "received" : "expected") : null;
  }
  for (const expense of Object.values(slice.expenses)) {
    const bill = expense.bills.find((b) => b.id === id);
    if (bill) return deriveBill(bill);
  }
  return null;
}

async function write(tx: Tx, event: Event, at: Date) {
  switch (event.type) {
    case "ExpenseLogged":
      // No reference: the database issues it (ADR 0005).
      await tx.insert(expenses).values({
        id: event.expenseId,
        claimantId: event.claimantId,
        paidOn: event.paidOn,
        amountPaise: event.amount.paise,
        currency: event.amount.currency,
        kind: event.kind,
        payee: event.payee,
        vendor: event.vendor,
        payback: event.payback,
        orderRef: event.orderRef,
        whatFor: event.whatFor,
        upiRef: event.upiRef,
        notes: event.notes,
        source: event.source,
        createdAt: at,
      });
      return;
    case "BillAdded":
      await tx.insert(bills).values({
        id: event.billId,
        expenseId: event.expenseId,
        kind: event.kind,
        amountPaise: event.amount.paise,
        currency: event.amount.currency,
        fulfilledOn: event.fulfilledOn,
        createdAt: at,
      });
      return;
    case "ExpectedBillReduced":
      await tx.update(bills).set({ amountPaise: event.amount.paise }).where(eq(bills.id, event.billId));
      return;
    case "BillCancelled":
      await tx.update(bills).set({ cancelledAt: at }).where(eq(bills.id, event.billId));
      return;
    case "RefundExpected":
      await tx.insert(refunds).values({
        id: event.refundId,
        expenseId: event.expenseId,
        amountPaise: event.amount.paise,
        currency: event.amount.currency,
        reason: event.reason,
        createdAt: at,
      });
      return;
  }
}

// The audit insert meets a racing key first (audit_log_idempotency_key); idempotency_keys_pkey is kept as the backstop.
const KEY_CONSTRAINTS = ["audit_log_idempotency_key", "idempotency_keys_pkey"];
const isKeyRace = (e: unknown) => {
  const cause = (e as { cause?: { code?: string; constraint?: string } })?.cause;
  return cause?.code === "23505" && KEY_CONSTRAINTS.includes(cause.constraint ?? "");
};

export function createBooks({ db, now, enqueue }: Deps) {
  async function attempt(actor: Actor, command: Command, key: string | undefined): Promise<Result> {
    return db.transaction(async (tx) => {
      await lockClaimant(tx, actor.claimantId);

      if (key !== undefined) {
        const [seen] = await tx.select().from(idempotencyKeys).where(eq(idempotencyKeys.key, key));
        if (seen) {
          const same = seen.claimantId === actor.claimantId && isDeepStrictEqual(seen.command, JSON.parse(JSON.stringify(command)));
          return same ? (seen.result as Result) : conflict;
        }
      }

      const slice = await loadSlice(tx, actor, command);
      const at = now();
      const decision = decide(slice, command, actor, at);
      if (!decision.ok) return decision; // a rejected command changes nothing

      // Audit rows first (design D2): one per event, with the states before and after it.
      let state = slice;
      const entries = decision.events.map((event, i) => {
        const [entity, entityId] = entityOf(event);
        const fromState = stateOf(state, entity, entityId);
        state = apply(state, event);
        return {
          at,
          actorId: actor.claimantId,
          command: command.type,
          event: event.type,
          entity,
          entityId,
          fromState,
          toState: stateOf(state, entity, entityId),
          payload: event,
          // The audit log holds a key once (schema), so the command's first entry carries it.
          idempotencyKey: i === 0 ? (key ?? null) : null,
        };
      });
      await tx.insert(auditLog).values(entries);
      for (const event of decision.events) await write(tx, event, at);
      for (const job of decision.jobs) await enqueue(tx, job);

      const result: Result = { ok: true, events: decision.events };
      if (key !== undefined) await tx.insert(idempotencyKeys).values({ key, claimantId: actor.claimantId, command, result, at });
      return result;
    });
  }

  return {
    /** Every write. Typed rejections; throws only when the database fails, and then nothing is written. */
    async execute(actor: Actor, command: Command, opts: { idempotencyKey?: string } = {}): Promise<Result> {
      try {
        return await attempt(actor, command, opts.idempotencyKey);
      } catch (e) {
        // Two Claimants raced on one new key: the loser's transaction rolled back; rerun it to see the winner's row.
        if (isKeyRace(e)) return attempt(actor, command, opts.idempotencyKey);
        throw e;
      }
    },

    /** One Expense with its Bills; status, Open amount, why it is open and Bill status derived on read (design D3). */
    async expense(actor: Actor, id: string) {
      const [found] = await loadExpenses(db, actor, [id]);
      if (!found) return notFound;
      const { row, bills: billStates, refunds: refundRows, state } = found;
      const derived = deriveExpense(state);
      return {
        ok: true as const,
        expense: {
          id: row.id,
          reference: row.reference,
          status: derived.status,
          openAmount: derived.openAmount,
          reason: derived.reason,
          amount: state.amount,
          kind: row.kind,
          paidOn: row.paidOn,
          payee: row.payee,
          vendor: row.vendor,
          payback: row.payback,
          orderRef: row.orderRef,
          whatFor: row.whatFor,
          upiRef: row.upiRef,
          notes: row.notes,
          source: row.source,
          bills: billStates.map((b) => ({
            id: b.id,
            reference: b.reference,
            kind: b.kind,
            amount: b.amount,
            fulfilledOn: b.fulfilledOn,
            status: deriveBill(b),
          })),
          refunds: refundRows.map((r) => ({
            id: r.id,
            reference: r.reference,
            amount: money(r.amountPaise, r.currency)!,
            reason: r.reason as RefundReason,
            refundedOn: r.refundedOn,
            status: r.refundedOn === null ? ("expected" as const) : ("received" as const),
          })),
        },
      };
    },
  };
}
