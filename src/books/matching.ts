// Matching (design §2): which Expense a document belongs to. Pure: no database, no clock, no I/O.
// Only caller: Books, inside LogDocument, under the Claimant's lock (D5). Candidates are the Claimant's own.
import { type Money, minus, sum } from "../money/money";

/** Matching thresholds, named in one place (design §1 Config). */
export const MATCHING = {
  /** A bill's date may be this many days either side of the Expense's paid-on date. */
  billWindowDays: 10,
  /** A late payment confirmation's amount may differ from the invoice-only Expense's Payment by this many paise (±₹1). */
  proofTolerancePaise: 100,
  /** …and its date from the Expense's paid-on date by this many days. */
  proofWindowDays: 10,
  /** Two reference-less confirmations this many minutes apart are offered as the same payment. */
  samePaymentMinutes: 10,
  /** One Payment for several invoices: 2 up to this many invoice-only Expenses from one vendor… */
  mergeMaxInvoices: 3,
  /** …each within this many days of the payment. */
  mergeWindowDays: 10,
} as const;

export type MatchingConfig = { readonly [K in keyof typeof MATCHING]: number };

/** What was read from a bill (Invoice or Informal bill). Dates are business dates, YYYY-MM-DD. */
export type BillFacts = {
  readonly type: "bill";
  readonly total: Money;
  readonly billDate: string;
  readonly vendor: string | null; // null: unreadable
  readonly platform: string | null; // a marketplace (Amazon) is the shop; vendor is then the "Sold by" seller
  readonly orderRef: string | null;
  readonly expenseId: string | null; // set on uploads that already know their Expense
};

/** What was read from a payment confirmation. */
export type PaymentFacts = {
  readonly type: "payment";
  readonly amount: Money | null; // null: couldn't read
  readonly paidOn: string | null;
  readonly payee: string | null;
  readonly payeeStandsFor: readonly string[]; // learned aliases: vendors this payee has stood for
  readonly reference: string | null; // UPI reference, UTR or transaction ID; null: none readable
  readonly receivedAt: string; // ISO instant the confirmation arrived (the "now" of this decision)
};

export type DocumentFacts = BillFacts | PaymentFacts;

/** The slice of one of the Claimant's Expenses that matching reads. */
export type CandidateExpense = {
  readonly id: string;
  readonly kind: "online" | "shop" | "service";
  readonly paidOn: string;
  readonly payment: Money | null;
  readonly openAmount: Money;
  readonly payee: string | null;
  readonly vendor: string | null;
  readonly payeeStandsFor: readonly string[]; // learned aliases: vendors this payee has stood for
  readonly orderRef: string | null;
  readonly payback: boolean;
  readonly invoiceOnly: boolean; // logged from an invoice; no Payment proof yet
  readonly references: readonly string[]; // transaction references of its Payment proofs
  readonly proofReceivedAt: string | null; // ISO instant its reference-less confirmation arrived
};

export type Proposal =
  | { readonly type: "attach"; readonly expenseId: string }
  | { readonly type: "attachWithCheck"; readonly expenseId: string; readonly others: readonly string[] }
  | { readonly type: "attachProof"; readonly expenseId: string }
  | { readonly type: "samePaymentSuggestion"; readonly expenseId: string }
  | { readonly type: "mergeSuggestion"; readonly expenseIds: readonly string[] }
  | { readonly type: "newExpense"; readonly askVendor: boolean };

const DAY_MS = 86_400_000;
/** Whole days between two business dates; Date.UTC of a date is a whole number of days in ms, so this is exact. */
const daysApart = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY_MS;

// Legal-form words that never tell two shops apart, but only at the end of a name ("Private Label Tools" keeps its
// "Private"). "Co" is not one: "Hardware Co" and "Hardware Ltd" may be two shops.
const LEGAL = new Set(["pvt", "private", "ltd", "limited", "llp", "inc"]);
const words = (name: string) => {
  const w = name.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (w[0] === "the") w.shift();
  while (w.length > 0 && LEGAL.has(w[w.length - 1])) w.pop();
  return w.join(" ");
};

// ponytail: names match only when equal after case, punctuation and legal suffixes; learned aliases cover gateways.
// Add fuzzy matching only if confirmed matches show aliases are not enough.
const sameName = (a: string | null, b: string | null) => a !== null && b !== null && words(a) !== "" && words(a) === words(b);

