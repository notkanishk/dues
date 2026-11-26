import { describe, expect, it } from "vitest";
import { formatRupees } from "@/src/money/money";
import { type Actor, apply, type BillState, decide, deriveBill, deriveExpense, type ExpenseState, type Slice } from "./core";

// Pure core: no database. Expected values are written by hand from the spec scenarios.
const mickey: Actor = { claimantId: "00000000-0000-7000-8000-00000000000a", roles: ["claimant"], via: "session" };
const now = new Date("2026-11-20T10:00:00Z");
const fresh: Slice = { newIds: ["e-1", "b-1"], expenses: {} };
const rupees = (paise: number) => ({ paise, currency: "INR" as const });

const logExpense = (kind: "online" | "shop" | "service", paise: number) =>
  ({ type: "LogExpense", kind, amount: rupees(paise), paidOn: "2026-11-19", payee: "Gizmo Parts Bazaar" }) as const;

describe("decide LogExpense", () => {
  it("opens an online Expense with one expected Bill for the full Payment", () => {
    const result = decide(fresh, logExpense("online", 129900), mickey, now);
    expect(result).toEqual({
      ok: true,
      jobs: [],
      events: [
        {
          type: "ExpenseLogged",
          expenseId: "e-1",
          claimantId: mickey.claimantId,
          kind: "online",
          amount: rupees(129900),
          paidOn: "2026-11-19",
          payee: "Gizmo Parts Bazaar",
          vendor: null,
          payback: false,
          orderRef: null,
          whatFor: null,
          upiRef: null,
          notes: null,
          source: "manual",
        },
        { type: "BillAdded", billId: "b-1", expenseId: "e-1", kind: null, amount: rupees(129900), fulfilledOn: null },
      ],
    });
  });

  it("opens a shop Expense of ₹250.00 with one Fulfilled Bill of ₹250.00", () => {
    const result = decide(fresh, logExpense("shop", 25000), mickey, now);
    expect(result.ok && result.events[1]).toEqual({
      type: "BillAdded",
      billId: "b-1",
      expenseId: "e-1",
      kind: null,
      amount: rupees(25000),
      fulfilledOn: "2026-11-19",
    });
  });

  it("opens a service Expense with its Bill already Fulfilled too", () => {
    const result = decide(fresh, logExpense("service", 4000), mickey, now);
    expect(result.ok && result.events[1]).toMatchObject({ fulfilledOn: "2026-11-19" });
  });

  it.each([
    ["a zero amount", { amount: rupees(0) }, "amount"],
    ["a negative amount", { amount: rupees(-100) }, "amount"],
    ["fractional paise", { amount: rupees(10.5) }, "amount"],
    ["an unknown kind", { kind: "barter" }, "kind"],
    ["a date that does not exist", { paidOn: "2026-02-30" }, "paidOn"],
    ["a month that does not exist", { paidOn: "2026-13-01" }, "paidOn"],
    ["a date in another format", { paidOn: "19/11/2026" }, "paidOn"],
  ])("refuses %s as validation", (_, change, field) => {
    const command = { ...logExpense("online", 100), ...change } as never;
    expect(decide(fresh, command, mickey, now)).toEqual({ ok: false, reason: "validation", field });
  });
});

