// Books' imperative shell (design §1, D2–D6): one transaction per command, around the pure core.
import { isDeepStrictEqual } from "node:util";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { auditLog, bills, expenses, funds as fundsTable, idempotencyKeys, purposes, refunds, writeOffs } from "@/src/db/schema";
import { type Money, sum } from "@/src/money/money";
import {
  type Actor,
  apply,
  type BillKind,
  type BillState,
  type BillStatus,
  type CloseChoice,
  type CloseReason,
  type Command,
  decide,
  orderPage,
  deriveBill,
  deriveExpense,
  deriveRefund,
  type Event,
  isAdmin,
  type ExpenseState,
  type ExpenseStatus,
  type Job,
  type Links,
  type LogExpense,
  type CorrectExpense,
  MAKERSPACE,
  own,
  type RefundReason,
  type RefundStatus,
  type Rejected,
  type Slice,
} from "./core";
import { decideFund, fundEntries, type FundCommand, type FundEvent, fundOwners, isFundCommand, listFunds, loadFundSlice, templatesOf, UUID, visible, writeFund } from "./funds";
import { decidePurpose, isPurposeCommand, listPurposes, promptOf, loadPurposeSlice, type PurposeCommand, type PurposeEvent, purposeEntries, purposeOwners, writePurpose } from "./purposes";

export type Tx = Parameters<Parameters<NodePgDatabase["transaction"]>[0]>[0];
export type Result = { readonly ok: true; readonly events: readonly (Event | FundEvent | PurposeEvent)[] } | Rejected;
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
const forbidden: Rejected = { ok: false, reason: "forbidden" };
/**
 * The role gate (identity-access): only `claimant` opens Books; `admin` never opens it alone, it only widens the scope (D6).
 * Anything else is forbidden from every command and query before a row is read, so not even existence leaks.
 */
const mayEnter = (actor: Actor) => actor.roles.includes("claimant");
/**
 * The ownership filter: an admin signed in by session passes it (D6); anyone else sees only their own Expenses. An MCP
 * token carries its issuing Claimant's scope and nothing more, and Intake acts as the document owner's Claimant.
 */
const scope = (actor: Actor) => (isAdmin(actor) ? undefined : eq(expenses.claimantId, actor.claimantId));
const conflict: Rejected = { ok: false, reason: "idempotency_conflict" };
const money = (paise: number | null, currency: string): Money | null => (paise === null ? null : { paise, currency: currency as "INR" });

/**
 * The one place Books loads rows. Scoped to the Actor's Claimant: another Claimant's Expense is
 * simply absent, so callers answer not_found and existence does not leak (design D6). An admin's scope is everyone's.
 */
