// Books' functional core (design §1): decide and apply are pure; the shell (books.ts) does the I/O.
import { isDeepStrictEqual } from "node:util";
import { type Money, minus, sum, zero } from "@/src/money/money";

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
/**
 * Corrects an Expense's amount, payee or paid-on date (expense-tracking, Expense corrections): only the fields given
 * change. Payment method arrives with that entity (task 2.21).
 */
export type CorrectExpense = {
  readonly type: "CorrectExpense";
  readonly expenseId: string;
  readonly amount?: Money;
  readonly payee?: string | null;
  readonly paidOn?: string;
};
/**
 * Corrects a Bill's amount, Bill number or date after its document is attached, or a No bill's (expense-tracking, Bill
 * corrections). A change to a Bill with a document marks it "differs from the document" until ConfirmDiffers.
 */
export type CorrectBill = {
  readonly type: "CorrectBill";
  readonly billId: string;
  readonly amount?: Money;
  readonly billNo?: string | null;
  readonly billDate?: string | null;
  /** The form's remarks column; a No bill must keep one (expense-tracking, Bill kinds and remarks). */
  readonly remarks?: string | null;
};
/** The Claimant confirms the document shows the edited values: the "differs from the document" mark is cleared. */
export type ConfirmDiffers = { readonly type: "ConfirmDiffers"; readonly billId: string };
/**
 * Closes a draft or open Expense as personal, duplicate or written off (expense-tracking, Closing an Expense). The
 * Claimant answers for each expected Refund: it stays expected, or it is written off.
 */
export type CloseExpense = {
  readonly type: "CloseExpense";
  readonly expenseId: string;
  readonly reason: CloseReason;
  readonly refunds: Readonly<Record<string, "expected" | "written_off">>;
};
export type CloseReason = "personal" | "duplicate" | "written_off";
/**
 * "No more invoices" on an Order (W2.9), and "Close the order?" for a leftover under ₹10 (yes is not_claiming): the
 * expected Bill is closed out and its remainder becomes an expected Refund, a ready No bill, or written off.
 */
export type CloseOrder = { readonly type: "CloseOrder"; readonly billId: string; readonly choice: CloseChoice };
export type CloseChoice = "refund_coming" | "claim_without_bill" | "not_claiming";
const CLOSE_CHOICES: readonly string[] = ["refund_coming", "claim_without_bill", "not_claiming"] satisfies CloseChoice[];
/** Undoes CloseOrder from the Order page (W2.9): what it made is taken back and the remainder is expected again. */
export type UndoCloseOrder = { readonly type: "UndoCloseOrder"; readonly billId: string };
/**
 * "Move to another payment" (W2.9): a delivered Bill belongs to another of the Claimant's Expenses. While either Expense
 * still expects goods, its expected Bill takes the difference (moving it back undoes an auto-attach's split).
 */
export type MoveBill = { readonly type: "MoveBill"; readonly billId: string; readonly toExpenseId: string };
/** "Detach" (W2.9): a delivered Bill becomes its own invoice-only Expense, as an unmatched Invoice would (W4). */
export type DetachBill = { readonly type: "DetachBill"; readonly billId: string };
/** A leftover under this is offered "₹1 left. Close the order?"; from it up, the three-way question (decision 55). */
export const LEFTOVER_QUESTION_FROM: Money = { paise: 1000, currency: "INR" };
/** The remark a leftover's No bill starts with (FUNCTIONAL §2 Bill, W2.9); the Claimant can edit it. */
export const NO_INVOICE_REMARK = "No invoice from seller";
const CLOSE_REASONS: readonly string[] = ["personal", "duplicate", "written_off"] satisfies CloseReason[];
export type Command =
  | LogExpense
  | SplitExpectedBill
  | ExpectRefund
  | CancelBill
  | ReturnBill
  | MarkRefundReceived
  | CorrectExpense
  | CorrectBill
  | ConfirmDiffers
  | CloseExpense
  | CloseOrder
  | UndoCloseOrder
  | MoveBill
  | DetachBill;
/** A corrected field's value before and after, for the audit log. */
export type Change<T> = { readonly from: T; readonly to: T };
export type RefundReason = "cancelled" | "returned" | "partial";

