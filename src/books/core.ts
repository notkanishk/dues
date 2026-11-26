// Books' functional core (design §1): decide and apply are pure; the shell (books.ts) does the I/O.
import { type Money, sum, zero } from "@/src/money/money";

// ponytail: the Actor lives here until Claimants (task 2.7) produces it; then it moves there.
export type Actor = {
  readonly claimantId: string;
  readonly roles: readonly string[];
  readonly via: "session" | "mcp" | "intake";
};

// Fund, Purpose, Payment method and Orderer arrive with those entities (tasks 2.7, 2.19b, 2.21).
export type LogExpense = {
  readonly type: "LogExpense";
  readonly kind: "online" | "shop" | "service";
  readonly amount: Money;
  readonly paidOn: string; // business date, YYYY-MM-DD
  readonly payee?: string;
  readonly vendor?: string;
  readonly payback?: boolean;
  readonly orderRef?: string;
  readonly whatFor?: string;
  readonly upiRef?: string;
  readonly notes?: string;
};
/**
 * Records a delivery's Invoice amount against an Order's expected Bill (W2.2): split off as its own Fulfilled Bill,
 * the expected remainder shrinks. LogDocument will issue it when a matched document arrives (Phase 2); until then
 * the new Bill has no document link.
 */
export type SplitExpectedBill = {
  readonly type: "SplitExpectedBill";
  readonly billId: string;
  readonly amount: Money;
  readonly fulfilledOn: string;
};
/** "Item cancelled" (W2.3): part of an Order's expected remainder is cancelled; all of it cancels the expected Bill. */
export type ExpectRefund = { readonly type: "ExpectRefund"; readonly billId: string; readonly amount: Money };
/** Cancels an expected Bill before fulfilment, all of what is left of it (W2.3, Bill lifecycle). */
export type CancelBill = { readonly type: "CancelBill"; readonly billId: string };
/** A delivered Bill sent back before it is on a submitted Claim (W2.5): off any draft Claim, cancelled for good, its amount an expected Refund. */
export type ReturnBill = { readonly type: "ReturnBill"; readonly billId: string };
/** The money is back (W2.4): the expected Refund is received on its refunded-on date. */
export type MarkRefundReceived = { readonly type: "MarkRefundReceived"; readonly refundId: string; readonly refundedOn: string };
export type Command = LogExpense | SplitExpectedBill | ExpectRefund | CancelBill | ReturnBill | MarkRefundReceived;
export type RefundReason = "cancelled" | "returned" | "partial";

export type Event =
  | {
      readonly type: "ExpenseLogged";
      readonly expenseId: string;
      readonly claimantId: string;
      readonly kind: LogExpense["kind"];
      readonly amount: Money;
      readonly paidOn: string;
      readonly payee: string | null;
      readonly vendor: string | null;
      readonly payback: boolean;
      readonly orderRef: string | null;
      readonly whatFor: string | null;
      readonly upiRef: string | null;
      readonly notes: string | null;
      readonly source: "manual";
    }
  | {
      readonly type: "BillAdded";
      readonly billId: string;
      readonly expenseId: string;
      readonly kind: BillKind | null; // null until a document says what it is
      readonly amount: Money;
      readonly fulfilledOn: string | null;
    }
  | { readonly type: "ExpectedBillReduced"; readonly billId: string; readonly expenseId: string; readonly amount: Money }
  | { readonly type: "BillRemovedFromClaim"; readonly billId: string; readonly expenseId: string }
  | { readonly type: "BillCancelled"; readonly billId: string; readonly expenseId: string; readonly reason: "cancelled" | "returned" }
  | {
      readonly type: "RefundExpected";
      readonly refundId: string;
      readonly expenseId: string;
      readonly billId: string; // the Bill it came from
      readonly amount: Money;
      readonly reason: RefundReason;
    }
  | { readonly type: "RefundReceived"; readonly refundId: string; readonly expenseId: string; readonly refundedOn: string };

// No command enqueues a follow-up yet; the shell already writes whatever decide returns.
export type Job = { readonly name: string; readonly data: unknown };

export type RejectionReason =
  | "not_found"
  | "forbidden"
  | "invalid_transition"
  | "locked"
  | "blocked_duplicate"
  | "blocked_check"
  | "needs_description"
  | "stale_form"
  | "idempotency_conflict"
  | "validation";