describe("apply and derivation", () => {
  const afterLog = (kind: "online" | "shop") => {
    const result = decide(fresh, logExpense(kind, 25000), mickey, now);
    if (!result.ok) throw new Error("expected Ok");
    return result.events.reduce(apply, fresh).expenses["e-1"]!;
  };

  // Property-style (design §1): for every valid LogExpense, folding apply over its events gives the state the shell stores.
  it("folding apply over the emitted events reproduces the stored state, for any valid LogExpense", () => {
    const kinds = ["online", "shop", "service"] as const;
    const dates = ["2024-02-29", "2026-01-01", "2026-11-19", "2026-12-31"];
    const amounts = [1, 99, 25000, 129900, 9_999_999_99];
    for (const kind of kinds)
      for (const paidOn of dates)
        for (const paise of amounts) {
          const command = { type: "LogExpense", kind, amount: rupees(paise), paidOn } as const;
          const result = decide(fresh, command, mickey, now);
          if (!result.ok) throw new Error(`refused ${JSON.stringify(command)}`);
          expect(result.events.reduce(apply, fresh)).toEqual({
            newIds: ["e-1", "b-1"],
            expenses: {
              "e-1": {
                id: "e-1",
                draft: false,
                closedReason: null,
                amount: rupees(paise),
                refunds: [],
                writtenOff: rupees(0),
                bills: [
                  {
                    id: "b-1",
                    kind: null,
                    amount: rupees(paise),
                    fulfilledOn: kind === "online" ? null : paidOn,
                    paperlessId: null,
                    cancelled: false,
                    claim: null,
                  },
                ],
              },
            },
          });
        }
  });

  it("folds a logged online Expense into an open Expense with an expected Bill", () => {
    const expense = afterLog("online");
    expect(deriveExpense(expense)).toEqual({ status: "open", openAmount: rupees(0), reason: { code: "awaiting_goods" }, bills: ["expected"] });
    expect(expense.bills.map(deriveBill)).toEqual(["expected"]);
  });

  it("a Fulfilled Bill without a document is not ready", () => {
    expect(afterLog("shop").bills.map(deriveBill)).toEqual(["expected"]);
  });

  const expense = (paise: number, bills: number[], refunds: { paise: number; received: boolean }[] = []): ExpenseState => ({
    id: "e-1",
    draft: false,
    closedReason: null,
    amount: rupees(paise),
    bills: bills.map((b, i) => ({
      id: `b-${i}`,
      kind: "invoice",
      amount: rupees(b),
      fulfilledOn: "2026-11-19",
      paperlessId: 7,
      cancelled: false,
      claim: null,
    })),
    refunds: refunds.map((r) => ({ amount: rupees(r.paise), received: r.received })),
    writtenOff: rupees(0),
  });

  it("Partly covered: Payment ₹1,000.00, one Bill ₹400.00 → Open amount ₹600.00", () => {
    expect(deriveExpense(expense(100000, [40000])).openAmount).toEqual(rupees(60000));
  });

  it("Bills and Refunds together: ₹1,000.00 − ₹700.00 − ₹300.00 → ₹0.00", () => {
    expect(deriveExpense(expense(100000, [70000], [{ paise: 30000, received: true }])).openAmount).toEqual(rupees(0));
  });

  it("Exact in paise: ₹100.05 − ₹100.04 → exactly 1 paise", () => {
    expect(deriveExpense(expense(10005, [10004])).openAmount).toEqual(rupees(1));
  });

  it("stays open while the Open amount is zero but a Bill is not reimbursed", () => {
    expect(deriveExpense(expense(100000, [100000])).status).toBe("open");
  });

  it("a cancelled Bill no longer covers the Payment (its expected Refund does)", () => {
    const e = expense(100000, [100000]);
    e.bills[0]!.cancelled = true;
    expect(deriveExpense(e)).toMatchObject({ status: "open", openAmount: rupees(100000) });
    expect(deriveBill(e.bills[0]!)).toBe("cancelled");
  });

  it("a ready Bill is Fulfilled and has its document", () => {
    expect(deriveBill(expense(100, [100]).bills[0]!)).toBe("ready");
  });

  it("draft and closed come from the stored facts", () => {
    expect(deriveExpense({ ...expense(100, []), draft: true }).status).toBe("draft");
    expect(deriveExpense({ ...expense(100, []), closedReason: "personal" }).status).toBe("closed");
  });
});