export type Event =
  | {
      readonly type: "ExpenseLogged";
      readonly expenseId: string;
      readonly claimantId: string;
      readonly kind: LogExpense["kind"] | null;
      readonly amount: Money;
      readonly paidOn: string | null;
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
      /** A leftover's No bill (W2.9): the Order's What for, its remark and the expected Bill it came from; else null. */
      readonly description: string | null;
      readonly remarks: string | null;
      readonly fromBillId: string | null;
    }
  | { readonly type: "BillMoved"; readonly billId: string; readonly fromExpenseId: string; readonly toExpenseId: string }
  | { readonly type: "ExpectedBillReduced"; readonly billId: string; readonly expenseId: string; readonly amount: Money }
  /** A correction moved more onto an Order's expected Bill; amount is its new remainder (ExpectedBillReduced's twin). */
  | { readonly type: "ExpectedBillIncreased"; readonly billId: string; readonly expenseId: string; readonly amount: Money }
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
  | { readonly type: "RefundReceived"; readonly refundId: string; readonly expenseId: string; readonly refundedOn: string }
  | {
      readonly type: "ExpenseCorrected";
      readonly expenseId: string;
      readonly changes: {
        readonly amount?: Change<Money | null>;
        readonly payee?: Change<string | null>;
        readonly paidOn?: Change<string | null>;
      };
    }
  | {
      readonly type: "BillCorrected";
      readonly billId: string;
      readonly expenseId: string;
      readonly changes: {
        readonly amount?: Change<Money | null>;
        readonly billNo?: Change<string | null>;
        readonly billDate?: Change<string | null>;
        readonly remarks?: Change<string | null>;
      };
      /** "differs from the document" after this edit: set by an edit to a Bill with a document, kept until confirmed. */
      readonly differs: boolean;
    }
  | { readonly type: "DiffersConfirmed"; readonly billId: string; readonly expenseId: string }
  /** An expected Refund the Claimant will not get back: it leaves Σ Refunds and its amount joins Σ written off. */
  | { readonly type: "RefundWrittenOff"; readonly refundId: string; readonly expenseId: string; readonly amount: Money }
  | { readonly type: "ExpenseClosed"; readonly expenseId: string; readonly reason: CloseReason }
  /** "No more invoices": the expected Bill stops waiting; amount is the remainder it held. */
  | { readonly type: "ExpectedBillClosedOut"; readonly billId: string; readonly expenseId: string; readonly choice: CloseChoice; readonly amount: Money }
  /** Not claiming: the closed-out remainder joins Σ written off. */
  | { readonly type: "RemainderWrittenOff"; readonly billId: string; readonly expenseId: string; readonly amount: Money }
  // Undo of a close: each takes back what the choice made; the expected Bill then waits again.
  | { readonly type: "RefundWithdrawn"; readonly refundId: string; readonly expenseId: string; readonly amount: Money }
  | { readonly type: "BillWithdrawn"; readonly billId: string; readonly expenseId: string; readonly amount: Money }
  | { readonly type: "RemainderWriteOffWithdrawn"; readonly billId: string; readonly expenseId: string; readonly amount: Money }
  | { readonly type: "ExpectedBillReopened"; readonly billId: string; readonly expenseId: string };

