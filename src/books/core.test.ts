import { describe, expect, it } from "vitest";
import { formatRupees } from "@/src/money/money";
import { type Actor, apply, type BillState, type Command, decide, deriveBill, deriveExpense, type ExpenseState, type Slice } from "./core";

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
    refunds: refunds.map((r) => ({ id: "r", amount: rupees(r.paise), reason: "cancelled", received: r.received })),
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

  it("a cancelled Bill no longer covers the Payment (its expected Refund does): refund owed, not awaiting goods", () => {
    const e = expense(100000, [100000], [{ paise: 100000, received: false }]);
    e.bills[0] = { ...e.bills[0]!, cancelled: true, fulfilledOn: null, paperlessId: null };
    expect(deriveExpense(e)).toEqual({ status: "open", openAmount: rupees(0), reason: { code: "refund_owed" }, bills: ["cancelled"] });
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
    const e = facts(100000, [{ paise: 70000 }], { refunds: [{ id: "r", amount: rupees(30000), reason: "cancelled", received: false }] });
    expect(reasonOf(e)).toEqual({ code: "refund_owed" });
  });

  it("awaiting goods comes before refund owed", () => {
    const e = facts(100000, [{ paise: 70000, fulfilledOn: null, paperlessId: null }], {
      refunds: [{ id: "r", amount: rupees(30000), reason: "cancelled", received: false }],
    });
    expect(reasonOf(e)).toEqual({ code: "awaiting_goods" });
  });

  it("Bill missing: a Bill is Fulfilled and has no document", () => {
    expect(reasonOf(facts(25000, [{ paise: 25000, kind: null, paperlessId: null }]))).toEqual({ code: "bill_missing" });
  });

  it("refund owed comes before bill missing", () => {
    const e = facts(100000, [{ paise: 70000, paperlessId: null }], { refunds: [{ id: "r", amount: rupees(30000), reason: "cancelled", received: false }] });
    expect(reasonOf(e)).toEqual({ code: "refund_owed" });
  });

  it("No bill is never bill missing: a Fulfilled no-bill Bill without a document", () => {
    const reason = reasonOf(facts(6000, [{ paise: 6000, kind: "no_bill", paperlessId: null }]));
    expect(reason).not.toEqual({ code: "bill_missing" });
  });

  it("a cancelled Bill without a document is not bill missing", () => {
    const e = facts(100000, [{ paise: 60000, claim: "submitted" }, { paise: 40000, paperlessId: null, cancelled: true }], {
      refunds: [{ id: "r", amount: rupees(40000), reason: "cancelled", received: true }],
    });
    expect(deriveExpense(e)).toMatchObject({ status: "open", reason: { code: "in_claim" } });
  });

  it("Mismatch: nothing expected and Bills plus Refunds ₹50.00 short of the Payment → \"mismatch ₹50.00\", at once", () => {
    // Derivation takes no clock, so nothing can make it wait.
    const e = facts(100000, [{ paise: 70000 }], { refunds: [{ id: "r", amount: rupees(25000), reason: "cancelled", received: true }] });
    const reason = reasonOf(e);
    expect(reason).toEqual({ code: "mismatch", amount: rupees(5000) });
    expect(reason?.code === "mismatch" && formatRupees(reason.amount)).toBe("₹50.00");
  });

  it("Overpaid: Bills ₹50.00 over the Payment → mismatch keeps the signed amount, −₹50.00", () => {
    expect(reasonOf(facts(100000, [{ paise: 105000 }]))).toEqual({ code: "mismatch", amount: rupees(-5000) });
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
      refunds: [{ id: "r", amount: rupees(30000), reason: "cancelled", received: true }],
    });
    expect(deriveExpense(e)).toEqual({ status: "settled", openAmount: rupees(0), reason: null, bills: ["reimbursed", "cancelled"] });
  });

  it("Expected Refund blocks settled: stays open with reason refund owed", () => {
    const e = facts(100000, [{ paise: 70000, claim: "reimbursed" }, { paise: 30000, cancelled: true }], {
      refunds: [{ id: "r", amount: rupees(30000), reason: "cancelled", received: false }],
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

// Property (design §1): for any slice, Open amount = Payment − Σ Bills − Σ Refunds − written off (null while any is blank),
// and an Expense that is neither draft nor closed is settled ⇔ Open amount zero ∧ every Refund received ∧ every Bill reimbursed or cancelled.
describe("Open amount and settled invariants, for any generated slice", () => {
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
  const maybeBlank = (p: number) => (next() % 10 === 0 ? null : rupees(p)); // one amount in ten left blank

  it("hold in integer paise for 2,000 slices, blank amounts included", () => {
    const seen = { settled: 0, openAtZero: 0, blank: 0 };
    for (let n = 0; n < 2000; n++) {
      const bills = many(
        (): BillState => ({
          id: "b",
          kind: pick(["invoice", "no_bill", null] as const),
          amount: maybeBlank(paise()),
          fulfilledOn: pick(["2026-11-19", null]),
          paperlessId: pick([7, null]),
          cancelled: pick([false, false, true]),
          claim: pick([null, "draft", "submitted", "reimbursed", "reimbursed"] as const),
        }),
      );
      const refunds = many(() => ({ id: "r", amount: rupees(paise()), reason: "cancelled" as const, received: pick([true, true, false]) }));
      const amount = maybeBlank(paise() + 1);
      // Half the time written off takes up whatever is left, so Open amount zero is common, not a fluke.
      const live = bills.filter((b) => !b.cancelled);
      const left = (amount?.paise ?? 0) - live.reduce((t, b) => t + (b.amount?.paise ?? 0), 0) - refunds.reduce((t, r) => t + r.amount.paise, 0);
      const expense: ExpenseState = {
        id: "e-1",
        draft: pick([false, false, false, true]),
        closedReason: pick([null, null, null, "personal"]),
        amount,
        bills,
        refunds,
        writtenOff: rupees(pick([0, paise(), Math.max(left, 0), Math.max(left, 0)])),
      };

      const blank = !amount || live.some((b) => !b.amount);
      let expected = amount?.paise ?? 0;
      for (const b of live) expected -= b.amount?.paise ?? 0;
      for (const r of refunds) expected -= r.amount.paise;
      expected -= expense.writtenOff.paise;

      const { openAmount, status } = deriveExpense(expense);
      expect(openAmount).toEqual(blank ? null : rupees(expected));

      if (expense.draft || expense.closedReason) continue;
      const settles =
        openAmount?.paise === 0 && refunds.every((r) => r.received) && bills.every((b) => b.cancelled || b.claim === "reimbursed");
      expect(status === "settled").toBe(settles);
      if (settles) seen.settled++;
      else if (openAmount?.paise === 0) seen.openAtZero++;
      if (blank) seen.blank++;
    }
    // Both sides of the equivalence, and blank amounts, are actually exercised.
    expect(seen.settled).toBeGreaterThan(20);
    expect(seen.openAtZero).toBeGreaterThan(20);
    expect(seen.blank).toBeGreaterThan(20);
  });

  // Every Order command moves money between the expected Bill, new Bills and Refunds and never creates or loses any, so
  // from a logged Expense (Open amount zero) the Open amount stays exactly zero, and still equals Payment − Σ live Bills
  // − Σ Refunds − written off. A cancelled Bill stays cancelled and a received Refund stays received.
  it("hold for 500 random sequences of Order commands; refusals are typed, never thrown", () => {
    const seen = { accepted: new Set<string>(), refused: new Set<string>(), settled: 0 };
    for (let n = 0; n < 500; n++) {
      const logged = decide(fresh, logExpense(pick(["online", "online", "shop"] as const), paise() + 1), mickey, now);
      if (!logged.ok) throw new Error("expected Ok");
      let slice = logged.events.reduce(apply, fresh);
      let fresher = 0;
      for (let step = 0; step < 12; step++) {
        const expense = slice.expenses["e-1"]!;
        const billId = pick([...expense.bills.map((b) => b.id), "b-unknown"]);
        const refundId = pick([...expense.refunds.map((r) => r.id), "r-unknown"]);
        const remainder = expense.bills.find((b) => b.id === billId)?.amount?.paise ?? 100;
        const amount = rupees(pick([0, 1, next() % (remainder + 2), remainder - 1, remainder, remainder + 1]));
        const command: Command = pick([
          { type: "SplitExpectedBill", billId, amount, fulfilledOn: pick(["2026-11-21", "2026-02-30"]) },
          { type: "ExpectRefund", billId, amount },
          { type: "CancelBill", billId },
          { type: "ReturnBill", billId },
          { type: "MarkRefundReceived", refundId, refundedOn: pick(["2026-11-25", "25/11/2026"]) },
        ] as const);
        const ids = { ...slice, newIds: [`new-${fresher++}`] };
        const decision = decide(ids, command, mickey, now);
        if (!decision.ok) {
          expect(["not_found", "invalid_transition", "validation"]).toContain(decision.reason);
          seen.refused.add(`${command.type}:${decision.reason}`);
          continue;
        }
        seen.accepted.add(command.type);
        const before = slice.expenses["e-1"]!;
        slice = decision.events.reduce(apply, ids);
        const after = slice.expenses["e-1"]!;

        const live = after.bills.filter((b) => !b.cancelled);
        const formula =
          after.amount!.paise - live.reduce((t, b) => t + b.amount!.paise, 0) - after.refunds.reduce((t, r) => t + r.amount.paise, 0) - after.writtenOff.paise;
        const { openAmount, status } = deriveExpense(after);
        expect(openAmount).toEqual(rupees(formula));
        expect(openAmount).toEqual(rupees(0));
        for (const b of before.bills) if (b.cancelled) expect(after.bills.find((x) => x.id === b.id)?.cancelled).toBe(true);
        for (const r of before.refunds) if (r.received) expect(after.refunds.find((x) => x.id === r.id)?.received).toBe(true);
        for (const b of after.bills) expect(b.amount!.paise).toBeGreaterThan(0);
        if (status === "settled") seen.settled++;
      }
    }
    // Every command is accepted somewhere, refused somewhere, and some sequences settle.
    expect([...seen.accepted].sort()).toEqual(["CancelBill", "ExpectRefund", "MarkRefundReceived", "ReturnBill", "SplitExpectedBill"]);
    for (const type of ["CancelBill", "ExpectRefund", "MarkRefundReceived", "ReturnBill", "SplitExpectedBill"])
      expect([...seen.refused].some((r) => r.startsWith(`${type}:`))).toBe(true);
    expect(seen.settled).toBeGreaterThan(20);
  });
});

// Order flow (expense-tracking: Order splitting, Order cancellation and Refunds, Return before submission). Figures from the spec.
describe("Order commands", () => {
  // An online Order of the given Payment: Expense e-1 with its expected Bill b-1.
  const order = (paise: number): Slice => {
    const logged = decide(fresh, logExpense("online", paise), mickey, now);
    if (!logged.ok) throw new Error("expected Ok");
    return logged.events.reduce(apply, fresh);
  };
  // Runs one command with the given fresh ids; returns the decision and the folded slice.
  const run = (slice: Slice, command: Command, newIds: string[] = []) => {
    const withIds = { ...slice, newIds };
    const decision = decide(withIds, command, mickey, now);
    return { decision, slice: decision.ok ? decision.events.reduce(apply, withIds) : slice };
  };
  const derived = (slice: Slice) => deriveExpense(slice.expenses["e-1"]!);
  const amounts = (slice: Slice) => slice.expenses["e-1"]!.bills.map((b) => b.amount?.paise);

  describe("SplitExpectedBill", () => {
    it("First delivery: an Invoice of ₹1,200.00 on a ₹3,000.00 Order → a Fulfilled Bill of ₹1,200.00, expected Bill ₹1,800.00", () => {
      const { decision, slice } = run(order(300000), { type: "SplitExpectedBill", billId: "b-1", amount: rupees(120000), fulfilledOn: "2026-11-21" }, ["b-2"]);
      expect(decision).toEqual({
        ok: true,
        jobs: [],
        events: [
          { type: "ExpectedBillReduced", billId: "b-1", expenseId: "e-1", amount: rupees(180000) },
          { type: "BillAdded", billId: "b-2", expenseId: "e-1", kind: null, amount: rupees(120000), fulfilledOn: "2026-11-21" },
        ],
      });
      expect(amounts(slice)).toEqual([180000, 120000]);
      expect(derived(slice)).toMatchObject({ openAmount: rupees(0), reason: { code: "awaiting_goods" }, bills: ["expected", "expected"] });
    });

    it("Smaller invoice: a second Invoice of ₹500.00 splits the ₹1,800.00 remainder the same way → ₹1,300.00", () => {
      const first = run(order(300000), { type: "SplitExpectedBill", billId: "b-1", amount: rupees(120000), fulfilledOn: "2026-11-21" }, ["b-2"]);
      const { slice } = run(first.slice, { type: "SplitExpectedBill", billId: "b-1", amount: rupees(50000), fulfilledOn: "2026-11-22" }, ["b-3"]);
      expect(amounts(slice)).toEqual([130000, 120000, 50000]);
      expect(derived(slice).openAmount).toEqual(rupees(0));
    });

    const split = (amount: number, billId = "b-1", fulfilledOn = "2026-11-21") =>
      ({ type: "SplitExpectedBill", billId, amount: rupees(amount), fulfilledOn }) as const;
    it.each([
      ["more than the remainder", split(300001), { ok: false, reason: "validation", field: "amount" }],
      ["the whole remainder (that fulfils the Bill, it is not a split)", split(300000), { ok: false, reason: "validation", field: "amount" }],
      ["a zero amount", split(0), { ok: false, reason: "validation", field: "amount" }],
      ["a date that does not exist", split(100, "b-1", "2026-02-30"), { ok: false, reason: "validation", field: "fulfilledOn" }],
      ["a Bill outside the Actor's slice", split(100, "b-9"), { ok: false, reason: "not_found" }],
    ])("refuses %s, and throws nothing", (_, command, rejection) => {
      expect(run(order(300000), command, ["b-2"]).decision).toEqual(rejection);
    });

    it("refuses a Bill whose goods have arrived: a shop Bill is not expected", () => {
      const shop = decide(fresh, logExpense("shop", 25000), mickey, now);
      if (!shop.ok) throw new Error("expected Ok");
      expect(run(shop.events.reduce(apply, fresh), split(100), ["b-2"]).decision).toEqual({ ok: false, reason: "invalid_transition" });
    });

    it("refuses an Expense that is closed", () => {
      const slice = order(300000);
      slice.expenses["e-1"]!.closedReason = "personal";
      expect(run(slice, split(100), ["b-2"]).decision).toEqual({ ok: false, reason: "invalid_transition" });
    });
  });

  it.each([
    ["split", { type: "SplitExpectedBill", billId: "b-1", amount: rupees(100), fulfilledOn: "2026-11-21" }],
    ["cancel", { type: "CancelBill", billId: "b-1" }],
    ["return", { type: "ReturnBill", billId: "b-2" }],
  ] as const)("refuses to %s a Bill on a draft Expense", (_, command) => {
    const slice = delivered();
    slice.expenses["e-1"]!.draft = true;
    expect(run(slice, command, ["x"]).decision).toEqual({ ok: false, reason: "invalid_transition" });
  });

  // ₹3,000.00 Order after the first delivery: expected remainder ₹1,800.00 (b-1), Fulfilled ₹1,200.00 (b-2).
  const delivered = () =>
    run(order(300000), { type: "SplitExpectedBill", billId: "b-1", amount: rupees(120000), fulfilledOn: "2026-11-21" }, ["b-2"]).slice;
  const refunds = (slice: Slice) => slice.expenses["e-1"]!.refunds;

  describe("ExpectRefund (Item cancelled)", () => {
    it("Partial cancellation: ₹500.00 of the ₹1,800.00 remainder → remainder ₹1,300.00 and an expected Refund of ₹500.00", () => {
      const { decision, slice } = run(delivered(), { type: "ExpectRefund", billId: "b-1", amount: rupees(50000) }, ["r-1"]);
      expect(decision).toEqual({
        ok: true,
        jobs: [],
        events: [
          { type: "ExpectedBillReduced", billId: "b-1", expenseId: "e-1", amount: rupees(130000) },
          { type: "RefundExpected", refundId: "r-1", expenseId: "e-1", billId: "b-1", amount: rupees(50000), reason: "cancelled" },
        ],
      });
      expect(amounts(slice)).toEqual([130000, 120000]);
      expect(refunds(slice)).toEqual([{ id: "r-1", amount: rupees(50000), reason: "cancelled", received: false }]);
      expect(derived(slice)).toMatchObject({ openAmount: rupees(0), reason: { code: "awaiting_goods" } });
    });

    it("Cancel everything left by amount: ₹1,300.00 of a ₹1,300.00 remainder → the expected Bill is cancelled, Refund ₹1,300.00", () => {
      const partly = run(delivered(), { type: "ExpectRefund", billId: "b-1", amount: rupees(50000) }, ["r-1"]).slice;
      const { decision, slice } = run(partly, { type: "ExpectRefund", billId: "b-1", amount: rupees(130000) }, ["r-2"]);
      expect(decision).toMatchObject({
        ok: true,
        events: [
          { type: "BillCancelled", billId: "b-1", expenseId: "e-1", reason: "cancelled" },
          { type: "RefundExpected", refundId: "r-2", billId: "b-1", amount: rupees(130000), reason: "cancelled" },
        ],
      });
      expect(derived(slice)).toMatchObject({ openAmount: rupees(0), bills: ["cancelled", "expected"] });
      expect(refunds(slice).map((r) => r.amount.paise)).toEqual([50000, 130000]);
    });

    it.each([
      ["more than the remainder", rupees(180001), { ok: false, reason: "validation", field: "amount" }],
      ["a zero amount", rupees(0), { ok: false, reason: "validation", field: "amount" }],
    ])("refuses %s", (_, amount, rejection) => {
      expect(run(delivered(), { type: "ExpectRefund", billId: "b-1", amount }, ["r-1"]).decision).toEqual(rejection);
    });

    it("refuses a Fulfilled Bill: goods that arrived are returned, not cancelled", () => {
      expect(run(delivered(), { type: "ExpectRefund", billId: "b-2", amount: rupees(100) }, ["r-1"]).decision).toEqual({
        ok: false,
        reason: "invalid_transition",
      });
    });
  });

  describe("CancelBill", () => {
    it("Cancelled before fulfilment: an expected Bill of ₹800.00 → cancelled, and an expected Refund of ₹800.00", () => {
      const { decision, slice } = run(order(80000), { type: "CancelBill", billId: "b-1" }, ["r-1"]);
      expect(decision).toEqual({
        ok: true,
        jobs: [],
        events: [
          { type: "BillCancelled", billId: "b-1", expenseId: "e-1", reason: "cancelled" },
          { type: "RefundExpected", refundId: "r-1", expenseId: "e-1", billId: "b-1", amount: rupees(80000), reason: "cancelled" },
        ],
      });
      expect(derived(slice)).toEqual({ status: "open", openAmount: rupees(0), reason: { code: "refund_owed" }, bills: ["cancelled"] });
    });

    it("Cancel everything left: the ₹1,300.00 remainder → the expected Bill is cancelled, Refund ₹1,300.00", () => {
      const partly = run(delivered(), { type: "ExpectRefund", billId: "b-1", amount: rupees(50000) }, ["r-1"]).slice;
      const { slice } = run(partly, { type: "CancelBill", billId: "b-1" }, ["r-2"]);
      expect(derived(slice).bills).toEqual(["cancelled", "expected"]);
      expect(refunds(slice).map((r) => [r.amount.paise, r.reason])).toEqual([
        [50000, "cancelled"],
        [130000, "cancelled"],
      ]);
      expect(derived(slice).openAmount).toEqual(rupees(0));
    });

    it("a cancelled Bill takes no more commands: cancel, split, refund or return", () => {
      const cancelled = run(order(80000), { type: "CancelBill", billId: "b-1" }, ["r-1"]).slice;
      for (const command of [
        { type: "CancelBill", billId: "b-1" },
        { type: "ExpectRefund", billId: "b-1", amount: rupees(100) },
        { type: "SplitExpectedBill", billId: "b-1", amount: rupees(100), fulfilledOn: "2026-11-21" },
      ] as const)
        expect(run(cancelled, command, ["x"]).decision).toEqual({ ok: false, reason: "invalid_transition" });
    });

    it("refuses a Fulfilled Bill", () => {
      expect(run(delivered(), { type: "CancelBill", billId: "b-2" }, ["r-1"]).decision).toEqual({ ok: false, reason: "invalid_transition" });
    });
  });

  describe("ReturnBill (after delivery, before submission)", () => {
    // A ₹600.00 shop Expense whose Bill is Fulfilled and has its document: ready.
    const ready = (): Slice => {
      const logged = decide(fresh, logExpense("shop", 60000), mickey, now);
      if (!logged.ok) throw new Error("expected Ok");
      const slice = logged.events.reduce(apply, fresh);
      slice.expenses["e-1"]!.bills[0]!.paperlessId = 7;
      return slice;
    };

    it("Return of a ready Bill: ₹600.00 → cancelled, and an expected Refund of ₹600.00, reason returned", () => {
      expect(derived(ready()).bills).toEqual(["ready"]);
      const { decision, slice } = run(ready(), { type: "ReturnBill", billId: "b-1" }, ["r-1"]);
      expect(decision).toEqual({
        ok: true,
        jobs: [],
        events: [
          { type: "BillCancelled", billId: "b-1", expenseId: "e-1", reason: "returned" },
          { type: "RefundExpected", refundId: "r-1", expenseId: "e-1", billId: "b-1", amount: rupees(60000), reason: "returned" },
        ],
      });
      expect(derived(slice)).toEqual({ status: "open", openAmount: rupees(0), reason: { code: "refund_owed" }, bills: ["cancelled"] });
    });

    it("a delivered Invoice without its document can be returned too", () => {
      const { slice } = run(delivered(), { type: "ReturnBill", billId: "b-2" }, ["r-1"]);
      expect(derived(slice).bills).toEqual(["expected", "cancelled"]);
      expect(refunds(slice)).toEqual([{ id: "r-1", amount: rupees(120000), reason: "returned", received: false }]);
    });

    it("Cancelled Bill stays cancelled: a returned Bill is never ready again and takes no more commands", () => {
      const { slice } = run(ready(), { type: "ReturnBill", billId: "b-1" }, ["r-1"]);
      const bill = slice.expenses["e-1"]!.bills[0]!;
      expect(bill).toMatchObject({ fulfilledOn: "2026-11-19", paperlessId: 7, cancelled: true });
      expect(deriveBill(bill)).toBe("cancelled");
      expect(deriveBill({ ...bill, claim: null })).toBe("cancelled"); // as after a recall: still cancelled
      for (const command of [
        { type: "ReturnBill", billId: "b-1" },
        { type: "CancelBill", billId: "b-1" },
      ] as const)
        expect(run(slice, command, ["r-2"]).decision).toEqual({ ok: false, reason: "invalid_transition" });
    });

    it("refuses an expected Bill whose goods never came: that is a cancellation", () => {
      expect(run(order(80000), { type: "ReturnBill", billId: "b-1" }, ["r-1"]).decision).toEqual({ ok: false, reason: "invalid_transition" });
    });

    it.each(["submitted", "reimbursed"] as const)("refuses a Bill on a %s Claim as locked (Owed to university waits for Claims)", (claim) => {
      const slice = ready();
      slice.expenses["e-1"]!.bills[0]!.claim = claim;
      expect(run(slice, { type: "ReturnBill", billId: "b-1" }, ["r-1"]).decision).toEqual({ ok: false, reason: "locked" });
    });

    it("a Bill on a draft Claim is returned: taken off the draft, then cancelled, with its Refund", () => {
      const slice = ready();
      slice.expenses["e-1"]!.bills[0]!.claim = "draft";
      const { decision, slice: after } = run(slice, { type: "ReturnBill", billId: "b-1" }, ["r-1"]);
      expect(decision).toEqual({
        ok: true,
        jobs: [],
        events: [
          { type: "BillRemovedFromClaim", billId: "b-1", expenseId: "e-1" },
          { type: "BillCancelled", billId: "b-1", expenseId: "e-1", reason: "returned" },
          { type: "RefundExpected", refundId: "r-1", expenseId: "e-1", billId: "b-1", amount: rupees(60000), reason: "returned" },
        ],
      });
      expect(after.expenses["e-1"]!.bills[0]).toMatchObject({ claim: null, cancelled: true });
      expect(derived(after)).toMatchObject({ openAmount: rupees(0), reason: { code: "refund_owed" }, bills: ["cancelled"] });
    });

    it.each([
      { type: "SplitExpectedBill", billId: "b-1", amount: rupees(100), fulfilledOn: "2026-11-21" },
      { type: "ExpectRefund", billId: "b-1", amount: rupees(100) },
      { type: "CancelBill", billId: "b-1" },
    ] as const)("$type on a Bill on a submitted Claim is locked too", (command) => {
      const slice = order(80000);
      slice.expenses["e-1"]!.bills[0]!.claim = "submitted";
      expect(run(slice, command, ["x"]).decision).toEqual({ ok: false, reason: "locked" });
    });

    it.todo("Claims: returning a Bill on a draft Claim drops it from that Claim's lines and total (needs the Claims table)");
  });

  describe("MarkRefundReceived and settling", () => {
    const cancelled = () => run(order(80000), { type: "CancelBill", billId: "b-1" }, ["r-1"]).slice;
    const received = (refundId = "r-1", refundedOn = "2026-11-25") => ({ type: "MarkRefundReceived", refundId, refundedOn }) as const;

    it("Refund received: the expected Refund is received on its refunded-on date", () => {
      const { decision, slice } = run(cancelled(), received());
      expect(decision).toEqual({
        ok: true,
        jobs: [],
        events: [{ type: "RefundReceived", refundId: "r-1", expenseId: "e-1", refundedOn: "2026-11-25" }],
      });
      expect(refunds(slice)).toEqual([{ id: "r-1", amount: rupees(80000), reason: "cancelled", received: true }]);
    });

    it("Expected Refund blocks settled; received, the fully cancelled Order settles", () => {
      expect(derived(cancelled())).toMatchObject({ status: "open", openAmount: rupees(0), reason: { code: "refund_owed" } });
      expect(derived(run(cancelled(), received()).slice)).toEqual({ status: "settled", openAmount: rupees(0), reason: null, bills: ["cancelled"] });
    });

    it("Several Refunds: a cancelled and a returned Refund both count; settled only once both are received", () => {
      // ₹3,000.00: ₹1,200.00 delivered and returned, the ₹1,800.00 remainder cancelled.
      let slice = run(delivered(), { type: "ReturnBill", billId: "b-2" }, ["r-1"]).slice;
      slice = run(slice, { type: "CancelBill", billId: "b-1" }, ["r-2"]).slice;
      expect(refunds(slice).map((r) => [r.amount.paise, r.reason])).toEqual([
        [120000, "returned"],
        [180000, "cancelled"],
      ]);
      expect(derived(slice).openAmount).toEqual(rupees(0));
      slice = run(slice, received("r-1")).slice;
      expect(derived(slice)).toMatchObject({ status: "open", reason: { code: "refund_owed" } });
      slice = run(slice, received("r-2")).slice;
      expect(derived(slice).status).toBe("settled");
    });

    it("Partly reimbursed Order: the first Invoice reimbursed while ₹1,800.00 is expected → stays open", () => {
      const slice = delivered();
      slice.expenses["e-1"]!.bills[1]!.claim = "reimbursed";
      expect(derived(slice)).toMatchObject({ status: "open", reason: { code: "awaiting_goods" }, bills: ["expected", "reimbursed"] });
    });

    it.each([
      ["receiving it twice", received(), { ok: false, reason: "invalid_transition" }],
      ["a date that does not exist", received("r-1", "2026-11-31"), { ok: false, reason: "validation", field: "refundedOn" }],
      ["a Refund outside the Actor's slice", received("r-9"), { ok: false, reason: "not_found" }],
    ])("refuses %s", (name, command, rejection) => {
      const slice = name === "receiving it twice" ? run(cancelled(), received()).slice : cancelled();
      expect(run(slice, command).decision).toEqual(rejection);
    });
  });
});