async function loadExpenses(q: NodePgDatabase | Tx, actor: Actor, ids: readonly string[]) {
  const wanted = ids.filter((id) => UUID.test(id));
  if (wanted.length === 0) return [];
  const rows = await q
    .select()
    .from(expenses)
    .where(and(inArray(expenses.id, wanted), scope(actor)));
  if (rows.length === 0) return [];
  const found = rows.map((r) => r.id);
  const billRows = await q.select().from(bills).where(inArray(bills.expenseId, found)).orderBy(bills.id);
  const refundRows = await q.select().from(refunds).where(inArray(refunds.expenseId, found)).orderBy(refunds.id);
  const writeOffRows = await q.select().from(writeOffs).where(inArray(writeOffs.expenseId, found));
  return rows.map((row) => {
    // Each Bill carries its database-issued reference with its state, so reads never pair two arrays by position.
    const ownBills: (BillState & { reference: string; cancelReason: string | null; description: string | null })[] = billRows
      .filter((b) => b.expenseId === row.id)
      .map((b) => ({
        id: b.id,
        reference: b.reference,
        cancelReason: b.cancelReason,
        description: b.description,
        kind: b.kind as BillKind | null,
        amount: money(b.amountPaise, b.currency),
        billNo: b.billNo,
        billDate: b.billDate,
        fulfilledOn: b.fulfilledOn,
        paperlessId: b.paperlessId,
        differs: b.differsFromDocument,
        remarks: b.remarks,
        cancelled: b.cancelledAt !== null,
        closedAs: b.closedAs as CloseChoice | null, // the bills_closed_as check keeps it one of these
        fromBillId: b.fromBillId,
        claim: null, // ponytail: no Claims table yet; filled from Claim membership when Claims land
      }));
    const ownRefunds = refundRows
      .filter((r) => r.expenseId === row.id)
      .map((r) => ({
        id: r.id,
        reference: r.reference,
        billId: r.billId,
        refundedOn: r.refundedOn,
        amount: money(r.amountPaise, r.currency)!,
        reason: r.reason as RefundReason,
        received: r.refundedOn !== null,
        writtenOff: writeOffRows.some((w) => w.refundId === r.id),
      }));
    const ownWriteOffs = writeOffRows.filter((w) => w.expenseId === row.id).map((w) => money(w.amountPaise, w.currency)!);
    const state: ExpenseState = {
      id: row.id,
      claimantId: row.claimantId,
      draft: row.draft,
      closedReason: row.closedReason as CloseReason | null, // the expenses_closed_reason check keeps it one of these
      kind: row.kind as ExpenseState["kind"], // the expenses_kind check
      amount: money(row.amountPaise, row.currency),
      payee: row.payee,
      paidOn: row.paidOn,
      whatFor: row.whatFor,
      fundId: row.fundId,
      purposeId: row.purposeId,
      bills: ownBills,
      refunds: ownRefunds,
      writtenOff: sum(ownWriteOffs), // Σ written off (FUNCTIONAL §1), every row summed
    };
    return { row, bills: ownBills, refunds: ownRefunds, state };
  });
}

// How many new rows each command may create, and which Expenses it touches.
async function touches(tx: Tx, command: Command): Promise<[number, string[]]> {
  switch (command.type) {
    case "LogExpense":
      return [2, []];
    case "MoveBill":
      // Both Expenses load under their owners' locks (design D5): a Claimant owns both or it is not_found. An admin's may be
      // two Claimants; the core refuses that move, but only after loading both, so both are locked.
      return [0, [...(await expenseOf(tx, bills, command.billId)), command.toExpenseId]];
    case "DetachBill":
    case "SplitExpectedBill":
    case "CloseOrder":
    case "ExpectRefund":
    case "CancelBill":
    case "ReturnBill":
      return [1, await expenseOf(tx, bills, command.billId)];
    case "CorrectBill":
    case "ConfirmDiffers":
    case "UndoCloseOrder":
      return [0, await expenseOf(tx, bills, command.billId)];
    case "MarkRefundReceived":
      return [0, await expenseOf(tx, refunds, command.refundId)];
    case "CorrectExpense":
    case "CloseExpense":
      return [0, [command.expenseId]];
  }
}

/**
 * Whose lock a command takes (design D5): the owners of the Expenses it touches, in ID order, so two Claimants are
 * always locked the same way round. The Actor's own when it touches none of theirs: a new Expense is the Actor's, and
 * anything else is not_found. Read before the lock, so `attempt` checks it again under the lock.
 */
async function ownersOf(tx: Tx, actor: Actor, command: Command): Promise<string[]> {
  const wanted = (await touches(tx, command))[1].filter((id) => UUID.test(id));
  const rows = wanted.length
    ? await tx.select({ id: expenses.id, owner: expenses.claimantId }).from(expenses).where(and(inArray(expenses.id, wanted), scope(actor)))
    : [];
  // Gathered in the command's order, so the sort alone fixes the lock order, never the database's row order.
  const owner = new Map(rows.map((r) => [r.id, r.owner]));
  const owners = [...new Set(wanted.flatMap((id) => owner.get(id) ?? []))];
  return owners.length ? owners.sort() : [actor.claimantId];
}

