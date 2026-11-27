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
  | { readonly type: "newExpense"; readonly askVendor: boolean };

const DAY_MS = 86_400_000;
/** Whole days between two business dates; Date.UTC of a date is a whole number of days in ms, so this is exact. */
const daysApart = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY_MS;

export function propose(facts: DocumentFacts, candidates: readonly CandidateExpense[], config: MatchingConfig = MATCHING): Proposal {
  const fits = candidates.filter(
    (e) => e.openAmount.paise === facts.total.paise && daysApart(e.paidOn, facts.billDate) <= config.billWindowDays,
  );
  if (fits.length === 1) return { type: "attach", expenseId: fits[0].id };
  return { type: "newExpense", askVendor: facts.vendor === null };
}