/** The bill's shop is one of the Expense's vendor, its payee, or a vendor its payee has stood for. */
const shopMatches = (shop: string | null, e: CandidateExpense) => [e.vendor, e.payee, ...e.payeeStandsFor].some((name) => sameName(name, shop));

/** A confirmation's payee is the Expense's vendor, or a vendor that payee has stood for. */
const payeeMatches = (facts: PaymentFacts, e: CandidateExpense) => [facts.payee, ...facts.payeeStandsFor].some((name) => sameName(name, e.vendor));

const sameRef = (a: string | null, b: string | null) => a !== null && b !== null && a.trim() !== "" && a.trim() === b.trim();

const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id, "en", { numeric: true });

type Fit = { e: CandidateExpense; order: boolean; vendor: boolean; exact: boolean; days: number; auto: boolean };

/** Better fit first: order number, then vendor, then the exact amount, then the nearer date, then the lower Expense ID. */
const betterFit = (a: Fit, b: Fit) =>
  Number(b.order) - Number(a.order) || Number(b.vendor) - Number(a.vendor) || Number(b.exact) - Number(a.exact) || a.days - b.days || byId(a.e, b.e);

/**
 * Which of the Claimant's candidate Expenses a document belongs to. Deterministic: the same facts and candidates,
 * in any order, give the same Proposal. Never names an Expense outside `candidates`.
 */
export function propose(facts: DocumentFacts, candidates: readonly CandidateExpense[], config: MatchingConfig = MATCHING): Proposal {
  return facts.type === "bill" ? proposeForBill(facts, candidates, config) : proposeForPayment(facts, candidates, config);
}

const NEW_EXPENSE = { type: "newExpense", askVendor: false } as const;
const MINUTE_MS = 60_000;

function proposeForPayment(facts: PaymentFacts, candidates: readonly CandidateExpense[], config: MatchingConfig): Proposal {
  const sorted = [...candidates].sort(byId);
  // The same transaction reference is the same Payment.
  const same = sorted.find((e) => e.references.some((r) => sameRef(facts.reference, r)));
  if (same) return { type: "attachProof", expenseId: same.id };

  // Invoice before payment: a late confirmation completes an invoice-only Expense.
  const { amount, paidOn } = facts;
  if (amount && paidOn) {
    const off = (e: CandidateExpense) => Math.abs(minus(amount, e.payment ?? amount).paise);
    const fit = (a: CandidateExpense, b: CandidateExpense) => off(a) - off(b) || daysApart(a.paidOn, paidOn) - daysApart(b.paidOn, paidOn);
    const proof = sorted
      .filter((e) => e.invoiceOnly && e.payment && off(e) <= config.proofTolerancePaise && daysApart(e.paidOn, paidOn) <= config.proofWindowDays && payeeMatches(facts, e))
      .sort(fit);
    // Two that fit equally well: attaching to either would be a guess, so fall through to the suggestions below.
    if (proof.length > 0 && (proof.length === 1 || fit(proof[0], proof[1]) < 0)) return { type: "attachProof", expenseId: proof[0].id };

    const merge = mergeFor(amount, paidOn, sorted, config);
    if (merge) return { type: "mergeSuggestion", expenseIds: merge };
  }

  // Neither of two confirmations carries a reference: offer the nearer one in time, never merge.
  if (facts.reference === null) {
    const gap = (e: CandidateExpense) => Math.abs(Date.parse(facts.receivedAt) - Date.parse(e.proofReceivedAt!));
    const twin = sorted
      .filter((e) => e.references.length === 0 && e.proofReceivedAt !== null && gap(e) <= config.samePaymentMinutes * MINUTE_MS)
      .sort((a, b) => gap(a) - gap(b));
    if (twin.length > 0) return { type: "samePaymentSuggestion", expenseId: twin[0].id };
  }
  return NEW_EXPENSE;
}

// ponytail: the sum search tries every 2..mergeMaxInvoices subset of each vendor's invoice-only Expenses, capped at the
// MERGE_SEARCH_CEILING nearest in date (C(24,3) = 2,024 triples). Prune by sorted amounts if a vendor ever has more.
const MERGE_SEARCH_CEILING = 24;