async function loadSlice(tx: Tx, actor: Actor, command: Command): Promise<Slice> {
  const [count, expenseIds] = await touches(tx, command);
  // Keys come from Postgres's uuidv7() (ADR 0005), fetched first so the audit rows can name them.
  const { rows } = await tx.execute<{ id: string }>(sql`select uuidv7() as id from generate_series(1, ${count})`);
  const loaded = await loadExpenses(tx, actor, expenseIds);
  const expenses = Object.fromEntries(loaded.map((e) => [e.state.id, e.state]));
  // What the Expense's Claimant may link it to: a new one is the Actor's; a corrected one stays its owner's (an admin's included).
  const owner = command.type === "LogExpense" ? actor.claimantId : command.type === "CorrectExpense" ? own(expenses, command.expenseId)?.claimantId : undefined;
  // A new payment that names neither goes where the Actor's prompt preselects.
  const fallback = command.type === "LogExpense" ? await promptOf(tx, actor) : undefined;
  const links = owner
    ? await linksFor(tx, owner, command as LogExpense | CorrectExpense, fallback ? { fundId: fallback.preselectedFundId, purposeId: fallback.preselectedPurposeId } : undefined)
    : undefined;
  return { newIds: rows.map((r) => r.id), expenses, ...(links && { links }) };
}

/** The Fund and Purpose the command names, if the Expense's Claimant has them (else absent: not_found), and the default. */
async function linksFor(tx: Tx, claimantId: string, command: LogExpense | CorrectExpense, fallback: Links["fallback"] = { fundId: MAKERSPACE, purposeId: null }): Promise<Links> {
  const [fund] = typeof command.fundId === "string" && UUID.test(command.fundId)
    ? await tx.select({ id: fundsTable.id }).from(fundsTable).where(and(eq(fundsTable.id, command.fundId), visible({ claimantId })))
    : [];
  const [purpose] = typeof command.purposeId === "string" && UUID.test(command.purposeId)
    ? await tx.select().from(purposes).where(and(eq(purposes.id, command.purposeId), eq(purposes.claimantId, claimantId)))
    : [];
  return {
    funds: fund ? { [fund.id]: true } : {},
    purposes: purpose ? { [purpose.id]: { fundId: purpose.fundId } } : {},
    fallback,
  };
}

// Unscoped on purpose: loadExpenses applies the Actor's scope next, so another Claimant's Bill or Refund loads nothing.
async function expenseOf(tx: Tx, table: typeof bills | typeof refunds, id: string) {
  if (!UUID.test(id)) return [];
  return (await tx.select({ id: table.expenseId }).from(table).where(eq(table.id, id))).map((r) => r.id);
}

/** An event would change a Claimant whose lock is not held (an admin moved the Bill after the owners were read): rerun. */
class OwnersMoved extends Error {}

/** The Expense an event changes; its owner is the audit entry's owner. A moved Bill belongs where it lands. */
const expenseOfEvent = (event: Event) => ("expenseId" in event ? event.expenseId : event.toExpenseId);

type Entity = "expense" | "bill" | "refund";
function entityOf(event: Event): [Entity, string] {
  switch (event.type) {
    case "ExpenseLogged":
    case "ExpenseCorrected":
    case "ExpenseClosed":
      return ["expense", event.expenseId];
    case "BillAdded":
    case "BillMoved":
    case "ExpectedBillReduced":
    case "ExpectedBillIncreased":
    case "BillRemovedFromClaim":
    case "BillCancelled":
    case "BillCorrected":
    case "DiffersConfirmed":
    case "ExpectedBillClosedOut":
    case "ExpectedBillReopened":
    case "RemainderWrittenOff":
    case "RemainderWriteOffWithdrawn":
    case "BillWithdrawn":
      return ["bill", event.billId];
    case "RefundExpected":
    case "RefundReceived":
    case "RefundWrittenOff":
    case "RefundWithdrawn":
      return ["refund", event.refundId];
  }
}

