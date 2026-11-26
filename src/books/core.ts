// Books' functional core (design §1): decide and apply are pure; the shell (books.ts) does the I/O.
import { type Money, sum } from "@/src/money/money";

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
export type Command = LogExpense;

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
    };

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
export type RefundState = { amount: Money; received: boolean };
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
  }
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
            writtenOff: { paise: 0, currency: "INR" },
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
  }
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