// Follow-ups the shell enqueues in the command's transaction (design D8); a Reaction carries them out.
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
  billNo: string | null;
  billDate: string | null;
  fulfilledOn: string | null;
  paperlessId: number | null;
  /** "differs from the document": edited after its document was attached, not yet confirmed against it. */
  differs: boolean;
  remarks: string | null;
  cancelled: boolean;
  /** How "No more invoices" closed out this expected Bill; null unless closed out (W2.9). */
  closedAs: CloseChoice | null;
  /** The expected Bill a leftover's No bill came from. */
  fromBillId: string | null;
  /** The state of the Claim it is on; a Bill is claimed from the moment it is added, draft included. Null until Claims exist (the loader fills it then). */
  claim: "draft" | "submitted" | "reimbursed" | null;
};
export type RefundState = {
  id: string;
  /** The Bill it came from. */
  billId: string | null;
  amount: Money;
  reason: RefundReason;
  received: boolean;
  writtenOff: boolean;
};
export type ExpenseState = {
  id: string;
  /** The Claimant whose books it is in: who logged it, whoever acts on it later (an admin included). */
  claimantId: string;
  draft: boolean;
  closedReason: CloseReason | null;
  kind: LogExpense["kind"] | null;
  amount: Money | null;
  payee: string | null;
  paidOn: string | null;
  whatFor: string | null;
  bills: BillState[];
  refunds: RefundState[];
  /** Σ written off: Refunds written off on closing, and remainders "Not claiming" closed out (W2.9). */
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
      return ok([
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
          description: null,
          remarks: null,
          fromBillId: null,
        },
      ]);
    }
    case "SplitExpectedBill": {
      const found = expectedBill(slice, command.billId);
      if (!found.ok) return found;
      const { expense, bill, remainder } = found;
      if (!isDate(command.fulfilledOn)) return rejectField("fulfilledOn");
      // ponytail: an Invoice for the whole remainder fulfils the expected Bill itself; that is not a split.
      if (!isPayment(command.amount) || command.amount.paise >= remainder.paise) return rejectField("amount");
      const [newBillId] = slice.newIds as [string];
      return ok([
        { type: "ExpectedBillReduced", billId: bill.id, expenseId: expense.id, amount: minus(remainder, command.amount) },
        {
          type: "BillAdded",
          billId: newBillId,
          expenseId: expense.id,
          kind: null,
          amount: command.amount,
          fulfilledOn: command.fulfilledOn,
          description: null,
          remarks: null,
          fromBillId: null,
        },
      ]);
    }
    case "ExpectRefund":
    case "CancelBill": {
      const found = expectedBill(slice, command.billId);
      if (!found.ok) return found;
      const { expense, bill, remainder } = found;
      if (command.type === "ExpectRefund" && (!isPayment(command.amount) || command.amount.paise > remainder.paise)) return rejectField("amount");
      const cancelled = command.type === "ExpectRefund" ? command.amount : remainder;
      const [refundId] = slice.newIds as [string];
      return ok([
        cancelled.paise === remainder.paise // everything left is cancelled: the expected Bill goes, its Refund covers the remainder
          ? { type: "BillCancelled", billId: bill.id, expenseId: expense.id, reason: "cancelled" }
          : { type: "ExpectedBillReduced", billId: bill.id, expenseId: expense.id, amount: minus(remainder, cancelled) },
        { type: "RefundExpected", refundId, expenseId: expense.id, billId: bill.id, amount: cancelled, reason: "cancelled" },
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
    case "CorrectExpense": {
      const expense = slice.expenses[command.expenseId];
      if (!expense) return reject("not_found");
      if (expense.closedReason) return reject("invalid_transition");
      if (onSubmittedClaim(expense)) return reject("locked");
      if (command.amount !== undefined && !isPayment(command.amount)) return rejectField("amount");
      if (command.paidOn !== undefined && !isDate(command.paidOn)) return rejectField("paidOn");
      const changes = {
        ...changed("amount", expense.amount, command.amount),
        ...changed("payee", expense.payee, command.payee),
        ...changed("paidOn", expense.paidOn, command.paidOn),
      };
      // Keeping a value changes nothing and writes nothing.
      if (!Object.keys(changes).length) return ok([]);
      const { from, to } = changes.amount ?? {};
      const moved = from && to ? moveExpected(expense, to.paise - from.paise) : [];
      if (!Array.isArray(moved)) return moved;
      return ok([{ type: "ExpenseCorrected", expenseId: expense.id, changes }, ...moved]);
    }
    case "CorrectBill": {
      const found = findBill(slice, command.billId);
      if (!found.ok) return found;
      const { expense, bill } = found;
      if (bill.cancelled) return reject("invalid_transition");
      // ponytail: the spec defines corrections after a document is attached, and a No bill has none to wait for;
      // any other Bill (an Order's expected remainder, a Bill still waiting for its document) is refused.
      if (bill.paperlessId === null && bill.kind !== "no_bill") return reject("invalid_transition");
      if (command.amount !== undefined && !isPayment(command.amount)) return rejectField("amount");
      if (command.billNo != null && bill.kind !== "invoice") return rejectField("billNo"); // only an Invoice has one
      if (command.billDate != null && !isDate(command.billDate)) return rejectField("billDate");
      if (command.remarks !== undefined && bill.kind === "no_bill" && !command.remarks?.trim()) return rejectField("remarks");
      const read = {
        ...changed("amount", bill.amount, command.amount),
        ...changed("billNo", bill.billNo, command.billNo),
        ...changed("billDate", bill.billDate, command.billDate),
      };
      const changes = { ...read, ...changed("remarks", bill.remarks, command.remarks) };
      if (!Object.keys(changes).length) return ok([]);
      // Only a value the document shows can differ from it; a remark is the Claimant's own.
      const differs = bill.differs || (bill.paperlessId !== null && Object.keys(read).length > 0);
      const { from, to } = changes.amount ?? {};
      const moved = bill.fulfilledOn && from && to ? moveExpected(expense, from.paise - to.paise) : [];
      if (!Array.isArray(moved)) return moved;
      return ok([{ type: "BillCorrected", billId: bill.id, expenseId: expense.id, changes, differs }, ...moved]);
    }
    case "ConfirmDiffers": {
      const found = findBill(slice, command.billId);
      if (!found.ok) return found;
      if (!found.bill.differs) return reject("invalid_transition");
      return ok([{ type: "DiffersConfirmed", billId: found.bill.id, expenseId: found.expense.id }]);
    }
    case "CloseExpense": {
      const expense = slice.expenses[command.expenseId];
      if (!expense) return reject("not_found");
      const { status } = deriveExpense(expense);
      if (status !== "draft" && status !== "open") return reject("invalid_transition");
      if (onSubmittedClaim(expense)) return reject("locked");
      if (!CLOSE_REASONS.includes(command.reason)) return rejectField("reason");
      // One answer for each expected Refund, and nothing else.
      const expected = expense.refunds.filter((r) => deriveRefund(r) === "expected");
      const answers = command.refunds ?? {};
      const answered = expected.every((r) => answers[r.id] === "expected" || answers[r.id] === "written_off");
      if (!answered || Object.keys(answers).length !== expected.length) return rejectField("refunds");
      return ok(
        [
          // Unclaimed: a Bill on a draft Claim is claimed and stays as it is.
          ...expense.bills
            .filter((b) => !b.cancelled && b.claim === null)
            .map((b): Event => ({ type: "BillCancelled", billId: b.id, expenseId: expense.id, reason: "cancelled" })),
          ...expected
            .filter((r) => answers[r.id] === "written_off")
            .map((r): Event => ({ type: "RefundWrittenOff", refundId: r.id, expenseId: expense.id, amount: r.amount })),
          { type: "ExpenseClosed", expenseId: expense.id, reason: command.reason },
        ],
        // Documents lose their reimb:* tag; only personal adds one (FUNCTIONAL §3.1). The Reaction finds them by Expense ID.
        [
          {
            name: "paperless.setTags",
            data: {
              expenseId: expense.id,
              remove: ["reimb:ready", "reimb:claimed", "reimb:reimbursed"],
              add: command.reason === "personal" ? ["personal"] : [],
            },
          },
        ],
      );
    }
    case "CloseOrder": {
      const found = expectedBill(slice, command.billId);
      if (!found.ok) return found;
      const { expense, bill, remainder } = found;
      if (!CLOSE_CHOICES.includes(command.choice)) return rejectField("choice");
      // A leftover under ₹10 is asked only "Close the order?", whose yes is Not claiming (decision 55).
      if (remainder.paise < LEFTOVER_QUESTION_FROM.paise && command.choice !== "not_claiming") return rejectField("choice");
      const [newId] = slice.newIds as [string];
      const at = { billId: bill.id, expenseId: expense.id };
      const made: Event =
        command.choice === "refund_coming"
          ? { type: "RefundExpected", refundId: newId, ...at, amount: remainder, reason: "cancelled" }
          : command.choice === "claim_without_bill"
            ? {
                type: "BillAdded",
                billId: newId,
                expenseId: expense.id,
                kind: "no_bill",
                amount: remainder,
                // ponytail: the Payment's date; the spec names none for a leftover's No bill.
                fulfilledOn: expense.paidOn,
                description: expense.whatFor,
                remarks: NO_INVOICE_REMARK,
                fromBillId: bill.id,
              }
            : { type: "RemainderWrittenOff", ...at, amount: remainder };
      return ok([{ type: "ExpectedBillClosedOut", ...at, choice: command.choice, amount: remainder }, made]);
    }
    case "UndoCloseOrder": {
      const found = findBill(slice, command.billId);
      if (!found.ok) return found;
      const { expense, bill } = found;
      if (!bill.closedAs || !bill.amount) return reject("invalid_transition");
      const at = { billId: bill.id, expenseId: expense.id };
      const reopened: Event = { type: "ExpectedBillReopened", ...at };
      switch (bill.closedAs) {
        case "not_claiming":
          return ok([{ type: "RemainderWriteOffWithdrawn", ...at, amount: bill.amount }, reopened]);
        case "refund_coming": {
          // The close's Refund is the Bill's last: once closed out, the Bill takes no more commands that make one.
          const refund = expense.refunds.findLast((r) => r.billId === bill.id);
          if (!refund) return reject("invalid_transition");
          const status = deriveRefund(refund);
          if (status !== "expected") return reject(status === "received" ? "locked" : "invalid_transition");
          return ok([{ type: "RefundWithdrawn", refundId: refund.id, expenseId: expense.id, amount: refund.amount }, reopened]);
        }
        case "claim_without_bill": {
          // Gone (moved or detached) or returned: it is no longer this Order's leftover to take back.
          const noBill = expense.bills.find((b) => b.fromBillId === bill.id);
          if (!noBill || noBill.cancelled || !noBill.amount) return reject("invalid_transition");
          if (locked(noBill)) return reject("locked");
          return ok([
            ...(noBill.claim === "draft" ? [{ type: "BillRemovedFromClaim", billId: noBill.id, expenseId: expense.id } as const] : []),
            { type: "BillWithdrawn", billId: noBill.id, expenseId: expense.id, amount: noBill.amount },
            reopened,
          ]);
        }
      }
    }
    case "MoveBill":
    case "DetachBill": {
      const found = findBill(slice, command.billId);
      if (!found.ok) return found;
      const { expense, bill } = found;
      // Only a delivered Bill moves: the expected remainder is the Order's own, and cancelled is for good.
      if (bill.cancelled || !bill.fulfilledOn || !bill.amount) return reject("invalid_transition");
      const out = moveExpected(expense, bill.amount.paise);
      if (!Array.isArray(out)) return out;
      if (command.type === "DetachBill") {
        // Detach is on the Order page only (W2.9); a shop or service Bill moves instead (W4.3).
        if (expense.kind !== "online") return reject("invalid_transition");
        const [expenseId] = slice.newIds as [string];
        return ok([
          ...out,
          {
            type: "ExpenseLogged",
            expenseId,
            claimantId: expense.claimantId, // the Order's owner, whoever detaches (an admin included)
            kind: expense.kind,
            amount: bill.amount,
            // ponytail: W4's invoice-only Expense takes the bill date; until a Reading gives one, the Order's date.
            paidOn: bill.billDate ?? expense.paidOn,
            payee: null,
            vendor: null,
            payback: false,
            orderRef: null,
            whatFor: null,
            upiRef: null,
            notes: null,
            source: "manual",
          },
          { type: "BillMoved", billId: bill.id, fromExpenseId: expense.id, toExpenseId: expenseId },
        ]);
      }
      const target = slice.expenses[command.toExpenseId];
      if (!target) return reject("not_found"); // the loader scoped it: another Claimant's Expense is absent
      if (target.id === expense.id || target.draft || target.closedReason) return reject("invalid_transition");
      // ponytail: a Bill never moves between two Claimants, an admin's move included; no spec allows it (D5 names only
      // Payback and duplicate resolution). invalid_transition, not forbidden: the Actor may act on both, the move is what is refused.
      if (target.claimantId !== expense.claimantId) return reject("invalid_transition");
      // A Bill equal to what the target still expects fulfils its expected Bill: cancelled, with no Refund (W4.3).
      const waiting = target.bills.find(isExpected);
      const into: Event[] | Rejected =
        waiting?.amount!.paise === bill.amount.paise
          ? [{ type: "BillCancelled", billId: waiting.id, expenseId: target.id, reason: "cancelled" }]
          : moveExpected(target, -bill.amount.paise);
      // ponytail: a Bill larger than the remainder is an open owner question; refused until it is decided.
      if (!Array.isArray(into)) return rejectField("billId");
      return ok([...out, { type: "BillMoved", billId: bill.id, fromExpenseId: expense.id, toExpenseId: target.id }, ...into]);
    }
    case "MarkRefundReceived": {
      // Not refused on a closed Expense: closing may leave a Refund still expected (FUNCTIONAL §3.1).
      const expense = Object.values(slice.expenses).find((e) => e.refunds.some((r) => r.id === command.refundId));
      const refund = expense?.refunds.find((r) => r.id === command.refundId);
      if (!expense || !refund) return reject("not_found");
      if (deriveRefund(refund) !== "expected") return reject("invalid_transition");
      if (!isDate(command.refundedOn)) return rejectField("refundedOn");
      return ok([{ type: "RefundReceived", refundId: refund.id, expenseId: expense.id, refundedOn: command.refundedOn }]);
    }
  }
}

const ok = (events: Event[], jobs: Job[] = []): Decision => ({ ok: true, events, jobs });

/** A Bill on a submitted Claim locks it and its Expense's fields (design §1). Recalled to draft, it no longer does. */
// ponytail: reimbursed counts as submitted; the spec names only submitted. Returning after submission (Owed to
// university) arrives with Claims.
const locked = (bill: BillState) => bill.claim === "submitted" || bill.claim === "reimbursed";
const onSubmittedClaim = (expense: ExpenseState) => expense.bills.some(locked);

/** { [field]: { from, to } } when the command gives a value that differs from the current one, else nothing. */
function changed<K extends string, T>(field: K, from: T, to: T | undefined): { [P in K]?: Change<T> } {
  if (to === undefined || isDeepStrictEqual(from, to)) return {};
  return { [field]: { from, to } } as { [P in K]?: Change<T> };
}
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
    if (locked(bill)) return reject("locked");
    return { ok: true as const, expense, bill };
  }
  return reject("not_found");
}