function stateOf(slice: Slice, entity: Entity, id: string): ExpenseStatus | BillStatus | RefundStatus | null {
  if (entity === "expense") {
    const expense = slice.expenses[id];
    return expense ? deriveExpense(expense).status : null;
  }
  if (entity === "refund") {
    const refund = Object.values(slice.expenses).flatMap((e) => e.refunds).find((r) => r.id === id);
    return refund ? deriveRefund(refund) : null;
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
        fundId: event.fundId,
        purposeId: event.purposeId,
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
        description: event.description,
        remarks: event.remarks,
        fromBillId: event.fromBillId,
        createdAt: at,
      });
      return;
    case "BillMoved":
      await tx.update(bills).set({ expenseId: event.toExpenseId }).where(eq(bills.id, event.billId));
      return;
    case "ExpectedBillReduced":
    case "ExpectedBillIncreased":
      await tx.update(bills).set({ amountPaise: event.amount.paise }).where(eq(bills.id, event.billId));
      return;
    case "BillRemovedFromClaim":
      return; // ponytail: the loader never loads a Claim yet, so this cannot happen; deletes the Claim line once Claims land
    case "BillCancelled":
      await tx.update(bills).set({ cancelledAt: at, cancelReason: event.reason }).where(eq(bills.id, event.billId));
      return;
    case "RefundExpected":
      await tx.insert(refunds).values({
        id: event.refundId,
        expenseId: event.expenseId,
        billId: event.billId,
        amountPaise: event.amount.paise,
        currency: event.amount.currency,
        reason: event.reason,
        createdAt: at,
      });
      return;
    case "RefundReceived":
      await tx.update(refunds).set({ refundedOn: event.refundedOn }).where(eq(refunds.id, event.refundId));
      return;
    case "BillCorrected": {
      const { amount, billNo, billDate, remarks } = event.changes;
      await tx
        .update(bills)
        .set({
          ...(amount && { amountPaise: amount.to?.paise ?? null }),
          ...(billNo && { billNo: billNo.to }),
          ...(billDate && { billDate: billDate.to }),
          ...(remarks && { remarks: remarks.to }),
          differsFromDocument: event.differs,
        })
        .where(eq(bills.id, event.billId));
      return;
    }
    case "DiffersConfirmed":
      await tx.update(bills).set({ differsFromDocument: false }).where(eq(bills.id, event.billId));
      return;
    case "RefundWrittenOff":
      await tx.insert(writeOffs).values({
        expenseId: event.expenseId,
        refundId: event.refundId,
        amountPaise: event.amount.paise,
        currency: event.amount.currency,
        createdAt: at,
      });
      return;
    case "ExpectedBillClosedOut":
      await tx.update(bills).set({ cancelledAt: at, cancelReason: "cancelled", closedAs: event.choice }).where(eq(bills.id, event.billId));
      return;
    case "ExpectedBillReopened":
      await tx.update(bills).set({ cancelledAt: null, cancelReason: null, closedAs: null }).where(eq(bills.id, event.billId));
      return;
    case "RemainderWrittenOff":
      await tx.insert(writeOffs).values({
        expenseId: event.expenseId,
        billId: event.billId,
        amountPaise: event.amount.paise,
        currency: event.amount.currency,
        createdAt: at,
      });
      return;
    // Undo takes the row back; the audit log keeps that it existed (design D2).
    case "RemainderWriteOffWithdrawn":
      await tx.delete(writeOffs).where(eq(writeOffs.billId, event.billId));
      return;
    case "RefundWithdrawn":
      await tx.delete(refunds).where(eq(refunds.id, event.refundId));
      return;
    case "BillWithdrawn":
      await tx.delete(bills).where(eq(bills.id, event.billId));
      return;
    case "ExpenseClosed":
      await tx.update(expenses).set({ closedReason: event.reason }).where(eq(expenses.id, event.expenseId));
      return;
    case "ExpenseCorrected": {
      const { amount, payee, paidOn, fundId, purposeId, whatFor } = event.changes;
      await tx
        .update(expenses)
        .set({
          ...(amount && { amountPaise: amount.to?.paise ?? null }),
          ...(payee && { payee: payee.to }),
          ...(paidOn && { paidOn: paidOn.to }),
          ...(fundId && { fundId: fundId.to }),
          ...(purposeId && { purposeId: purposeId.to }),
          ...(whatFor && { whatFor: whatFor.to }),
        })
        .where(eq(expenses.id, event.expenseId));
      return;
    }
  }
}

