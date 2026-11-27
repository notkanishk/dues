import { describe, expect, it } from "vitest";
import { type BillFacts, type CandidateExpense, type Proposal, propose } from "./matching";

// bill-matching spec. Figures are hand-typed fictional amounts; shops are invented, people are cartoon characters.
const rs = (rupees: number, paise = 0) => ({ paise: rupees * 100 + paise, currency: "INR" as const });

const expense = (id: string, over: Partial<CandidateExpense> = {}): CandidateExpense => ({
  id,
  kind: "shop",
  paidOn: "2026-03-01",
  payment: rs(1180),
  openAmount: rs(1180),
  payee: null,
  vendor: null,
  payeeStandsFor: [],
  orderRef: null,
  payback: false,
  invoiceOnly: false,
  references: [],
  proofReceivedAt: null,
  ...over,
});

const bill = (over: Partial<BillFacts> = {}): BillFacts => ({
  type: "bill",
  total: rs(1180),
  billDate: "2026-03-04",
  vendor: "Sample Tools",
  platform: null,
  orderRef: null,
  expenseId: null,
  ...over,
});

describe("Candidate Expenses for a bill", () => {
  it.each<[string, BillFacts, CandidateExpense[], Proposal]>([
    ["clear candidate: one Expense of ₹1,180.00, 3 days earlier, under any payee name", bill(), [expense("E-101", { payee: "Courage Kirana" })], { type: "attach", expenseId: "E-101" }],
    ["amount differs: Open amount ₹1,000.00 against a ₹1,180.00 bill", bill(), [expense("E-101", { openAmount: rs(1000), payment: rs(1000) })], { type: "newExpense", askVendor: false }],
    ["day 10 is inside the window", bill({ billDate: "2026-03-11" }), [expense("E-101")], { type: "attach", expenseId: "E-101" }],
    ["day 10 before is inside the window", bill({ billDate: "2026-02-19" }), [expense("E-101")], { type: "attach", expenseId: "E-101" }],
    ["day 11 is outside the window", bill({ billDate: "2026-03-12" }), [expense("E-101")], { type: "newExpense", askVendor: false }],
    ["day 11 before is outside the window", bill({ billDate: "2026-02-18" }), [expense("E-101")], { type: "newExpense", askVendor: false }],
    ["a shop Expense with a larger Open amount is no candidate", bill(), [expense("E-101", { openAmount: rs(2000), payment: rs(2000) })], { type: "newExpense", askVendor: false }],
  ])("%s", (_, facts, candidates, expected) => {
    expect(propose(facts, candidates)).toEqual(expected);
  });
});

describe("No match logs a new Expense", () => {
  it("a ₹640.00 bill of 4 March with no candidate logs a new Expense", () => {
    expect(propose(bill({ total: rs(640) }), [])).toEqual({ type: "newExpense", askVendor: false });
  });

  it("an unreadable vendor makes review ask for it once", () => {
    expect(propose(bill({ total: rs(640), vendor: null }), [])).toEqual({ type: "newExpense", askVendor: true });
  });
});
