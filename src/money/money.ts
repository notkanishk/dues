// Money is integer paise plus a currency code (platform-foundations; FUNCTIONAL §10).
// ponytail: `number`, not `bigint`: safe integers reach ₹90 lakh crore, far past any Dues amount, and keep JSON and pg simple.
export type Money = { readonly paise: number; readonly currency: "INR" };

// Indian grouping ("1,00,000"), Western ("100,000") or plain digits; mixed or short groups ("1,50") are not amounts.
const RUPEES = /^₹?\s*(\d{1,2}(?:,\d{2})*,\d{3}|\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/;

/** Reads typed or printed rupees ("2,500.50", "₹1,23,456.7") as paise, by string digits only. Null if it is not an amount. */
export function parseRupees(text: string): Money | null {
  const m = RUPEES.exec(text.trim());
  if (!m) return null;
  const paise = Number(m[1].replaceAll(",", "") + (m[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(paise) ? { paise, currency: "INR" } : null;
}

/** Exact sum; throws if the total leaves the safe-integer range (it never should). */
export function sum(amounts: readonly Money[]): Money {
  const paise = amounts.reduce((total, m) => total + m.paise, 0);
  if (!Number.isSafeInteger(paise)) throw new RangeError("Money sum out of range");
  return { paise, currency: "INR" };
}

const indian = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** Whole rupees and the paise remainder, both integers (no division that can leave a fraction). */
function split(paise: number): { sign: string; rupees: number; rest: string } {
  const abs = Math.abs(paise);
  const rest = abs % 100;
  return { sign: paise < 0 ? "-" : "", rupees: (abs - rest) / 100, rest: String(rest).padStart(2, "0") };
}

/** "₹1,23,456.70": ₹, Indian grouping, always two decimals, paise exactly as stored. */
export function formatRupees(m: Money): string {
  const { sign, rupees, rest } = split(m.paise);
  return `${sign}₹${indian.format(rupees)}.${rest}`;
}

/** A form row's amount: "1180.25/-", no ₹ and no grouping, paise exactly as stored. */
export function formAmount(m: Money): string {
  const { sign, rupees, rest } = split(m.paise);
  return `${sign}${rupees}.${rest}/-`;
}

/** A Claim's total: Σ Claim lines rounded up to whole rupees. The only rounded figure in Dues. */
export function claimTotal(lines: readonly Money[]): Money {
  const { paise } = sum(lines);
  const rest = paise % 100;
  return { paise: rest > 0 ? paise - rest + 100 : paise, currency: "INR" };
}