/** An Order's expected Bill: not cancelled, goods not yet arrived, not on a draft Claim, with an amount. */
const isExpected = (bill: BillState) => !bill.cancelled && !bill.fulfilledOn && !bill.claim && !!bill.amount;

function expectedBill(slice: Slice, billId: string) {
  const found = findBill(slice, billId);
  if (!found.ok) return found;
  if (!isExpected(found.bill)) return reject("invalid_transition");
  return { ...found, remainder: found.bill.amount! };
}

/**
 * While an Order still expects goods, a corrected Payment or delivered Bill moves its difference onto the expected Bill:
 * an Order expects one Bill for the full Payment (W2.1), and mismatch waits until nothing is expected (FUNCTIONAL §3.1).
 * `by` is how many paise more are expected. Refused when the expected Bill would reach zero or less.
 */
function moveExpected(expense: ExpenseState, by: number): Event[] | Rejected {
  const bill = expense.bills.find(isExpected);
  if (!bill || by === 0) return [];
  const amount = sum([bill.amount!, { paise: by, currency: bill.amount!.currency }]);
  if (amount.paise <= 0) return rejectField("amount");
  return [{ type: by < 0 ? "ExpectedBillReduced" : "ExpectedBillIncreased", billId: bill.id, expenseId: expense.id, amount }];
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
            claimantId: event.claimantId,
            draft: false,
            closedReason: null,
            kind: event.kind,
            amount: event.amount,
            payee: event.payee,
            paidOn: event.paidOn,
            whatFor: event.whatFor,
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
        billNo: null,
        billDate: null,
        fulfilledOn: event.fulfilledOn,
        paperlessId: null,
        differs: false,
        remarks: event.remarks,
        cancelled: false,
        closedAs: null,
        fromBillId: event.fromBillId,
        claim: null,
      };
      return { ...slice, expenses: { ...slice.expenses, [expense.id]: { ...expense, bills: [...expense.bills, bill] } } };
    }
    case "ExpectedBillReduced":
    case "ExpectedBillIncreased":
      return updateBill(slice, event.expenseId, event.billId, { amount: event.amount });
    case "BillRemovedFromClaim":
      return updateBill(slice, event.expenseId, event.billId, { claim: null });
    case "BillCancelled":
      return updateBill(slice, event.expenseId, event.billId, { cancelled: true });
    case "RefundExpected": {
      const expense = slice.expenses[event.expenseId]!;
      const refund: RefundState = {
        id: event.refundId,
        billId: event.billId,
        amount: event.amount,
        reason: event.reason,
        received: false,
        writtenOff: false,
      };
      return { ...slice, expenses: { ...slice.expenses, [expense.id]: { ...expense, refunds: [...expense.refunds, refund] } } };
    }
    case "RefundReceived": {
      const expense = slice.expenses[event.expenseId]!;
      const refunds = expense.refunds.map((r) => (r.id === event.refundId ? { ...r, received: true } : r));
      return { ...slice, expenses: { ...slice.expenses, [expense.id]: { ...expense, refunds } } };
    }
    case "BillCorrected":
      return updateBill(slice, event.expenseId, event.billId, { ...after(event.changes), differs: event.differs });
    case "DiffersConfirmed":
      return updateBill(slice, event.expenseId, event.billId, { differs: false });
    case "RefundWrittenOff": {
      const expense = slice.expenses[event.expenseId]!;
      const refunds = expense.refunds.map((r) => (r.id === event.refundId ? { ...r, writtenOff: true } : r));
      const writtenOff = sum([expense.writtenOff, event.amount]);
      return { ...slice, expenses: { ...slice.expenses, [expense.id]: { ...expense, refunds, writtenOff } } };
    }
    case "ExpenseClosed": {
      const expense = slice.expenses[event.expenseId]!;
      return { ...slice, expenses: { ...slice.expenses, [expense.id]: { ...expense, closedReason: event.reason } } };
    }
    case "ExpenseCorrected": {
      const expense = slice.expenses[event.expenseId]!;
      return { ...slice, expenses: { ...slice.expenses, [expense.id]: { ...expense, ...after(event.changes) } } };
    }
    case "BillMoved": {
      const from = slice.expenses[event.fromExpenseId]!;
      const to = slice.expenses[event.toExpenseId]!;
      const bill = from.bills.find((b) => b.id === event.billId)!;
      return {
        ...slice,
        expenses: {
          ...slice.expenses,
          [from.id]: { ...from, bills: from.bills.filter((b) => b.id !== bill.id) },
          [to.id]: { ...to, bills: [...to.bills, bill] },
        },
      };
    }
    case "ExpectedBillClosedOut":
      return updateBill(slice, event.expenseId, event.billId, { cancelled: true, closedAs: event.choice });
    case "ExpectedBillReopened":
      return updateBill(slice, event.expenseId, event.billId, { cancelled: false, closedAs: null });
    case "RemainderWrittenOff":
    case "RemainderWriteOffWithdrawn": {
      const expense = slice.expenses[event.expenseId]!;
      const writtenOff = event.type === "RemainderWrittenOff" ? sum([expense.writtenOff, event.amount]) : minus(expense.writtenOff, event.amount);
      return { ...slice, expenses: { ...slice.expenses, [expense.id]: { ...expense, writtenOff } } };
    }
    case "RefundWithdrawn": {
      const expense = slice.expenses[event.expenseId]!;
      const refunds = expense.refunds.filter((r) => r.id !== event.refundId);
      return { ...slice, expenses: { ...slice.expenses, [expense.id]: { ...expense, refunds } } };
    }
    case "BillWithdrawn": {
      const expense = slice.expenses[event.expenseId]!;
      const bills = expense.bills.filter((b) => b.id !== event.billId);
      return { ...slice, expenses: { ...slice.expenses, [expense.id]: { ...expense, bills } } };
    }
  }
}