// "Why an Expense is open" and the Bill lifecycle (expense-tracking spec), derived on read (design D3).
describe("why an Expense is open", () => {
  type BillFacts = Partial<BillState> & { paise: number };
  const bill = ({ paise, ...facts }: BillFacts, i = 0): BillState => ({
    id: `b-${i}`,
    kind: "invoice",
    amount: rupees(paise),
    fulfilledOn: "2026-11-19",
    paperlessId: 7,
    cancelled: false,
    claim: null,
    ...facts,
  });
  const facts = (paise: number, bills: BillFacts[], more: Partial<ExpenseState> = {}): ExpenseState => ({
    id: "e-1",
    draft: false,
    closedReason: null,
    amount: rupees(paise),
    bills: bills.map(bill),
    refunds: [],
    writtenOff: rupees(0),
    ...more,
  });
  const reasonOf = (e: ExpenseState) => deriveExpense(e).reason;

  it("Awaiting goods: an online Expense with an expected Bill", () => {
    expect(reasonOf(facts(129900, [{ paise: 129900, kind: null, fulfilledOn: null, paperlessId: null }]))).toEqual({
      code: "awaiting_goods",
    });
  });

  it("Refund owed: no Bill expected and a Refund expected", () => {
    const e = facts(100000, [{ paise: 70000 }], { refunds: [{ amount: rupees(30000), received: false }] });
    expect(reasonOf(e)).toEqual({ code: "refund_owed" });
  });

  it("awaiting goods comes before refund owed", () => {
    const e = facts(100000, [{ paise: 70000, fulfilledOn: null, paperlessId: null }], {
      refunds: [{ amount: rupees(30000), received: false }],
    });
    expect(reasonOf(e)).toEqual({ code: "awaiting_goods" });
  });

  it("Bill missing: a Bill is Fulfilled and has no document", () => {
    expect(reasonOf(facts(25000, [{ paise: 25000, kind: null, paperlessId: null }]))).toEqual({ code: "bill_missing" });
  });

  it("refund owed comes before bill missing", () => {
    const e = facts(100000, [{ paise: 70000, paperlessId: null }], { refunds: [{ amount: rupees(30000), received: false }] });
    expect(reasonOf(e)).toEqual({ code: "refund_owed" });
  });

  it("No bill is never bill missing: a Fulfilled no-bill Bill without a document", () => {
    const reason = reasonOf(facts(6000, [{ paise: 6000, kind: "no_bill", paperlessId: null }]));
    expect(reason).not.toEqual({ code: "bill_missing" });
  });

  it("a cancelled Bill without a document is not bill missing", () => {
    const e = facts(100000, [{ paise: 100000, paperlessId: null, cancelled: true }], {
      refunds: [{ amount: rupees(100000), received: true }],
    });
    expect(deriveExpense(e)).toMatchObject({ status: "settled", reason: null });
  });

  it("Mismatch: nothing expected and Bills plus Refunds ₹50.00 short of the Payment → \"mismatch ₹50.00\", at once", () => {
    // Derivation takes no clock, so nothing can make it wait.
    const e = facts(100000, [{ paise: 70000 }], { refunds: [{ amount: rupees(25000), received: true }] });
    const reason = reasonOf(e);
    expect(reason).toEqual({ code: "mismatch", amount: rupees(5000) });
    expect(reason?.code === "mismatch" && formatRupees(reason.amount)).toBe("₹50.00");
  });

  it("bill missing comes before mismatch", () => {
    expect(reasonOf(facts(100000, [{ paise: 95000, paperlessId: null }]))).toEqual({ code: "bill_missing" });
  });

  it("Written off: Payment ₹1,000.00, a Bill of ₹730.00 and ₹270.00 written off → Open amount ₹0.00, no mismatch", () => {
    const e = facts(100000, [{ paise: 73000 }], { writtenOff: rupees(27000) });
    expect(deriveExpense(e).openAmount).toEqual(rupees(0));
    expect(reasonOf(e)).not.toMatchObject({ code: "mismatch" });
  });

  it("In claim: all Bills covered and one claimed, not reimbursed", () => {
    const e = facts(100000, [{ paise: 60000, claim: "submitted" }, { paise: 40000, claim: "reimbursed" }]);
    expect(deriveExpense(e)).toEqual({
      status: "open",
      openAmount: rupees(0),
      reason: { code: "in_claim" },
      bills: ["claimed", "reimbursed"],
    });
  });

  it("In claim from the moment a Bill is added to a draft Claim", () => {
    expect(reasonOf(facts(100000, [{ paise: 100000, claim: "draft" }]))).toEqual({ code: "in_claim" });
  });

  // Open question for the owner: these open Expenses wait on nothing in the spec's five reasons. Pinned as null until decided.
  it("no reason yet: every Bill covered and ready, nothing claimed → open with reason null", () => {
    expect(deriveExpense(facts(100000, [{ paise: 100000 }]))).toEqual({
      status: "open",
      openAmount: rupees(0),
      reason: null,
      bills: ["ready"],
    });
  });

  it("no reason yet: a blank Bill amount with nothing expected → open with no Open amount and reason null", () => {
    const e = facts(100000, [{ paise: 0 }]);
    e.bills[0]!.amount = null;
    expect(deriveExpense(e)).toEqual({ status: "open", openAmount: null, reason: null, bills: ["ready"] });
  });

  it("Not settled while a Bill is unreimbursed: Open amount zero, one Bill claimed → open", () => {
    expect(deriveExpense(facts(100000, [{ paise: 100000, claim: "submitted" }])).status).toBe("open");
  });

  it("Settling: Open amount zero and every Bill reimbursed or cancelled → settled", () => {
    const e = facts(100000, [{ paise: 70000, claim: "reimbursed" }, { paise: 30000, cancelled: true }], {
      refunds: [{ amount: rupees(30000), received: true }],
    });
    expect(deriveExpense(e)).toEqual({ status: "settled", openAmount: rupees(0), reason: null, bills: ["reimbursed", "cancelled"] });
  });

  it("Expected Refund blocks settled: stays open with reason refund owed", () => {
    const e = facts(100000, [{ paise: 70000, claim: "reimbursed" }, { paise: 30000, cancelled: true }], {
      refunds: [{ amount: rupees(30000), received: false }],
    });
    expect(deriveExpense(e)).toMatchObject({ status: "open", reason: { code: "refund_owed" } });
  });
});

