// Money is integer paise plus a currency code (platform-foundations; FUNCTIONAL §10).
// ponytail: `number`, not `bigint`: safe integers reach ₹90 lakh crore, far past any Dues amount, and keep JSON and pg simple.
export type Money = { readonly paise: number; readonly currency: "INR" };

const RUPEES = /^₹?\s*(\d{1,3}(?:,\d{2,3})*|\d+)(?:\.(\d{1,2}))?$/;

/** Reads typed or printed rupees ("2,500.50", "₹1,23,456.7") as paise, by string digits only. Null if it is not an amount. */
export function parseRupees(text: string): Money | null {
  const m = RUPEES.exec(text.trim());
  if (!m) return null;
  const paise = Number(m[1].replaceAll(",", "") + (m[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(paise) ? { paise, currency: "INR" } : null;
}
