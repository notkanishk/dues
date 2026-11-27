// Matching (design §2): which Expense a document belongs to. Pure: no database, no clock, no I/O.
// Only caller: Books, inside LogDocument, under the Claimant's lock (D5). Candidates are the Claimant's own.
import type { Money } from "../money/money";

/** Matching thresholds, named in one place (design §1 Config). */
export const MATCHING = {
  /** A bill's date may be this many days either side of the Expense's paid-on date. */
  billWindowDays: 10,
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

export type DocumentFacts = BillFacts;

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
  | { readonly type: "newExpense"; readonly askVendor: boolean };

const DAY_MS = 86_400_000;
/** Whole days between two business dates; Date.UTC of a date is a whole number of days in ms, so this is exact. */
const daysApart = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY_MS;

// Legal-form words that never tell two shops apart.
const NOISE = new Set(["pvt", "private", "ltd", "limited", "llp", "inc", "co", "the"]);
const words = (name: string) =>
  name
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w && !NOISE.has(w))
    .join(" ");

// ponytail: names match only when equal after case, punctuation and legal suffixes; learned aliases cover gateways.
// Add fuzzy matching only if confirmed matches show aliases are not enough.
const sameName = (a: string | null, b: string | null) => a !== null && b !== null && words(a) !== "" && words(a) === words(b);

/** The bill's shop is one of the Expense's vendor, its payee, or a vendor its payee has stood for. */
const shopMatches = (shop: string | null, e: CandidateExpense) => [e.vendor, e.payee, ...e.payeeStandsFor].some((name) => sameName(name, shop));

const sameRef = (a: string | null, b: string | null) => a !== null && b !== null && a.trim() !== "" && a.trim() === b.trim();

const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id, "en", { numeric: true });

type Fit = { e: CandidateExpense; order: boolean; vendor: boolean; days: number };

/** Better fit first: order number, then vendor, then the nearer date, then the lower Expense ID. */
const betterFit = (a: Fit, b: Fit) => Number(b.order) - Number(a.order) || Number(b.vendor) - Number(a.vendor) || a.days - b.days || byId(a.e, b.e);

export function propose(facts: DocumentFacts, candidates: readonly CandidateExpense[], config: MatchingConfig = MATCHING): Proposal {
  const fits: Fit[] = candidates
    .map((e) => ({ e, order: sameRef(facts.orderRef, e.orderRef), vendor: shopMatches(facts.vendor, e), days: daysApart(e.paidOn, facts.billDate) }))
    .filter((f) => f.e.openAmount.paise === facts.total.paise && f.days <= config.billWindowDays)
    .sort(betterFit);
  if (fits.length === 0) return { type: "newExpense", askVendor: facts.vendor === null };
  const strong = fits.filter((f) => f.order || f.vendor);
  if (fits.length === 1 || strong.length === 1) return { type: "attach", expenseId: (strong[0] ?? fits[0]).e.id };
  const [best, ...rest] = fits;
  return { type: "attachWithCheck", expenseId: best.e.id, others: rest.map((f) => f.e.id) };
}