export type Rejected = { readonly ok: false; readonly reason: RejectionReason; readonly field?: string };
export type Decision = { readonly ok: true; readonly events: readonly Event[]; readonly jobs: readonly Job[] } | Rejected;

export type BillKind = "invoice" | "informal" | "payment_proof" | "no_bill";
export type BillState = {
  id: string;
  kind: BillKind | null;
  amount: Money | null;
  fulfilledOn: string | null;
  paperlessId: number | null;
  cancelled: boolean;
  /** The state of the Claim it is on; a Bill is claimed from the moment it is added, draft included. Null until Claims exist (the loader fills it then). */
  claim: "draft" | "submitted" | "reimbursed" | null;
};
export type RefundState = { id: string; amount: Money; reason: RefundReason; received: boolean };
export type ExpenseState = {
  id: string;
  draft: boolean;
  closedReason: string | null;
  amount: Money | null;
  bills: BillState[];
  refunds: RefundState[];
  /** What "Not claiming" closed as written off (task 2.13d). Zero until that fact is stored. */
  writtenOff: Money;
};
/** What a command touches, loaded by the shell under the Claimant's lock. newIds are fresh UUIDv7 keys from Postgres. */
export type Slice = { readonly newIds: readonly string[]; readonly expenses: Readonly<Record<string, ExpenseState>> };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (s: unknown) => {
  if (typeof s !== "string" || !ISO_DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
};
const isPayment = (m: Money | undefined) =>
  m?.currency === "INR" && Number.isSafeInteger(m.paise) && m.paise > 0;

export function decide(slice: Slice, command: Command, actor: Actor, _now: Date): Decision {
  switch (command.type) {
    case "LogExpense": {
      if (!["online", "shop", "service"].includes(command.kind)) return rejectField("kind");
      if (!isPayment(command.amount)) return rejectField("amount");
      if (!isDate(command.paidOn)) return rejectField("paidOn");
      const [expenseId, billId] = slice.newIds as [string, string];
      return {
        ok: true,
        jobs: [],
        events: [
          {
            type: "ExpenseLogged",
            expenseId,
            claimantId: actor.claimantId, // never from input (design D6)
            kind: command.kind,
            amount: command.amount,
            paidOn: command.paidOn,
            payee: command.payee ?? null,
            vendor: command.vendor ?? null,
            payback: command.payback ?? false,
            orderRef: command.orderRef ?? null,
            whatFor: command.whatFor ?? null,
            upiRef: command.upiRef ?? null,
            notes: command.notes ?? null,
            source: "manual",
          },
          // W2: an Order waits for its goods. W3: a shop or service Bill is Fulfilled at payment.
          {
            type: "BillAdded",
            billId,
            expenseId,
            kind: null,
            amount: command.amount,
            fulfilledOn: command.kind === "online" ? null : command.paidOn,
          },
        ],
      };
    }
    case "SplitExpectedBill": {
      const found = expectedBill(slice, command.billId);
      if (!found.ok) return found;
      const { expense, bill, remainder } = found;
      if (!isDate(command.fulfilledOn)) return rejectField("fulfilledOn");
      // ponytail: an Invoice for the whole remainder fulfils the expected Bill itself; that is not a split.
      if (!isPayment(command.amount) || command.amount.paise >= remainder) return rejectField("amount");
      const [newBillId] = slice.newIds as [string];
      return ok([
        { type: "ExpectedBillReduced", billId: bill.id, expenseId: expense.id, amount: inr(remainder - command.amount.paise) },
        { type: "BillAdded", billId: newBillId, expenseId: expense.id, kind: null, amount: command.amount, fulfilledOn: command.fulfilledOn },
      ]);
    }
    case "ExpectRefund":
    case "CancelBill": {
      const found = expectedBill(slice, command.billId);
      if (!found.ok) return found;
      const { expense, bill, remainder } = found;
      if (command.type === "ExpectRefund" && (!isPayment(command.amount) || command.amount.paise > remainder)) return rejectField("amount");
      const paise = command.type === "ExpectRefund" ? command.amount.paise : remainder;
      const [refundId] = slice.newIds as [string];
      return ok([
        paise === remainder // everything left is cancelled: the expected Bill goes, its Refund covers the remainder
          ? { type: "BillCancelled", billId: bill.id, expenseId: expense.id, reason: "cancelled" }
          : { type: "ExpectedBillReduced", billId: bill.id, expenseId: expense.id, amount: inr(remainder - paise) },
        { type: "RefundExpected", refundId, expenseId: expense.id, billId: bill.id, amount: inr(paise), reason: "cancelled" },
      ]);
    }
    case "ReturnBill": {
      const found = findBill(slice, command.billId);
      if (!found.ok) return found;
      const { expense, bill } = found;
      if (bill.cancelled) return reject("invalid_transition"); // cancelled is for good, even after a recall
      if (!bill.fulfilledOn || !bill.amount) return reject("invalid_transition"); // goods never came: cancel instead
      const [refundId] = slice.newIds as [string];
      return ok([
        ...(bill.claim === "draft" ? [{ type: "BillRemovedFromClaim", billId: bill.id, expenseId: expense.id } as const] : []),
        { type: "BillCancelled", billId: bill.id, expenseId: expense.id, reason: "returned" },
        { type: "RefundExpected", refundId, expenseId: expense.id, billId: bill.id, amount: bill.amount, reason: "returned" },
      ]);
    }
    case "MarkRefundReceived": {
      // Not refused on a closed Expense: closing may leave a Refund still expected (FUNCTIONAL §3.1).
      const expense = Object.values(slice.expenses).find((e) => e.refunds.some((r) => r.id === command.refundId));
      const refund = expense?.refunds.find((r) => r.id === command.refundId);
      if (!expense || !refund) return reject("not_found");
      if (refund.received) return reject("invalid_transition");
      if (!isDate(command.refundedOn)) return rejectField("refundedOn");
      return ok([{ type: "RefundReceived", refundId: refund.id, expenseId: expense.id, refundedOn: command.refundedOn }]);
    }
  }
}

const ok = (events: Event[]): Decision => ({ ok: true, events, jobs: [] });
const inr = (paise: number): Money => ({ paise, currency: "INR" });
const reject = (reason: Rejected["reason"]): Rejected => ({ ok: false, reason });

/**
 * The Bill and its open Expense (not draft, not closed), or not_found when it is not in the Actor's slice (the loader
 * scoped it). A Bill on a submitted Claim is locked for every command (design §1).
 */
function findBill(slice: Slice, billId: string) {
  for (const expense of Object.values(slice.expenses)) {
    const bill = expense.bills.find((b) => b.id === billId);
    if (!bill) continue;
    if (expense.draft || expense.closedReason) return reject("invalid_transition");
    // ponytail: reimbursed counts as submitted; returning after submission (Owed to university) arrives with Claims.
    if (bill.claim === "submitted" || bill.claim === "reimbursed") return reject("locked");
    return { ok: true as const, expense, bill };
  }
  return reject("not_found");
}

/** An Order's expected Bill: not cancelled, goods not yet arrived, not on a draft Claim, with an amount. */
function expectedBill(slice: Slice, billId: string) {
  const found = findBill(slice, billId);
  if (!found.ok) return found;
  const { bill } = found;
  if (bill.cancelled || bill.fulfilledOn || bill.claim || !bill.amount) return reject("invalid_transition");
  return { ...found, remainder: bill.amount.paise };
}

const rejectField = (field: string): Rejected => ({ ok: false, reason: "validation", field });

export function apply(slice: Slice, event: Event): Slice {
  switch (event.type) {
    case "ExpenseLogged":
      return {
        ...slice,
        expenses: {
          ...slice.expenses,
          [event.expenseId]: {
            id: event.expenseId,
            draft: false,
            closedReason: null,
            amount: event.amount,
            bills: [],
            refunds: [],
            writtenOff: zero,
          },
        },
      };
    case "BillAdded": {
      const expense = slice.expenses[event.expenseId]!;
      const bill: BillState = {
        id: event.billId,
        kind: event.kind,
        amount: event.amount,
        fulfilledOn: event.fulfilledOn,
        paperlessId: null,
        cancelled: false,
        claim: null,
      };
      return { ...slice, expenses: { ...slice.expenses, [expense.id]: { ...expense, bills: [...expense.bills, bill] } } };
    }
    case "ExpectedBillReduced":
      return updateBill(slice, event.expenseId, event.billId, { amount: event.amount });
    case "BillRemovedFromClaim":
      return updateBill(slice, event.expenseId, event.billId, { claim: null });
    case "BillCancelled":
      return updateBill(slice, event.expenseId, event.billId, { cancelled: true });
    case "RefundExpected": {
      const expense = slice.expenses[event.expenseId]!;
      const refund: RefundState = { id: event.refundId, amount: event.amount, reason: event.reason, received: false };
      return { ...slice, expenses: { ...slice.expenses, [expense.id]: { ...expense, refunds: [...expense.refunds, refund] } } };
    }
    case "RefundReceived": {
      const expense = slice.expenses[event.expenseId]!;
      const refunds = expense.refunds.map((r) => (r.id === event.refundId ? { ...r, received: true } : r));
      return { ...slice, expenses: { ...slice.expenses, [expense.id]: { ...expense, refunds } } };
    }
  }
}

function updateBill(slice: Slice, expenseId: string, billId: string, change: Partial<BillState>): Slice {
  const expense = slice.expenses[expenseId]!;
  const bills = expense.bills.map((b) => (b.id === billId ? { ...b, ...change } : b));
  return { ...slice, expenses: { ...slice.expenses, [expenseId]: { ...expense, bills } } };
}

// Status, Open amount, "why it's open" and Bill status are derived on read and never stored (design D3).
export type BillStatus = "expected" | "ready" | "claimed" | "reimbursed" | "cancelled";
export type ExpenseStatus = "draft" | "open" | "settled" | "closed";
/**
 * The first of the spec's five reasons an open Expense is open, in the spec's order; null for any other status,
 * and null for an open Expense that waits on none of them (see whyOpen).
 */
export type OpenReason =
  | { readonly code: "awaiting_goods" | "refund_owed" | "bill_missing" | "in_claim" }
  | { readonly code: "mismatch"; readonly amount: Money };

export function deriveBill(bill: BillState): BillStatus {
  if (bill.cancelled) return "cancelled";
  if (bill.claim === "reimbursed") return "reimbursed";
  if (bill.claim) return "claimed"; // draft or submitted: removal from a draft sets it back to null, so ready again
  if (bill.fulfilledOn && (bill.paperlessId !== null || bill.kind === "no_bill")) return "ready";
  return "expected";
}

/** Open amount = Payment − Σ Bills (not cancelled) − Σ Refunds − written off; null while any of those amounts is blank. */
function openAmount(expense: ExpenseState): Money | null {
  const covering = [
    ...expense.bills.filter((b) => !b.cancelled).map((b) => b.amount),
    ...expense.refunds.map((r) => r.amount),
    expense.writtenOff,
  ];
  if (!expense.amount || covering.some((m) => m === null)) return null;
  return { paise: expense.amount.paise - sum(covering as Money[]).paise, currency: "INR" };
}

function whyOpen(expense: ExpenseState, open: Money | null): OpenReason | null {
  const live = expense.bills.filter((b) => !b.cancelled);
  if (live.some((b) => !b.fulfilledOn)) return { code: "awaiting_goods" };
  if (expense.refunds.some((r) => !r.received)) return { code: "refund_owed" };
  if (live.some((b) => b.paperlessId === null && b.kind !== "no_bill")) return { code: "bill_missing" };
  // The signed Open amount: positive when Bills, Refunds and written off fall short of the Payment.
  if (open && open.paise !== 0) return { code: "mismatch", amount: open };
  if (live.some((b) => deriveBill(b) === "claimed")) return { code: "in_claim" };
  // ponytail: open question for the owner. An open Expense with nothing left to wait for (every Bill covered and
  // nothing claimed, or a blank amount with nothing expected) has none of the five reasons; null until the spec names one.
  return null;
}

/** The one derivation of an Expense: status, Open amount, why it is open, and each Bill's status in the Expense's order. */
export function deriveExpense(expense: ExpenseState): {
  status: ExpenseStatus;
  openAmount: Money | null;
  reason: OpenReason | null;
  bills: BillStatus[];
} {
  const open = openAmount(expense);
  const bills = expense.bills.map(deriveBill);
  const at = (status: ExpenseStatus, reason: OpenReason | null = null) => ({ status, openAmount: open, reason, bills });
  if (expense.closedReason) return at("closed");
  if (expense.draft) return at("draft");
  const settled =
    open?.paise === 0 && bills.every((b) => b === "reimbursed" || b === "cancelled") && expense.refunds.every((r) => r.received);
  return settled ? at("settled") : at("open", whyOpen(expense, open));
}
