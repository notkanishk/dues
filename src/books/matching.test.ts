import { describe, expect, it } from "vitest";
import { type BillFacts, type CandidateExpense, type PaymentFacts, type Proposal, propose } from "./matching";

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

describe("A smaller invoice splits the Order", () => {
  const order = (id: string, over: Partial<CandidateExpense> = {}) =>
    expense(id, { kind: "online", payment: rs(4870), openAmount: rs(4870), payee: "GatewayPay Merchant 77", ...over });
  const invoice = (over: Partial<BillFacts> = {}) => bill({ total: rs(2100), ...over });

  it.each<[string, BillFacts, CandidateExpense[], Proposal]>([
    ["order number matches", invoice({ vendor: "Fizzy Hardware", orderRef: "ORD-4870" }), [order("E-401", { orderRef: "ORD-4870" })], { type: "attach", expenseId: "E-401" }],
    ["shop matches, no order number", invoice(), [order("E-402", { vendor: "Sample Tools" })], { type: "attach", expenseId: "E-402" }],
    ["shop matches through a learned alias", invoice(), [order("E-402", { payeeStandsFor: ["Sample Tools"] })], { type: "attach", expenseId: "E-402" }],
    ["neither matches: the only larger online Expense, with a Check", invoice(), [order("E-403", { vendor: "Fizzy Hardware" })], { type: "attachWithCheck", expenseId: "E-403", others: [] }],
    ["shop matches on day 10", invoice({ billDate: "2026-03-11" }), [order("E-404", { vendor: "Sample Tools" })], { type: "attach", expenseId: "E-404" }],
    ["shop matches on day 11: not attached automatically", invoice({ billDate: "2026-03-12" }), [order("E-404", { vendor: "Sample Tools" })], { type: "newExpense", askVendor: false }],
    [
      "order number matches on day 11: not attached automatically, a Check instead",
      invoice({ billDate: "2026-03-12", orderRef: "ORD-4870" }),
      [order("E-404", { orderRef: "ORD-4870" })],
      { type: "attachWithCheck", expenseId: "E-404", others: [] },
    ],
    [
      "split an online Order: ₹1,200.00 against an expected Bill of ₹3,000.00 by order number",
      bill({ total: rs(1200), orderRef: "ORD-3000" }),
      [order("E-405", { payment: rs(3000), openAmount: rs(3000), orderRef: "ORD-3000" })],
      { type: "attach", expenseId: "E-405" },
    ],
    ["a shop Expense never splits", invoice(), [order("E-406", { kind: "shop", vendor: "Sample Tools" })], { type: "newExpense", askVendor: false }],
  ])("%s", (_, facts, candidates, expected) => {
    expect(propose(facts, candidates)).toEqual(expected);
  });
});

describe("Marketplace invoices match on the platform", () => {
  const amazon = (id: string, over: Partial<CandidateExpense> = {}) =>
    expense(id, { kind: "online", vendor: "Amazon", payment: rs(4870), openAmount: rs(4870), payee: "GatewayPay Merchant 77", ...over });

  it("a different seller never breaks the match: the platform is the shop", () => {
    const facts = bill({ total: rs(2100), vendor: "Sample Seller", platform: "Amazon" });
    expect(propose(facts, [amazon("E-501")])).toEqual({ type: "attach", expenseId: "E-501" });
  });

  it("an exact-amount marketplace invoice picks the platform's Expense out of two", () => {
    const facts = bill({ vendor: "Sample Seller", platform: "Amazon" });
    const candidates = [amazon("E-502", { payment: rs(1180), openAmount: rs(1180) }), expense("E-503", { payee: "GatewayPay Merchant 12" })];
    expect(propose(facts, candidates)).toEqual({ type: "attach", expenseId: "E-502" });
  });

  it("a later invoice from another seller matches its Order's saved order number exactly", () => {
    const facts = bill({ total: rs(900), vendor: "Dexter Components", platform: "Amazon", orderRef: "402-7788" });
    const candidates = [amazon("E-504", { paidOn: "2026-03-03" }), amazon("E-505", { orderRef: "402-7788", openAmount: rs(2770) })];
    expect(propose(facts, candidates)).toEqual({ type: "attach", expenseId: "E-505" });
  });
});

describe("An exact Expense ID short-circuits matching", () => {
  it("attaches to the named Expense whatever its amount or date", () => {
    const facts = bill({ expenseId: "E-610", billDate: "2026-05-01" });
    const candidates = [expense("E-601", { paidOn: "2026-05-01" }), expense("E-610", { openAmount: rs(3000), payment: rs(3000) })];
    expect(propose(facts, candidates)).toEqual({ type: "attach", expenseId: "E-610" });
  });

  it("an Expense ID outside the candidates is ignored", () => {
    expect(propose(bill({ expenseId: "E-999" }), [expense("E-601")])).toEqual({ type: "attach", expenseId: "E-601" });
  });
});