describe("Bill lifecycle", () => {
  const bill = (facts: Partial<BillState>): BillState => ({
    id: "b-1",
    kind: "invoice",
    amount: rupees(80000),
    fulfilledOn: null,
    paperlessId: null,
    cancelled: false,
    claim: null,
    ...facts,
  });

  it.each([
    ["Fulfilled without document → expected", { fulfilledOn: "2026-11-19" }, "expected"],
    ["Document without fulfilment → expected", { paperlessId: 7 }, "expected"],
    ["Ready needs both", { fulfilledOn: "2026-11-19", paperlessId: 7 }, "ready"],
    ["a no-bill Bill is ready without a document", { kind: "no_bill", fulfilledOn: "2026-11-19" }, "ready"],
    ["Added to a draft Claim → claimed", { fulfilledOn: "2026-11-19", paperlessId: 7, claim: "draft" }, "claimed"],
    ["On a submitted Claim → claimed", { fulfilledOn: "2026-11-19", paperlessId: 7, claim: "submitted" }, "claimed"],
    ["Reimbursed", { fulfilledOn: "2026-11-19", paperlessId: 7, claim: "reimbursed" }, "reimbursed"],
    ["Cancelled before fulfilment", { cancelled: true }, "cancelled"],
  ] as const)("%s", (_, facts, status) => {
    expect(deriveBill(bill(facts))).toBe(status);
  });

  it("Remove from draft: a claimed Bill taken off its draft Claim returns to ready", () => {
    const onDraft = bill({ fulfilledOn: "2026-11-19", paperlessId: 7, claim: "draft" });
    expect(deriveBill(onDraft)).toBe("claimed");
    expect(deriveBill({ ...onDraft, claim: null })).toBe("ready");
  });
});

// Property (design §1): for any slice, Open amount = Payment − Σ Bills − Σ Refunds − written off.
describe("Open amount invariant, for any generated slice", () => {
  // ponytail: a seeded generator instead of a property-testing dependency; same seed, same 2,000 slices.
  let seed = 0x5eed;
  const next = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
  const paise = () => next() % 10_000_000; // up to ₹1,00,000.00
  const pick = <T>(xs: readonly T[]) => xs[next() % xs.length]!;
  const many = <T>(make: () => T) => Array.from({ length: next() % 5 }, make);

  it("holds in integer paise for 2,000 slices", () => {
    for (let n = 0; n < 2000; n++) {
      const expense: ExpenseState = {
        id: "e-1",
        draft: pick([false, false, true]),
        closedReason: pick([null, null, null, "personal"]),
        amount: rupees(paise() + 1),
        bills: many(() => ({
          id: "b",
          kind: pick(["invoice", "no_bill", null] as const),
          amount: rupees(paise()),
          fulfilledOn: pick(["2026-11-19", null]),
          paperlessId: pick([7, null]),
          cancelled: pick([false, false, true]),
          claim: pick([null, "submitted", "reimbursed"] as const),
        })),
        refunds: many(() => ({ amount: rupees(paise()), received: pick([true, false]) })),
        writtenOff: rupees(pick([0, paise()])),
      };
      let expected = expense.amount!.paise;
      for (const b of expense.bills) if (!b.cancelled) expected -= b.amount!.paise;
      for (const r of expense.refunds) expected -= r.amount.paise;
      expected -= expense.writtenOff.paise;

      const { openAmount } = deriveExpense(expense);
      expect(openAmount).toEqual(rupees(expected));
      expect(Number.isSafeInteger(openAmount!.paise)).toBe(true);
    }
  });
});