// The audit insert meets a racing key first (audit_log_idempotency_key); idempotency_keys_pkey is kept as the backstop.
const KEY_CONSTRAINTS = ["audit_log_idempotency_key", "idempotency_keys_pkey"];
const isKeyRace = (e: unknown) => {
  const cause = (e as { cause?: { code?: string; constraint?: string } })?.cause;
  return cause?.code === "23505" && KEY_CONSTRAINTS.includes(cause.constraint ?? "");
};

/** What a command will do once its audit rows are in: the events, their audit entries and the writes, or a rejection. */
type Staged =
  | {
      readonly ok: true;
      readonly events: readonly (Event | FundEvent | PurposeEvent)[];
      readonly entries: readonly Omit<typeof auditLog.$inferInsert, "at" | "actorId" | "command" | "idempotencyKey">[];
      readonly commit: () => Promise<void>;
    }
  | Rejected;

async function stageExpense(tx: Tx, actor: Actor, command: Command, owners: string[], at: Date, enqueue: Deps["enqueue"]): Promise<Staged> {
  const slice = await loadSlice(tx, actor, command);
  // Nothing is decided on a Claimant whose lock is not held: a Bill changed owner after the owners were read. Rerun.
  if (Object.values(slice.expenses).some((e) => !owners.includes(e.claimantId))) throw new OwnersMoved();
  const decision = decide(slice, command, actor, at);
  if (!decision.ok) return decision; // a rejected command changes nothing

  // One audit entry per event, with the states before and after it.
  let state = slice;
  const entries = decision.events.map((event) => {
    const [entity, entityId] = entityOf(event);
    const fromState = stateOf(state, entity, entityId);
    state = apply(state, event);
    return {
      ownerId: state.expenses[expenseOfEvent(event)]!.claimantId,
      event: event.type,
      entity,
      entityId,
      fromState,
      toState: stateOf(state, entity, entityId),
      payload: event,
    };
  });
  // And nothing is written to one: what a command creates is the Actor's or a locked owner's (checked, not assumed).
  if (entries.some((e) => !owners.includes(e.ownerId))) throw new OwnersMoved();
  return {
    ok: true,
    events: decision.events,
    entries,
    commit: async () => {
      for (const event of decision.events) await write(tx, event, at);
      for (const job of decision.jobs) await enqueue(tx, job);
    },
  };
}

async function stageFund(tx: Tx, actor: Actor, command: FundCommand, at: Date): Promise<Staged> {
  const slice = await loadFundSlice(tx, actor, command);
  const decision = decideFund(slice, command, actor);
  if (!decision.ok) return decision;
  return {
    ok: true,
    events: decision.events,
    entries: fundEntries(slice, decision.events, actor),
    commit: async () => {
      for (const event of decision.events) await writeFund(tx, event, at);
    },
  };
}

async function stagePurpose(tx: Tx, actor: Actor, command: PurposeCommand, at: Date): Promise<Staged> {
  const slice = await loadPurposeSlice(tx, actor, command);
  const decision = decidePurpose(slice, command, actor);
  if (!decision.ok) return decision;
  return {
    ok: true,
    events: decision.events,
    entries: purposeEntries(slice, decision.events),
    commit: async () => {
      for (const event of decision.events) await writePurpose(tx, event, at);
    },
  };
}

type AnyCommand = Command | FundCommand | PurposeCommand;
const ownersFor = (tx: Tx, actor: Actor, command: AnyCommand) =>
  isFundCommand(command) ? fundOwners(tx, actor, command) : isPurposeCommand(command) ? purposeOwners(tx, actor, command) : ownersOf(tx, actor, command);