/** Each corrected field's value after the change. */
const after = (changes: Readonly<Record<string, Change<unknown>>>) =>
  Object.fromEntries(Object.entries(changes).map(([field, change]) => [field, change.to]));

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

export type RefundStatus = "expected" | "received" | "written_off";
export const deriveRefund = (refund: RefundState): RefundStatus =>
  refund.received ? "received" : refund.writtenOff ? "written_off" : "expected";

/**
 * Open amount = Payment − Σ Bills (not cancelled) − Σ Refunds (not written off) − Σ written off; null while any of those
 * amounts is blank. A written-off Refund counts once, in written off.
 */
function openAmount(expense: ExpenseState): Money | null {
  const covering = [
    ...expense.bills.filter((b) => !b.cancelled).map((b) => b.amount),
    ...expense.refunds.filter((r) => !r.writtenOff).map((r) => r.amount),
    expense.writtenOff,
  ];
  if (!expense.amount || covering.some((m) => m === null)) return null;
  return minus(expense.amount, sum(covering as Money[]));
}

function whyOpen(expense: ExpenseState, open: Money | null): OpenReason | null {
  const live = expense.bills.filter((b) => !b.cancelled);
  if (live.some((b) => !b.fulfilledOn)) return { code: "awaiting_goods" };
  if (expense.refunds.some((r) => deriveRefund(r) === "expected")) return { code: "refund_owed" };
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
    open?.paise === 0 && bills.every((b) => b === "reimbursed" || b === "cancelled") && expense.refunds.every((r) => deriveRefund(r) !== "expected");
  return settled ? at("settled") : at("open", whyOpen(expense, open));
}