describe("Bill for a Payback matches on amount and date", () => {
  it("a ₹900.00 bill from any vendor 2 days after a ₹900.00 Payback matches it with no vendor comparison", () => {
    const facts = bill({ total: rs(900), billDate: "2026-03-03" });
    const candidates = [
      expense("E-701", { paidOn: "2026-03-01", payment: rs(900), openAmount: rs(900), payee: "Dexter", vendor: "Fizzy Hardware", payback: true }),
      expense("E-702", { paidOn: "2026-03-03", payment: rs(900), openAmount: rs(900), payee: "GatewayPay Merchant 12" }),
    ];
    expect(propose(facts, candidates)).toEqual({ type: "attach", expenseId: "E-701" });
  });

  it("a Payback 11 days away is no candidate", () => {
    const facts = bill({ total: rs(900), billDate: "2026-03-12" });
    expect(propose(facts, [expense("E-701", { payment: rs(900), openAmount: rs(900), payee: "Dexter", payback: true })])).toEqual({ type: "newExpense", askVendor: false });
  });
});

const NEW_EXPENSE: Proposal = { type: "newExpense", askVendor: false };

const payment = (over: Partial<PaymentFacts> = {}): PaymentFacts => ({
  type: "payment",
  amount: rs(1180),
  paidOn: "2026-03-06",
  payee: "Sample Tools",
  payeeStandsFor: [],
  reference: "612345678901",
  receivedAt: "2026-03-06T09:14:10Z",
  ...over,
});

// An Expense logged from a ₹1,180.00 Sample Tools invoice of 4 March, still waiting for its Payment proof.
const invoiceOnly = (id: string, over: Partial<CandidateExpense> = {}) =>
  expense(id, { paidOn: "2026-03-04", vendor: "Sample Tools", openAmount: rs(0), invoiceOnly: true, ...over });

describe("Same reference means same Payment", () => {
  it("a second confirmation with the same UPI reference attaches as Payment proof, whatever it reads", () => {
    const candidates = [expense("E-801", { references: ["612345678901"], payee: "Fizzy Hardware" })];
    expect(propose(payment({ amount: null, payee: null }), candidates)).toEqual({ type: "attachProof", expenseId: "E-801" });
  });
});

describe("Late payment confirmation attaches to the Expense", () => {
  it.each<[string, PaymentFacts, CandidateExpense[], Proposal]>([
    ["within tolerance: ₹1,179.50 for a ₹1,180.00 bill 2 days earlier", payment({ amount: rs(1179, 50) }), [invoiceOnly("E-802")], { type: "attachProof", expenseId: "E-802" }],
    ["₹1 under is inside", payment({ amount: rs(1179) }), [invoiceOnly("E-802")], { type: "attachProof", expenseId: "E-802" }],
    ["₹1 over is inside", payment({ amount: rs(1181) }), [invoiceOnly("E-802")], { type: "attachProof", expenseId: "E-802" }],
    ["₹1.01 under is outside", payment({ amount: rs(1178, 99) }), [invoiceOnly("E-802")], { type: "newExpense", askVendor: false }],
    ["₹1.01 over is outside", payment({ amount: rs(1181, 1) }), [invoiceOnly("E-802")], { type: "newExpense", askVendor: false }],
    ["outside amount tolerance: ₹1,178.00", payment({ amount: rs(1178) }), [invoiceOnly("E-802")], { type: "newExpense", askVendor: false }],
    ["day 10 is inside", payment({ paidOn: "2026-03-14" }), [invoiceOnly("E-802")], { type: "attachProof", expenseId: "E-802" }],
    ["day 11 is outside", payment({ paidOn: "2026-03-15" }), [invoiceOnly("E-802")], { type: "newExpense", askVendor: false }],
    [
      "a gateway payee matches through a learned alias",
      payment({ payee: "GatewayPay Merchant 77", payeeStandsFor: ["Sample Tools"] }),
      [invoiceOnly("E-802")],
      { type: "attachProof", expenseId: "E-802" },
    ],
    ["a payee unlike the vendor is no match", payment({ payee: "GatewayPay Merchant 77" }), [invoiceOnly("E-802")], { type: "newExpense", askVendor: false }],
    ["an Expense that already has its Payment proof is no match", payment(), [invoiceOnly("E-802", { invoiceOnly: false })], { type: "newExpense", askVendor: false }],
    [
      "of two that fit, the nearer amount wins",
      payment({ amount: rs(1180, 50) }),
      [invoiceOnly("E-802", { payment: rs(1179) }), invoiceOnly("E-803", { payment: rs(1181) })],
      { type: "attachProof", expenseId: "E-803" },
    ],
  ])("%s", (_, facts, candidates, expected) => {
    expect(propose(facts, candidates)).toEqual(expected);
  });
});