export function createBooks({ db, now, enqueue }: Deps) {
  async function attempt(actor: Actor, command: AnyCommand, key: string | undefined): Promise<Result> {
    return db.transaction(async (tx) => {
      const owners = await ownersFor(tx, actor, command);
      for (const owner of owners) await lockClaimant(tx, owner);

      // A key is the requester's (the Actor's), not the owner's: the same key from anyone else is a conflict.
      if (key !== undefined) {
        const [seen] = await tx.select().from(idempotencyKeys).where(eq(idempotencyKeys.key, key));
        if (seen) {
          const same = seen.claimantId === actor.claimantId && isDeepStrictEqual(seen.command, JSON.parse(JSON.stringify(command)));
          return same ? (seen.result as Result) : conflict;
        }
      }

      const at = now();
      const staged = isFundCommand(command)
        ? await stageFund(tx, actor, command, at)
        : isPurposeCommand(command)
          ? await stagePurpose(tx, actor, command, at)
          : await stageExpense(tx, actor, command, owners, at, enqueue);
      if (!staged.ok) return staged; // a rejected command changes nothing

      // Audit rows first (design D2). The audit log holds a key once (schema), so the command's first entry carries it.
      const entries = staged.entries.map((e, i) => ({ ...e, at, actorId: actor.claimantId, command: command.type, idempotencyKey: i === 0 ? (key ?? null) : null }));
      if (entries.length) await tx.insert(auditLog).values(entries); // a command that changes nothing writes nothing
      await staged.commit();

      const result: Result = { ok: true, events: staged.events };
      if (key !== undefined) await tx.insert(idempotencyKeys).values({ key, claimantId: actor.claimantId, command, result, at });
      return result;
    });
  }

  return {
    /**
     * Every write. Typed rejections; throws when the database fails, or with OwnersMoved when owners still moved under it
     * after 3 tries, and then nothing is written.
     */
    async execute(actor: Actor, command: AnyCommand, opts: { idempotencyKey?: string } = {}): Promise<Result> {
      if (!mayEnter(actor)) return forbidden;
      for (let tries = 1; ; tries++) {
        try {
          return await attempt(actor, command, opts.idempotencyKey);
        } catch (e) {
          // Two Actors raced on one new key, or a Bill changed owner before the lock: the transaction rolled back; rerun it.
          // ponytail: 3 tries, then the error reaches the caller; a backoff or more tries if owners ever churn that fast.
          if (tries < 3 && (isKeyRace(e) || e instanceof OwnersMoved)) continue;
          throw e;
        }
      }
    },

    /** Settings → Funds: every Fund the Actor can use (an admin's: every Fund), in their order, with the team version, theirs and what is in effect. */
    async funds(actor: Actor) {
      if (!mayEnter(actor)) return forbidden;
      return { ok: true as const, funds: await listFunds(db, actor, "settings") };
    },

    /**
     * The upload and payment prompt (expense-tracking "Funds on the upload prompt", "Purpose"): the Funds in the Actor's
     * order, none hidden or archived, each with its "What for?" hint in effect; the Actor's active Purposes; and what is
     * preselected, which is where LogExpense puts a payment that names neither.
     */
    async prompt(actor: Actor) {
      if (!mayEnter(actor)) return forbidden;
      return { ok: true as const, ...(await promptOf(db, actor)) };
    },

    /** Settings → Purposes: the Actor's own Purposes, active and ended (an admin's by session: every Claimant's, D6). */
    async purposes(actor: Actor) {
      if (!mayEnter(actor)) return forbidden;
      return { ok: true as const, purposes: await listPurposes(db, actor) };
    },

    /** The Actor's effective templates for a Claim of this Fund (design §6); never its notes. */
    async fundTemplates(actor: Actor, fundId: string) {
      if (!mayEnter(actor)) return forbidden;
      const templates = await templatesOf(db, actor, fundId);
      return templates ? { ok: true as const, templates } : notFound;
    },

    /** One Expense with its Bills; status, Open amount, why it is open and Bill status derived on read (design D3). */
    async expense(actor: Actor, id: string) {
      if (!mayEnter(actor)) return forbidden;
      const [found] = await loadExpenses(db, actor, [id]);
      if (!found) return notFound;
      const { row, bills: billStates, refunds: refundStates, state } = found;
      const derived = deriveExpense(state);
      return {
        ok: true as const,
        expense: {
          id: row.id,
          reference: row.reference,
          status: derived.status,
          closedReason: row.closedReason,
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
          fundId: row.fundId,
          purposeId: row.purposeId,
          upiRef: row.upiRef,
          notes: row.notes,
          source: row.source,
          bills: billStates.map((b) => ({
            id: b.id,
            reference: b.reference,
            kind: b.kind,
            amount: b.amount,
            billNo: b.billNo,
            billDate: b.billDate,
            differs: b.differs,
            fulfilledOn: b.fulfilledOn,
            cancelReason: b.cancelReason,
            closedAs: b.closedAs, // set on a remainder "No more invoices" closed out, so it is not read as Item cancelled
            status: deriveBill(b),
          })),
          refunds: refundStates.map((r) => ({
            id: r.id,
            reference: r.reference,
            amount: r.amount,
            reason: r.reason,
            billId: r.billId,
            refundedOn: r.refundedOn,
            status: deriveRefund(r),
          })),
        },
      };
    },

    /**
     * The Order page from Books (W2.9), for an online Expense (else not_found): the Payment first, each delivered Bill and each Refund with the commands open
     * now, "Still expected" with the leftover question, and a closed-out remainder with its Undo.
     */
    async order(actor: Actor, id: string) {
      if (!mayEnter(actor)) return forbidden;
      const [found] = await loadExpenses(db, actor, [id]);
      if (!found) return notFound;
      const { row, bills: billStates, refunds: refundStates, state } = found;
      const page = orderPage({ newIds: [], expenses: { [state.id]: state } }, state.id, actor, now());
      if (!page) return notFound; // only an online Expense has an Order page
      const derived = deriveExpense(state);
      const billOf = (billId: string) => billStates.find((b) => b.id === billId)!;
      const refundOf = (refundId: string) => refundStates.find((r) => r.id === refundId)!;
      return {
        ok: true as const,
        order: {
          // ponytail: Payment method and proof join with those entities (tasks 2.21, Phase 2).
          payment: {
            id: row.id,
            reference: row.reference,
            amount: state.amount,
            paidOn: row.paidOn,
            payee: row.payee,
            orderRef: row.orderRef,
            upiRef: row.upiRef,
            whatFor: row.whatFor,
          },
          status: derived.status,
          openAmount: derived.openAmount,
          reason: derived.reason,
          bills: page.bills.map(({ id: billId, status, commands }) => {
            const b = billOf(billId);
            return {
              id: b.id,
              reference: b.reference,
              kind: b.kind,
              amount: b.amount,
              // ponytail: a Bill has no seller yet; the "Sold by" a Reading gives arrives with Phase 2.
              seller: null,
              description: b.description,
              remarks: b.remarks,
              billNo: b.billNo,
              billDate: b.billDate,
              differs: b.differs,
              fulfilledOn: b.fulfilledOn,
              status,
              commands,
            };
          }),
          refunds: page.refunds.map(({ id: refundId, status, commands }) => {
            const r = refundOf(refundId);
            return { id: r.id, reference: r.reference, amount: r.amount, reason: r.reason, refundedOn: r.refundedOn, status, commands };
          }),
          // Every id goes with its Reference (ADR 0005).
          stillExpected: page.stillExpected && { ...page.stillExpected, reference: billOf(page.stillExpected.billId).reference },
          closedOut: page.closedOut && { ...page.closedOut, reference: billOf(page.closedOut.billId).reference },
        },
      };
    },
  };
}
