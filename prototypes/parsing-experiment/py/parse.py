# PROTOTYPE, throwaway. Python side of the shared field spec (see ../README.md). Keep in sync with ts/parse.ts.
import os
import re
import dateparser
from price_parser import Price

AMT = re.compile(r"(?<![\d.,])(\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)(?!\d|,\d|\.\d|\s*%)")
TIERS = [
    re.compile(r"grand\s*total", re.I),
    re.compile(r"total\s+amount|amount\s+payable|net\s+amount|net\s+payable|total\s+payable|amount\s+paid|balance\s+due", re.I),
    re.compile(r"\btotal\b", re.I),
]
TOTAL_EXCL = re.compile(r"sub\s*-?total|total\s+(tax|gst|cgst|sgst|igst|qty|quantity|items|discount)", re.I)
CUR = re.compile(r"₹|rs\.?|inr", re.I)
MON = r"(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)"
DATES = [
    re.compile(r"\b\d{1,2}[/\-.]\d{1,2}[/\-.](?:\d{4}|\d{2})\b"),
    re.compile(r"\b\d{1,2}(?:st|nd|rd|th)?[ \-/.,]*" + MON + r"[a-z]*[ \-/.,]*\d{2,4}\b", re.I),
    re.compile(r"\b" + MON + r"[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}\b", re.I),
]
DATE_LABEL = re.compile(r"date", re.I)
DATE_BAD = re.compile(r"due date|birth|expiry|dob", re.I)
BILL = re.compile(
    r"\b(?:tax\s+invoice|invoice|inv|bill|receipt|voucher|order|serial)\s*(?:no\b\.?|number|num\b\.?|#|id\b)[\s:#.\-]*([A-Za-z0-9][A-Za-z0-9\-/_]+)",
    re.I)
GSTIN = re.compile(r"\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b")
BUYER_GSTIN = os.environ.get("BUYER_GSTIN", "")  # the claiming organisation's own GSTIN; always discarded
_BN = os.environ.get("BUYER_NAME", "")  # regex for the buyer's name as printed on invoices; never used as vendor
BUYER_NAME = re.compile(_BN or r"(?!)", re.I)
BUYER = re.compile((_BN + "|" if _BN else "") + r"bill(?:ed)?\s+to|ship(?:ped)?\s+to|buyer|consignee", re.I)
SOLD = re.compile(r"sold\s+by|seller|billed\s+from|supplier", re.I)
JUNK = re.compile(r"^(tax\s+)?invoice|bill\s+of\s+supply|cash\s*memo|original|duplicate|receipt|page\s|date|gstin|gst\b|phone|tel\b|invoice\s+no", re.I)


def _num(tok):
    p = Price.fromstring(tok)
    return float(p.amount) if p.amount is not None else None


def _amounts(line):
    out = []
    for m in AMT.finditer(line):
        v = _num(m.group(1))
        if v is not None and 1 <= v <= 10_000_000:
            out.append(v)
    return out


def _total(lines):
    for rx in TIERS:
        found = []
        for i, l in enumerate(lines):
            if not rx.search(l) or TOTAL_EXCL.search(l):
                continue
            a = _amounts(l)
            if not a and i + 1 < len(lines):
                a = _amounts(lines[i + 1])
            found += a
        if found:
            return max(found)
    cur = [a for l in lines if CUR.search(l) for a in _amounts(l)]
    return max(cur) if cur else None


def _parse_date(s):
    d = dateparser.parse(s, settings={"DATE_ORDER": "DMY"}, languages=["en"])
    return d.date().isoformat() if d and 2015 <= d.year <= 2027 else None


def _dates_in(line):
    out = []
    for rx in DATES:
        for m in rx.finditer(line):
            out.append((m.start(), m.group(0)))
    out.sort()
    for _, s in out:
        d = _parse_date(s)
        if d:
            return d
    return None


def _date(lines):
    for i, l in enumerate(lines):
        if DATE_LABEL.search(l) and not DATE_BAD.search(l):
            d = _dates_in(l) or (_dates_in(lines[i + 1]) if i + 1 < len(lines) else None)
            if d:
                return d
    for l in lines:
        d = _dates_in(l)
        if d:
            return d
    return None


def _bill(lines):
    for i, l in enumerate(lines):
        j = l + " " + (lines[i + 1] if i + 1 < len(lines) else "")
        for m in BILL.finditer(j):
            t = m.group(1).rstrip("-/_")
            if re.search(r"\d", t):
                return t
    return None


def _gstin(lines):
    allg = []
    for i, l in enumerate(lines):
        ctx = " ".join(lines[max(0, i - 3): i + 1])
        for m in GSTIN.finditer(l):
            if m.group(0) == BUYER_GSTIN:
                continue
            allg.append((m.group(0), bool(BUYER.search(ctx))))
    for g, buyer in allg:
        if not buyer:
            return g
    return allg[0][0] if allg else None


def _vendor(lines):
    for i, l in enumerate(lines):
        if SOLD.search(l):
            after = l.split(":", 1)[1].strip() if ":" in l else ""
            v = after or (lines[i + 1] if i + 1 < len(lines) else "")
            if BUYER_NAME.search(v):
                continue
            return v.strip(" *,:-") or None
    for l in lines[:12]:
        nospace = re.sub(r"\s", "", l)
        if not (3 <= len(l) <= 60) or not nospace:
            continue
        if sum(c.isalpha() for c in nospace) / len(nospace) < 0.6:
            continue
        if re.search(r"\d{5,}|@|http", l, re.I) or JUNK.search(l) or BUYER_NAME.search(l):
            continue
        return l.strip(" *,:-")
    return None


def parse(text):
    lines = [x.strip() for x in re.split(r"\r?\n", text) if x.strip()]
    return {"total": _total(lines), "date": _date(lines), "bill_no": _bill(lines),
            "gstin": _gstin(lines), "vendor": _vendor(lines)}
