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
  upiRefs: [],
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

  it("a blank vendor is an unreadable one", () => {
    expect(propose(bill({ total: rs(640), vendor: "  " }), [])).toEqual({ type: "newExpense", askVendor: true });
  });

  it("a ₹0.00 bill has no candidates, not even a settled Expense or a larger Order", () => {
    const candidates = [expense("E-110", { openAmount: rs(0) }), expense("E-111", { kind: "online", vendor: "Sample Tools", openAmount: rs(4870) })];
    expect(propose(bill({ total: rs(0) }), candidates)).toEqual({ type: "newExpense", askVendor: false });
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
    [
      "a leading \"the\" and trailing legal words aside, the names are equal",
      bill({ vendor: "The Sample Tools Private Limited" }),
      [expense("E-203", gateway), expense("E-204", { vendor: "Sample Tools LLP" })],
      { type: "attach", expenseId: "E-204" },
    ],
    [
      "\"The Hardware Co\" is not \"Hardware Ltd\": \"Co\" is part of the name",
      bill({ vendor: "The Hardware Co" }),
      [expense("E-205", { vendor: "Hardware Ltd" }), expense("E-206", { ...gateway, paidOn: "2026-03-04" })],
      { type: "attachWithCheck", expenseId: "E-206", others: ["E-205"] },
    ],
    [
      "legal words mid-name are kept: \"Private Label Tools\" is not \"Label Tools Ltd\"",
      bill({ vendor: "Private Label Tools" }),
      [expense("E-207", { vendor: "Label Tools Ltd" }), expense("E-208", { ...gateway, paidOn: "2026-03-04" })],
      { type: "attachWithCheck", expenseId: "E-208", others: ["E-207"] },
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
    [
      "an order number leads the Check even 20 days away: ahead of the exact one in the window",
      bill({ orderRef: "ORD-5502" }),
      [expense("E-223", { ...gateway, orderRef: "ORD-5502", paidOn: "2026-02-12" }), expense("E-224", gateway)],
      { type: "attachWithCheck", expenseId: "E-223", others: ["E-224"] },
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
    [
      "shop matches on day 11: not attached automatically, a Check instead of a second Expense",
      invoice({ billDate: "2026-03-12" }),
      [order("E-404", { vendor: "Sample Tools" })],
      { type: "attachWithCheck", expenseId: "E-404", others: [] },
    ],
    [
      "shop matches 60 days on: still a Check, for an Order waits for its invoices however long",
      invoice({ billDate: "2026-04-30" }),
      [order("E-404", { vendor: "Sample Tools" })],
      { type: "attachWithCheck", expenseId: "E-404", others: [] },
    ],
    [
      "two same-shop Orders outside the window: a Check on the nearer",
      invoice({ billDate: "2026-03-20" }),
      [order("E-410", { vendor: "Sample Tools" }), order("E-411", { vendor: "Sample Tools", paidOn: "2026-03-05" })],
      { type: "attachWithCheck", expenseId: "E-411", others: ["E-410"] },
    ],
    ["another shop's Order outside the window: a new Expense", invoice({ billDate: "2026-03-12" }), [order("E-412", { vendor: "Fizzy Hardware" })], { type: "newExpense", askVendor: false }],
    [
      "a same-shop Order outside the window with no more open than the bill: a new Expense",
      invoice({ billDate: "2026-03-12" }),
      [order("E-413", { vendor: "Sample Tools", openAmount: rs(2100) })],
      { type: "newExpense", askVendor: false },
    ],
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
    [
      "a ₹300.00 café bill never auto-splits a ₹4,870.00 online Payback: the vendor bypass is for the exact amount only",
      bill({ total: rs(300), vendor: "Courage Cafe" }),
      [order("E-407", { payback: true, payee: "Dexter" })],
      { type: "attachWithCheck", expenseId: "E-407", others: [] },
    ],
    [
      "an exact-amount candidate stops any split: a ₹1,180.00 Sample Tools bill, a ₹1,180.00 gateway-paid shop Expense and a ₹4,870.00 Sample Tools Order",
      bill(),
      [expense("E-408", { payee: "GatewayPay Merchant 12" }), order("E-409", { vendor: "Sample Tools" })],
      { type: "attachWithCheck", expenseId: "E-408", others: ["E-409"] },
    ],
    [
      "an order number leads the Check: a ₹2,100.00 bill for ORD-4870 beside an unrelated ₹2,100.00 café Expense",
      invoice({ orderRef: "ORD-4870" }),
      [order("E-414", { orderRef: "ORD-4870", vendor: "Sample Tools" }), expense("E-415", { payee: "Courage Cafe", payment: rs(2100), openAmount: rs(2100), paidOn: "2026-03-04" })],
      { type: "attachWithCheck", expenseId: "E-414", others: ["E-415"] },
    ],
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
  const payback = (id: string, over: Partial<CandidateExpense> = {}) =>
    expense(id, { paidOn: "2026-03-01", payment: rs(900), openAmount: rs(900), payee: "Dexter", vendor: "Fizzy Hardware", payback: true, ...over });
  const gatewayPaid = (id: string, over: Partial<CandidateExpense> = {}) =>
    expense(id, { paidOn: "2026-03-03", payment: rs(900), openAmount: rs(900), payee: "GatewayPay Merchant 12", ...over });

  it("a ₹900.00 bill from any vendor 2 days after a ₹900.00 Payback, its only candidate, matches it with no vendor comparison", () => {
    expect(propose(bill({ total: rs(900), billDate: "2026-03-03" }), [payback("E-701")])).toEqual({ type: "attach", expenseId: "E-701" });
  });

  it("skipping the vendor check is not passing it: beside an equally exact gateway-paid Expense, a Check, the Payback first", () => {
    const facts = bill({ total: rs(900), billDate: "2026-03-03" });
    expect(propose(facts, [payback("E-701"), gatewayPaid("E-702")])).toEqual({ type: "attachWithCheck", expenseId: "E-701", others: ["E-702"] });
  });

  it("a Payback beside a vendor-matched Expense of the same amount still raises a Check", () => {
    const facts = bill({ total: rs(900), billDate: "2026-03-03" });
    const candidates = [payback("E-711"), gatewayPaid("E-712", { vendor: "Sample Tools" })];
    expect(propose(facts, candidates)).toEqual({ type: "attachWithCheck", expenseId: "E-712", others: ["E-711"] });
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
  upiRef: "612345678901",
  receivedAt: "2026-03-06T09:14:10Z",
  ...over,
});

// An Expense logged from a ₹1,180.00 Sample Tools invoice of 4 March, still waiting for its Payment proof.
const invoiceOnly = (id: string, over: Partial<CandidateExpense> = {}) =>
  expense(id, { paidOn: "2026-03-04", vendor: "Sample Tools", openAmount: rs(0), invoiceOnly: true, ...over });

describe("Same reference means same Payment", () => {
  it("a second confirmation with the same UPI reference attaches as Payment proof, whatever it reads", () => {
    const candidates = [expense("E-801", { upiRefs: ["612345678901"], payee: "Fizzy Hardware" })];
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
    [
      "two identical invoice-only Expenses tie: attached to neither, a new Expense",
      payment(),
      [invoiceOnly("E-805"), invoiceOnly("E-804")],
      NEW_EXPENSE,
    ],
  ])("%s", (_, facts, candidates, expected) => {
    expect(propose(facts, candidates)).toEqual(expected);
  });
});

describe("\"Same payment as E-x?\" without a reference", () => {
  const unreadable = (id: string, receivedAt: string) => expense(id, { upiRefs: [], proofReceivedAt: receivedAt, payee: "Fizzy Hardware" });
  const second = payment({ upiRef: null, amount: null, payee: null, receivedAt: "2026-03-06T09:14:10Z" });

  it.each<[string, CandidateExpense[], Proposal]>([
    ["6 minutes apart: offered", [unreadable("E-901", "2026-03-06T09:08:10Z")], { type: "samePaymentSuggestion", expenseId: "E-901" }],
    ["10 minutes apart: offered", [unreadable("E-901", "2026-03-06T09:04:10Z")], { type: "samePaymentSuggestion", expenseId: "E-901" }],
    ["11 minutes apart: no offer", [unreadable("E-901", "2026-03-06T09:03:10Z")], { type: "newExpense", askVendor: false }],
    [
      "an earlier confirmation that had a UPI reference: no offer",
      [expense("E-902", { upiRefs: ["612345678901"], proofReceivedAt: "2026-03-06T09:10:10Z" })],
      { type: "newExpense", askVendor: false },
    ],
  ])("%s", (_, candidates, expected) => {
    expect(propose(second, candidates)).toEqual(expected);
  });

  it("a blank UPI reference is no reference: offered", () => {
    expect(propose({ ...second, upiRef: " " }, [unreadable("E-901", "2026-03-06T09:08:10Z")])).toEqual({ type: "samePaymentSuggestion", expenseId: "E-901" });
  });

  it("a confirmation with a readable UPI reference gets no offer", () => {
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
    ["a payee unlike the vendor: none", payment({ amount: rs(1500), payee: "Fizzy Hardware" }), [inv("E-951", 900), inv("E-952", 600)], NEW_EXPENSE],
    ["an unreadable payee: suggested", payment({ amount: rs(1500), payee: null }), [inv("E-951", 900), inv("E-952", 600)], { type: "mergeSuggestion", expenseIds: ["E-951", "E-952"] }],
    [
      "a gateway payee through a learned alias: suggested",
      payment({ amount: rs(1500), payee: "GatewayPay Merchant 77", payeeStandsFor: ["Sample Tools"] }),
      [inv("E-951", 900), inv("E-952", 600)],
      { type: "mergeSuggestion", expenseIds: ["E-951", "E-952"] },
    ],
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

// The Opus review's probe, kept as fixed rows: each once proposed money against the wrong Expense, or none.
describe("Review probe rows", () => {
  const confirmation = (over: Partial<PaymentFacts> = {}) =>
    payment({ amount: rs(1500), paidOn: "2026-03-06", payee: "Fizzy Hardware", upiRef: "6123", receivedAt: "2026-03-06T09:00:00Z", ...over });
  const order4870 = { kind: "online", payment: rs(4870), openAmount: rs(4870) } as const;
  const invoice = { invoiceOnly: true, vendor: "Sample Tools", openAmount: rs(0) } as const;
  it.each<[string, BillFacts | PaymentFacts, CandidateExpense[], Proposal]>([
    ["1 a ₹300.00 café bill and a ₹4,870.00 online Payback", bill({ total: rs(300), vendor: "Random Cafe" }), [expense("E-1", { ...order4870, payback: true, payee: "Dexter" })], { type: "attachWithCheck", expenseId: "E-1", others: [] }],
    ["2 an exact gateway-paid shop Expense and a larger same-shop Order", bill(), [expense("E-1", { payee: "GatewayPay" }), expense("E-2", { ...order4870, vendor: "Sample Tools" })], { type: "attachWithCheck", expenseId: "E-1", others: ["E-2"] }],
    ["3 \"The Hardware Co\" against \"Hardware Ltd\", two exact", bill({ vendor: "The Hardware Co" }), [expense("E-1", { vendor: "Hardware Ltd" }), expense("E-2", { payee: "GatewayPay", paidOn: "2026-03-04" })], { type: "attachWithCheck", expenseId: "E-2", others: ["E-1"] }],
    [
      "4 a Payback against an exact gateway-paid Expense",
      bill({ total: rs(900) }),
      [expense("E-1", { payback: true, payee: "Dexter", payment: rs(900), openAmount: rs(900) }), expense("E-2", { payee: "GatewayPay", payment: rs(900), openAmount: rs(900), paidOn: "2026-03-04" })],
      { type: "attachWithCheck", expenseId: "E-1", others: ["E-2"] },
    ],
    ["5 a merge with payee Fizzy Hardware for Sample Tools invoices", confirmation(), [expense("E-1", { ...invoice, payment: rs(900) }), expense("E-2", { ...invoice, payment: rs(600) })], NEW_EXPENSE],
    ["6 a ₹0.00 bill against a settled Expense", bill({ total: rs(0) }), [expense("E-1", { openAmount: rs(0) })], NEW_EXPENSE],
    ["7 a confirmation fitting two identical invoice-only Expenses", confirmation({ amount: rs(1180), payee: "Sample Tools" }), [expense("E-2", invoice), expense("E-1", invoice)], NEW_EXPENSE],
    ["8 a blank vendor with no candidate", bill({ vendor: "" }), [], { type: "newExpense", askVendor: true }],
    ["9 an order number match for a larger bill outside the window", bill({ total: rs(9000), orderRef: "O1", billDate: "2026-06-01" }), [expense("E-1", { orderRef: "O1" })], { type: "attachWithCheck", expenseId: "E-1", others: [] }],
    ["10 a blank reference two minutes after another", confirmation({ upiRef: "", amount: null }), [expense("E-1", { proofReceivedAt: "2026-03-06T08:58:00Z" })], { type: "samePaymentSuggestion", expenseId: "E-1" }],
  ])("%s", (_, facts, candidates, expected) => {
    expect(propose(facts, candidates)).toEqual(expected);
  });
});

// Property tests: seeded random Claimant books, so a failure reproduces. Names are spelt one way each, so the
// oracle below can compare them with plain equality, independent of how propose normalises names.
describe("propose properties", () => {
  const RUNS = 3000;
  const rng = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const shops = ["Sample Tools", "Fizzy Hardware", "Amazon"];
  const day = (offset: number) => new Date(Date.UTC(2026, 2, 10 + offset)).toISOString().slice(0, 10);

  type World = { facts: BillFacts | PaymentFacts; candidates: CandidateExpense[]; offsets: Map<string, number> };
  const world = (seed: number): World => {
    const r = rng(seed);
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
    const amounts = [600, 900, 1180, 1500, 2100, 4870];
    const offsets = new Map<string, number>();
    const candidates = Array.from({ length: Math.floor(r() * 7) }, (_, i) => {
      const id = `E-${100 + i}`;
      const offset = Math.floor(r() * 31) - 15;
      offsets.set(id, offset);
      const amount = rs(pick(amounts));
      return expense(id, {
        kind: pick(["shop", "online", "service"] as const),
        paidOn: day(offset),
        payment: amount,
        openAmount: r() < 0.2 ? rs(0) : amount,
        vendor: pick([...shops, null]),
        payee: pick(["GatewayPay Merchant 77", "Sample Tools", null]),
        payeeStandsFor: r() < 0.2 ? [pick(shops)] : [],
        orderRef: pick(["ORD-1", "ORD-2", null, null]),
        payback: r() < 0.15,
        invoiceOnly: r() < 0.4,
        upiRefs: r() < 0.3 ? [pick(["611111111111", "622222222222"])] : [],
        proofReceivedAt: r() < 0.4 ? `2026-03-10T09:${String(Math.floor(r() * 30)).padStart(2, "0")}:00Z` : null,
      });
    });
    const facts =
      r() < 0.6
        ? bill({
            total: rs(pick(amounts)),
            billDate: day(0),
            vendor: pick([...shops, null]),
            platform: r() < 0.2 ? "Amazon" : null,
            orderRef: pick(["ORD-1", "ORD-2", null, null]),
            expenseId: r() < 0.1 ? pick(["E-100", "E-101", "E-999"]) : null,
          })
        : payment({
            amount: r() < 0.9 ? rs(pick(amounts), pick([0, 50, -50, 101])) : null,
            paidOn: day(0),
            payee: pick([...shops, "GatewayPay Merchant 77"]),
            payeeStandsFor: r() < 0.3 ? [pick(shops)] : [],
            upiRef: pick(["611111111111", "633333333333", null]),
            receivedAt: "2026-03-10T09:20:00Z",
          });
    return { facts, candidates, offsets };
  };
  const named = (p: Proposal): string[] =>
    p.type === "newExpense" ? [] : p.type === "mergeSuggestion" ? [...p.expenseIds] : p.type === "attachWithCheck" ? [p.expenseId, ...p.others] : [p.expenseId];
  const shuffled = <T,>(xs: readonly T[], r: () => number) => {
    const out = [...xs];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };

  it("never names an Expense outside its candidates, nor one twice", () => {
    for (let seed = 1; seed <= RUNS; seed++) {
      const { facts, candidates } = world(seed);
      const ids = named(propose(facts, candidates));
      expect(ids.every((id) => candidates.some((e) => e.id === id))).toBe(true);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("is deterministic: any order of the candidates gives the same Proposal", () => {
    for (let seed = 1; seed <= RUNS; seed++) {
      const { facts, candidates } = world(seed);
      const once = propose(facts, candidates);
      expect(propose(facts, candidates)).toEqual(once);
      expect(propose(facts, shuffled(candidates, rng(seed * 7919)))).toEqual(once);
    }
  });

  // The oracle reads only the spec ("Auto-attach only on a strong match", "A smaller invoice splits the Order"), the
  // generator's own day offsets and plain name equality; it never asks propose how it reads names, dates or Paybacks.
  const oracle = (facts: BillFacts, candidates: readonly CandidateExpense[], offsets: Map<string, number>) => {
    const inWindow = (c: CandidateExpense) => Math.abs(offsets.get(c.id)!) <= 10;
    const exact = (c: CandidateExpense) => c.openAmount.paise === facts.total.paise;
    const larger = (c: CandidateExpense) => c.kind === "online" && c.openAmount.paise > facts.total.paise;
    const order = (c: CandidateExpense) => facts.orderRef !== null && c.orderRef === facts.orderRef;
    const shop = facts.platform ?? facts.vendor;
    const vendor = (c: CandidateExpense) => shop !== null && [c.vendor, c.payee, ...c.payeeStandsFor].includes(shop);
    const candidate = (c: CandidateExpense) => (inWindow(c) && (exact(c) || larger(c))) || order(c);
    const count = candidates.filter(candidate).length;
    return {
      /** May auto-attach: the spec's conditions, nothing more. */
      allowed: (e: CandidateExpense) => inWindow(e) && ((exact(e) && (vendor(e) || order(e) || count === 1)) || (larger(e) && (order(e) || vendor(e)))),
      /** Must auto-attach: exact, in the window, vendor or order number matches, and no other exact candidate. */
      strong: (e: CandidateExpense) => inWindow(e) && exact(e) && (vendor(e) || order(e)) && !candidates.some((c) => c !== e && candidate(c) && exact(c)),
    };
  };

  it("attaches a bill only when the auto-attach conditions hold", () => {
    let attaches = 0;
    for (let seed = 1; seed <= RUNS; seed++) {
      const { facts, candidates, offsets } = world(seed);
      if (facts.type !== "bill" || facts.expenseId !== null) continue;
      const p = propose(facts, candidates);
      if (p.type !== "attach") continue;
      attaches++;
      expect(oracle(facts, candidates, offsets).allowed(candidates.find((c) => c.id === p.expenseId)!), `seed ${seed}`).toBe(true);
    }
    expect(attaches).toBeGreaterThan(50); // the generator does reach the rule
  });

  it("does attach a bill on a strong match", () => {
    let strong = 0;
    for (let seed = 1; seed <= RUNS; seed++) {
      const { facts, candidates, offsets } = world(seed);
      if (facts.type !== "bill" || facts.expenseId !== null) continue;
      const e = candidates.find(oracle(facts, candidates, offsets).strong);
      if (!e) continue;
      strong++;
      expect(propose(facts, candidates), `seed ${seed}`).toEqual({ type: "attach", expenseId: e.id });
    }
    expect(strong).toBeGreaterThan(50);
  });

});
