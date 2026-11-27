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

describe("Auto-attach only on a strong match, anything else raises a Check", () => {
  const gateway = { payee: "GatewayPay Merchant 77" };
  it.each<[string, BillFacts, CandidateExpense[], Proposal]>([
    [
      "vendor matches one of two candidates",
      bill(),
      [expense("E-201", { paidOn: "2026-03-02", vendor: "Fizzy Hardware" }), expense("E-202", { vendor: "Sample Tools" })],
      { type: "attach", expenseId: "E-202" },
    ],
    [
      "the payee counts as the vendor, legal suffixes aside",
      bill(),
      [expense("E-201", gateway), expense("E-202", { payee: "SAMPLE TOOLS PVT. LTD." })],
      { type: "attach", expenseId: "E-202" },
    ],
    ["single candidate, vendor differs (a gateway payee)", bill(), [expense("E-201", gateway)], { type: "attach", expenseId: "E-201" }],
    [
      "order number matches one of two candidates",
      bill({ orderRef: "ORD-5501" }),
      [expense("E-201", gateway), expense("E-202", { ...gateway, orderRef: "ORD-5501" })],
      { type: "attach", expenseId: "E-202" },
    ],
    [
      "two candidates, no vendor or order match: the nearer date is the better fit",
      bill(),
      [expense("E-201", { ...gateway, paidOn: "2026-02-25" }), expense("E-202", { ...gateway, paidOn: "2026-03-02" })],
      { type: "attachWithCheck", expenseId: "E-202", others: ["E-201"] },
    ],
    [
      "two candidates on the same day: the lower Expense ID is the better fit",
      bill(),
      [expense("E-209", gateway), expense("E-201", gateway)],
      { type: "attachWithCheck", expenseId: "E-201", others: ["E-209"] },
    ],
    [
      "two candidates that both match the vendor still raise a Check",
      bill(),
      [expense("E-201", { vendor: "Sample Tools" }), expense("E-202", { vendor: "Sample Tools", paidOn: "2026-03-03" })],
      { type: "attachWithCheck", expenseId: "E-202", others: ["E-201"] },
    ],
  ])("%s", (_, facts, candidates, expected) => {
    expect(propose(facts, candidates)).toEqual(expected);
  });
});

describe("Confirmed matches teach payee aliases", () => {
  it("a learned alias makes the gateway payee count as the vendor", () => {
    const candidates = [
      expense("E-301", { payee: "GatewayPay Merchant 77", payeeStandsFor: ["Sample Tools"] }),
      expense("E-302", { payee: "GatewayPay Merchant 12", paidOn: "2026-03-03" }),
    ];
    expect(propose(bill(), candidates)).toEqual({ type: "attach", expenseId: "E-301" });
  });
});
