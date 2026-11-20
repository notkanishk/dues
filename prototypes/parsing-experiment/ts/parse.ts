// PROTOTYPE, throwaway. TS side of the shared field spec (see ../README.md). Keep in sync with py/parse.py.
import * as chrono from "chrono-node";

const AMT = /(?<![\d.,])(\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)(?!\d|,\d|\.\d|\s*%)/g;
const TIERS = [
  /grand\s*total/i,
  /total\s+amount|amount\s+payable|net\s+amount|net\s+payable|total\s+payable|amount\s+paid|balance\s+due/i,
  /\btotal\b/i,
];
const TOTAL_EXCL = /sub\s*-?total|total\s+(tax|gst|cgst|sgst|igst|qty|quantity|items|discount)/i;
const CUR = /₹|rs\.?|inr/i;
const MON = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)";
const DATES = [
  /\b\d{1,2}[/\-.]\d{1,2}[/\-.](?:\d{4}|\d{2})\b/g,
  new RegExp("\\b\\d{1,2}(?:st|nd|rd|th)?[ \\-/.,]*" + MON + "[a-z]*[ \\-/.,]*\\d{2,4}\\b", "gi"),
  new RegExp("\\b" + MON + "[a-z]*\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}\\b", "gi"),
];
const DATE_LABEL = /date/i;
const DATE_BAD = /due date|birth|expiry|dob/i;
const BILL = /\b(?:tax\s+invoice|invoice|inv|bill|receipt|voucher|order|serial)\s*(?:no\b\.?|number|num\b\.?|#|id\b)[\s:#.\-]*([A-Za-z0-9][A-Za-z0-9\-/_]+)/gi;
const GSTIN = /\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/g;
const BUYER_GSTIN = process.env.BUYER_GSTIN ?? ""; // the claiming organisation's own GSTIN; always discarded
const BN = process.env.BUYER_NAME ?? ""; // regex for the buyer's name as printed on invoices; never used as vendor
const BUYER_NAME = new RegExp(BN || "(?!)", "i");
const BUYER = new RegExp((BN ? BN + "|" : "") + String.raw`bill(?:ed)?\s+to|ship(?:ped)?\s+to|buyer|consignee`, "i");
const SOLD = /sold\s+by|seller|billed\s+from|supplier/i;
const JUNK = /^(tax\s+)?invoice|bill\s+of\s+supply|cash\s*memo|original|duplicate|receipt|page\s|date|gstin|gst\b|phone|tel\b|invoice\s+no/i;

const amounts = (line: string): number[] => {
  const out: number[] = [];
  for (const m of line.matchAll(AMT)) {
    const v = parseFloat(m[1].replace(/,/g, ""));
    if (!isNaN(v) && v >= 1 && v <= 10_000_000) out.push(v);
  }
  return out;
};
const max = (a: number[]) => a.reduce((x, y) => (y > x ? y : x), -Infinity);

function total(lines: string[]): number | null {
  for (const rx of TIERS) {
    let found: number[] = [];
    lines.forEach((l, i) => {
      if (!rx.test(l) || TOTAL_EXCL.test(l)) return;
      let a = amounts(l);
      if (!a.length && i + 1 < lines.length) a = amounts(lines[i + 1]);
      found = found.concat(a);
    });
    if (found.length) return max(found);
  }
  const cur = lines.filter((l) => CUR.test(l)).flatMap(amounts);
  return cur.length ? max(cur) : null;
}

function parseDate(s: string): string | null {
  const d = chrono.en.GB.parseDate(s);
  if (!d) return null;
  const y = d.getFullYear();
  if (y < 2015 || y > 2027) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${y}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function datesIn(line: string): string | null {
  const out: [number, string][] = [];
  for (const rx of DATES) for (const m of line.matchAll(rx)) out.push([m.index!, m[0]]);
  out.sort((a, b) => a[0] - b[0]);
  for (const [, s] of out) {
    const d = parseDate(s);
    if (d) return d;
  }
  return null;
}

function date(lines: string[]): string | null {
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (DATE_LABEL.test(l) && !DATE_BAD.test(l)) {
      const d = datesIn(l) ?? (i + 1 < lines.length ? datesIn(lines[i + 1]) : null);
      if (d) return d;
    }
  }
  for (const l of lines) {
    const d = datesIn(l);
    if (d) return d;
  }
  return null;
}

function bill(lines: string[]): string | null {
  for (let i = 0; i < lines.length; i++) {
    const j = lines[i] + " " + (i + 1 < lines.length ? lines[i + 1] : "");
    for (const m of j.matchAll(BILL)) {
      const t = m[1].replace(/[-/_]+$/, "");
      if (/\d/.test(t)) return t;
    }
  }
  return null;
}

function gstin(lines: string[]): string | null {
  const all: [string, boolean][] = [];
  lines.forEach((l, i) => {
    const ctx = lines.slice(Math.max(0, i - 3), i + 1).join(" ");
    for (const m of l.matchAll(GSTIN)) if (m[0] !== BUYER_GSTIN) all.push([m[0], BUYER.test(ctx)]);
  });
  for (const [g, b] of all) if (!b) return g;
  return all.length ? all[0][0] : null;
}

const strip = (s: string) => s.replace(/^[ *,:-]+|[ *,:-]+$/g, "");

function vendor(lines: string[]): string | null {
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (SOLD.test(l)) {
      const after = l.includes(":") ? l.slice(l.indexOf(":") + 1).trim() : "";
      const v = after || (i + 1 < lines.length ? lines[i + 1] : "");
      if (BUYER_NAME.test(v)) continue;
      return strip(v) || null;
    }
  }
  for (const l of lines.slice(0, 12)) {
    const ns = l.replace(/\s/g, "");
    if (l.length < 3 || l.length > 60 || !ns) continue;
    if ((ns.match(/\p{L}/gu) ?? []).length / ns.length < 0.6) continue;
    if (/\d{5,}|@|http/i.test(l) || JUNK.test(l) || BUYER_NAME.test(l)) continue;
    return strip(l);
  }
  return null;
}

export function parse(text: string) {
  const lines = text.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  return { total: total(lines), date: date(lines), bill_no: bill(lines), gstin: gstin(lines), vendor: vendor(lines) };
}