/** The invoice-only Expenses from one vendor, within the window, whose Payments sum to the payment ±₹1; fewest, then nearest sum. */
function mergeFor(amount: Money, paidOn: string, sorted: readonly CandidateExpense[], config: MatchingConfig): string[] | null {
  const byVendor = new Map<string, CandidateExpense[]>();
  for (const e of sorted) {
    if (!e.invoiceOnly || !e.payment || e.vendor === null || words(e.vendor) === "" || daysApart(e.paidOn, paidOn) > config.mergeWindowDays) continue;
    byVendor.set(words(e.vendor), [...(byVendor.get(words(e.vendor)) ?? []), e]);
  }
  type Pick = { ids: string[]; off: number };
  const picks: Pick[] = [];
  const consider = (picked: CandidateExpense[]) => {
    const off = Math.abs(minus(amount, sum(picked.map((e) => e.payment!))).paise);
    if (off <= config.proofTolerancePaise) picks.push({ ids: picked.map((e) => e.id).sort((a, b) => byId({ id: a }, { id: b })), off });
  };
  for (const group of byVendor.values()) {
    const pool = [...group].sort((a, b) => daysApart(a.paidOn, paidOn) - daysApart(b.paidOn, paidOn) || byId(a, b)).slice(0, MERGE_SEARCH_CEILING);
    const walk = (from: number, picked: CandidateExpense[]) => {
      if (picked.length >= 2) consider(picked);
      if (picked.length === config.mergeMaxInvoices) return;
      for (let i = from; i < pool.length; i++) walk(i + 1, [...picked, pool[i]]);
    };
    walk(0, []);
  }
  const fewestThenNearest = (a: Pick, b: Pick) => a.ids.length - b.ids.length || a.off - b.off || a.ids.join().localeCompare(b.ids.join(), "en", { numeric: true });
  return picks.sort(fewestThenNearest)[0]?.ids ?? null;
}

function proposeForBill(facts: BillFacts, candidates: readonly CandidateExpense[], config: MatchingConfig): Proposal {
  // An exact Expense ID needs no matching (FUNCTIONAL W2.4).
  const named = candidates.find((e) => sameRef(facts.expenseId, e.id));
  if (named) return { type: "attach", expenseId: named.id };

  const shop = facts.platform ?? facts.vendor; // a marketplace's seller is detail
  const fits = candidates
    .map((e) => {
      const days = daysApart(e.paidOn, facts.billDate);
      const inWindow = days <= config.billWindowDays;
      const exact = e.openAmount.paise === facts.total.paise;
      const smaller = e.kind === "online" && e.openAmount.paise > facts.total.paise;
      const order = sameRef(facts.orderRef, e.orderRef);
      const shopMatched = shopMatches(shop, e);
      // A Payback expects a bill of its amount from any vendor (W9): the vendor check is skipped for that amount only.
      // Skipped is not passed: it ranks the Payback, but never auto-attaches it.
      const fit = { e, order, vendor: shopMatched || (e.payback && exact), exact, days, auto: false };
      // A candidate: exact amount in the window, a larger online Order in the window, or the same order number.
      return (inWindow && (exact || smaller)) || order ? { ...fit, auto: inWindow && (exact || smaller) && (order || shopMatched) } : null;
    })
    .filter((f): f is Fit => f !== null)
    .sort(betterFit);
  if (fits.length === 0) return { type: "newExpense", askVendor: facts.vendor === null };

  // "Exactly one candidate" counts every candidate, larger Orders included. An exact-amount candidate anywhere means
  // no other Expense is split: the bill may be that one, so a Check decides.
  const anyExact = fits.some((f) => f.exact);
  const auto = fits.filter((f) => (f.auto && (f.exact || !anyExact)) || (fits.length === 1 && f.exact && f.days <= config.billWindowDays));
  const byOrder = auto.filter((f) => f.order);
  // A Payback awaiting this exact amount among several candidates is a real rival only a person can rule out.
  const paybackWaits = fits.length > 1 && fits.some((f) => f.e.payback && f.exact);
  const chosen = byOrder.length === 1 ? byOrder[0] : auto.length === 1 && !paybackWaits ? auto[0] : null;
  if (chosen) return { type: "attach", expenseId: chosen.e.id };
  const [best, ...rest] = fits;
  return { type: "attachWithCheck", expenseId: best.e.id, others: rest.map((f) => f.e.id) };
}