describe("\"Same payment as E-x?\" without a reference", () => {
  const unreadable = (id: string, receivedAt: string) => expense(id, { references: [], proofReceivedAt: receivedAt, payee: "Fizzy Hardware" });
  const second = payment({ reference: null, amount: null, payee: null, receivedAt: "2026-03-06T09:14:10Z" });

  it.each<[string, CandidateExpense[], Proposal]>([
    ["6 minutes apart: offered", [unreadable("E-901", "2026-03-06T09:08:10Z")], { type: "samePaymentSuggestion", expenseId: "E-901" }],
    ["10 minutes apart: offered", [unreadable("E-901", "2026-03-06T09:04:10Z")], { type: "samePaymentSuggestion", expenseId: "E-901" }],
    ["11 minutes apart: no offer", [unreadable("E-901", "2026-03-06T09:03:10Z")], { type: "newExpense", askVendor: false }],
    [
      "an earlier confirmation that had a reference: no offer",
      [expense("E-902", { references: ["612345678901"], proofReceivedAt: "2026-03-06T09:10:10Z" })],
      { type: "newExpense", askVendor: false },
    ],
  ])("%s", (_, candidates, expected) => {
    expect(propose(second, candidates)).toEqual(expected);
  });

  it("a confirmation with a readable reference gets no offer", () => {
    expect(propose(payment({ amount: null }), [unreadable("E-901", "2026-03-06T09:08:10Z")])).toEqual({ type: "newExpense", askVendor: false });
  });
});

describe("One Payment for several invoices", () => {
  const inv = (id: string, rupees: number, over: Partial<CandidateExpense> = {}) => invoiceOnly(id, { payment: rs(rupees), ...over });

  it.each<[string, PaymentFacts, CandidateExpense[], Proposal]>([
    ["₹1,500.00 for invoices of ₹900.00 and ₹600.00: merge suggested", payment({ amount: rs(1500) }), [inv("E-951", 900), inv("E-952", 600)], { type: "mergeSuggestion", expenseIds: ["E-951", "E-952"] }],
    ["sum within ±₹1: ₹1,499.50", payment({ amount: rs(1499, 50) }), [inv("E-951", 900), inv("E-952", 600)], { type: "mergeSuggestion", expenseIds: ["E-951", "E-952"] }],
    ["sum ₹1.01 off: none", payment({ amount: rs(1498, 99) }), [inv("E-951", 900), inv("E-952", 600)], NEW_EXPENSE],
    [
      "three invoices",
      payment({ amount: rs(1500) }),
      [inv("E-951", 500), inv("E-952", 600), inv("E-953", 400), inv("E-954", 250)],
      { type: "mergeSuggestion", expenseIds: ["E-951", "E-952", "E-953"] },
    ],
    ["four invoices: no merge suggested", payment({ amount: rs(1500) }), [inv("E-951", 400), inv("E-952", 400), inv("E-953", 400), inv("E-954", 300)], NEW_EXPENSE],
    ["two vendors: none", payment({ amount: rs(1500) }), [inv("E-951", 900), inv("E-952", 600, { vendor: "Fizzy Hardware" })], NEW_EXPENSE],
    ["an invoice 11 days from the payment: none", payment({ amount: rs(1500) }), [inv("E-951", 900), inv("E-952", 600, { paidOn: "2026-02-23" })], NEW_EXPENSE],
    ["an invoice 10 days from the payment: suggested", payment({ amount: rs(1500) }), [inv("E-951", 900), inv("E-952", 600, { paidOn: "2026-02-24" })], { type: "mergeSuggestion", expenseIds: ["E-951", "E-952"] }],
    ["an Expense that has its Payment proof is not invoice-only: none", payment({ amount: rs(1500) }), [inv("E-951", 900), inv("E-952", 600, { invoiceOnly: false })], NEW_EXPENSE],
    [
      "of two pairs, the nearer sum wins",
      payment({ amount: rs(1500) }),
      [inv("E-951", 900), inv("E-952", 600, { paidOn: "2026-03-01" }), inv("E-953", 599, { paidOn: "2026-03-05" })],
      { type: "mergeSuggestion", expenseIds: ["E-951", "E-952"] },
    ],
  ])("%s", (_, facts, candidates, expected) => {
    expect(propose(facts, candidates)).toEqual(expected);
  });
});