/**
 * What Books shows on the Order page (W2.9) and which of its commands `decide` accepts now: the delivered Bills with
 * Move and Detach, the Refunds with Refund received, "Still expected" with Item cancelled and No more invoices (a
 * leftover under LEFTOVER_QUESTION_FROM is asked "Close the order?", whose yes is Not claiming), and a closed-out
 * remainder with its Undo. Null when the Expense is not in the Actor's slice, or is not an online Order.
 */
export function orderPage(slice: Slice, expenseId: string, actor: Actor, now: Date) {
  const expense = slice.expenses[expenseId];
  if (expense?.kind !== "online") return null;
  // One validator: a command is offered only when decide would take it (a probe id stands in for new keys).
  const accepts = (command: Command) => decide({ ...slice, newIds: ["probe"] }, command, actor, now).ok;
  const offered = <T extends Command["type"]>(commands: [T, Command][]) => commands.filter(([, c]) => accepts(c)).map(([type]) => type);
  const today = now.toISOString().slice(0, 10);
  const expected = expense.bills.find(isExpected);
  const closed = expense.bills.find((b) => b.closedAs);
  return {
    // An Order's expected remainder is "Still expected", not a Bill; a closed-out one is shown with its choice.
    bills: expense.bills
      .filter((b) => b.fulfilledOn)
      .map((b) => ({
        id: b.id,
        status: deriveBill(b),
        // Move needs a target to check; the Bill's own side is Detach's, so both are offered or neither.
        commands: accepts({ type: "DetachBill", billId: b.id }) ? (["MoveBill", "DetachBill"] as const) : [],
      })),
    refunds: expense.refunds.map((r) => ({
      id: r.id,
      status: deriveRefund(r),
      commands: offered([["MarkRefundReceived", { type: "MarkRefundReceived", refundId: r.id, refundedOn: today }]]),
    })),
    stillExpected: expected
      ? {
          billId: expected.id,
          amount: expected.amount!,
          ask: expected.amount!.paise < LEFTOVER_QUESTION_FROM.paise ? ("close_order" as const) : ("three_way" as const),
          choices: (CLOSE_CHOICES as CloseChoice[]).filter((choice) => accepts({ type: "CloseOrder", billId: expected.id, choice })),
          commands: offered([
            ["ExpectRefund", { type: "ExpectRefund", billId: expected.id, amount: { paise: 1, currency: "INR" } }],
            ["CloseOrder", { type: "CloseOrder", billId: expected.id, choice: "not_claiming" }],
          ]),
        }
      : null,
    closedOut: closed
      ? {
          billId: closed.id,
          choice: closed.closedAs!,
          amount: closed.amount!,
          commands: offered([["UndoCloseOrder", { type: "UndoCloseOrder", billId: closed.id }]]),
        }
      : null,
  };
}
