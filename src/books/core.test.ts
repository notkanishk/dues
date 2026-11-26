import { describe, expect, it } from "vitest";
import { type Actor, apply, decide, deriveBill, deriveExpense, type ExpenseState, type Slice } from "./core";

// Pure core: no database. Expected values are written by hand from the spec scenarios.
const mickey: Actor = { claimantId: "00000000-0000-7000-8000-00000000000a", roles: ["claimant"], via: "session" };
const now = new Date("2026-11-20T10:00:00Z");
const fresh: Slice = { newIds: ["e-1", "b-1"], expenses: {} };
const rupees = (paise: number) => ({ paise, currency: "INR" as const });

const logExpense = (kind: "online" | "shop" | "service", paise: number) =>
  ({ type: "LogExpense", kind, amount: rupees(paise), paidOn: "2026-11-19", payee: "Robu" }) as const;

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
          payee: "Robu",
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
                bills: [
                  {
                    id: "b-1",
                    kind: null,
                    amount: rupees(paise),
                    fulfilledOn: kind === "online" ? null : paidOn,
                    paperlessId: null,
                    cancelled: false,
                  },
                ],
              },
            },
          });
        }
  });

  it("folds a logged online Expense into an open Expense with an expected Bill", () => {
    const expense = afterLog("online");
    expect(deriveExpense(expense)).toEqual({ status: "open", openAmount: rupees(0) });
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
    })),
    refunds: refunds.map((r) => ({ amount: rupees(r.paise), received: r.received })),
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
    expect(deriveExpense(e)).toEqual({ status: "open", openAmount: rupees(100000) });
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
