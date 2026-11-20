<!-- PROTOTYPE, throwaway -->
# Parsing experiment: Python (uv) vs TypeScript (Bun) invoice text extraction + field parsing

Goal: which extraction + parser combo is best and most CONSISTENT, and are local libs good enough before an LLM pass.
Read-only on the filed-claims folder (`FILED_DIR`, used by `sample.py`), no network except package/model downloads. No LLM here.

## Configuration
Environment variables (all optional; defaults are empty):
- `BUYER_GSTIN`: the reimbursing organisation's own GSTIN. It is printed on most invoices as the buyer and is always discarded, so the seller's GSTIN wins.
- `BUYER_NAME`: case-insensitive regex for the buyer's name as printed on invoices (e.g. the university's legal name). Matching lines are treated as buyer context and never returned as the vendor.
- `FILED_DIR` (`sample.py` only): folder of filed claims to sample from, laid out as `<year>/<Claim>/<files>`.

## Run
```
cd py && uv run python run.py            # py extractors (x2 runs), parse all text dirs with py parser
cd ts && bun run run.ts                  # ts extractors (x2 runs), parse all text dirs with ts parser
cd py && uv run python run.py --parse-only   # re-parse so py parser sees TS text   (and:)
cd ts && bun run run.ts --parse-only         # ts parser sees PY text
uv run --project py python score.py     # needs gold.json; writes report.md
./run_all.sh                             # all four steps + score
```
Outputs: `out/text/<variant>/<id>.txt`, `out/fields/<parser>__<extractor>.json` (parser = py|ts),
`out/meta/<variant>.json` (runtime per file, determinism hash of run1 vs run2, peak RSS, skips/errors).
Page cap: first 4 pages per PDF for every extractor.

## Shared field-extraction spec (implemented identically in py/parse.py and ts/parse.ts)
Input: text. `lines` = split on newline, trim, drop empty. Case-insensitive unless noted.

**total** (float or null). Amount token regex (A):
`(?<![\d.,])(\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)(?!\d|,\d|\.\d|\s*%)`
Token -> number by removing commas (py uses price-parser on the token; ts parseFloat). Plausible: 1 <= v <= 10,000,000.
Tiers of key-line regexes, in order: (1) `grand\s*total`; (2) `total\s+amount|amount\s+payable|net\s+amount|net\s+payable|total\s+payable|amount\s+paid|balance\s+due`;
(3) `\btotal\b` excluding lines matching `sub\s*-?total|total\s+(tax|gst|cgst|sgst|igst|qty|quantity|items|discount)`.
For each tier: collect plausible amounts on matching lines (if a matching line has none, use the next line). First tier with any amount wins, answer = max in tier.
Fallback: max plausible amount on lines containing `₹|rs\.?|inr`; else null. "/-" and Indian grouping are covered by A (the `/-` is just ignored).

**date** (ISO yyyy-mm-dd or null). Candidate regexes: numeric `\b\d{1,2}[/\-.]\d{1,2}[/\-.](?:\d{4}|\d{2})\b`; day-month-name
`\b\d{1,2}(?:st|nd|rd|th)?[ \-/.,]*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[ \-/.,]*\d{2,4}\b`; month-name-day
`\b(?:jan|...|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}\b`.
Each candidate string parsed day-first (py dateparser DATE_ORDER=DMY; ts chrono-node en.GB). Valid: year 2015..2027.
Priority: first line matching `date` (not `due date|birth|expiry|dob`) that has a valid candidate on the line, else on the next line; else first valid candidate anywhere.

**bill_no** (string or null). On each line joined with the next line: label
`\b(?:tax\s+invoice|invoice|inv|bill|receipt|voucher|order|serial)\s*(?:no\b\.?|number|num\b\.?|#|id\b)` then `[\s:#.\-]*` then token `[A-Za-z0-9][A-Za-z0-9\-/_]+`.
First match whose token contains a digit wins; trailing `-/_` stripped.

**gstin**: regex `\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b` (case-sensitive). Buyer context = the same line or the previous 3 lines match
`$BUYER_NAME|bill(?:ed)?\s+to|ship(?:ped)?\s+to|buyer|consignee`. The buyer's own GSTIN (env `BUYER_GSTIN`, the organisation that reimburses) is always discarded. Seller = first remaining GSTIN not in buyer context, else first remaining GSTIN, else null.

**vendor** (string or null). (1) a line matching `sold\s+by|seller|billed\s+from|supplier`: text after the first `:` on that line if non-empty,
else the next line. (2) else the first of the first 12 lines with: 3..60 chars, letters / non-space chars >= 0.6, no digit run of 5+, no `@`/`http`,
and not matching `^(tax\s+)?invoice|bill\s+of\s+supply|cash\s*memo|original|duplicate|receipt|page\s|date|gstin|gst\b|phone|tel\b|invoice\s+no`.
Lines/values matching `$BUYER_NAME` (the buyer) are never used as vendor (rule 1 continues to the next `sold by` line). Result is trimmed, `*,:-` stripped from ends.
