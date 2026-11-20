# Python vs TypeScript for the file work: verdict (2026-11-20)

Inputs: [FUNCTIONAL.md](../../FUNCTIONAL.md) (W1, W4, W7), [stack_choice.md](stack_choice.md), [python_vs_ts_facts.md](python_vs_ts_facts.md), `build_ledger.py`, and a read-only look at `Template/Reimbursement Form Template.docx`.

## Decision

- **No, Python is not materially more efficient for this app's file work. Stay all-TypeScript (option C).** No Python sidecar now.
- Run time: the app builds a few forms a month. Filling the docx takes milliseconds in either language; the LibreOffice conversion (seconds) dominates and is the same Gotenberg call from any language.
- Build time: Python's real edge is PDF libraries (pypdf, pikepdf are actively released; pdf-lib is not). Gotenberg, already in the stack, does the merge, so that edge is not needed.
- The form template is simple (one 7-column table, no merged cells, fields or content controls), so docxtemplater's free row loop should cover it. This is reasoned from the file, not yet run: see Spike.
- Options A (all-Python) and B (TS + Python sidecar) each cost more than they save: A drops the Syndra React reuse and still needs a JS UI; B adds a second language, image, dependency set and test runner for about 100 lines of work.
- A sidecar stays a cheap later addition because every file job already sits behind the job queue. Add it only on the triggers under "When to revisit".

## Why

**Fill the docx form (W7)**
- Template facts (inspected): 1 table, 6 rows x 7 columns (header, 4 blank rows, Total row); no `gridSpan`/`vMerge`, no fields, no content controls, no text boxes or images. Header labels ("Name of the Employee:", "Employee Code", "Total Amount in Words:") are each a single run.
- docxtemplater (free core, MIT or GPLv3): tag one row with `{#lines}` ... `{/lines}`, delete the other three blank rows, add tags after the labels. About 20 lines of code. The paid Table module is for column loops, which this form does not need.
- python-docx (the proven approach) has no template engine: rows are cloned in code and text written run by run. It works, but it is more code than the tagged template, not less. docxtpl would be the Python equivalent of docxtemplater; the facts file carries an unconfirmed note that it can drop character styling.
- Either way it needs a tagged copy of the template and a test against the Word output. Python removes neither.

**docx to PDF**
- Gotenberg (LibreOffice) over HTTP. Language-neutral. The fidelity risk (FUNCTIONAL §11 item 3) is LibreOffice vs Word, and is identical in every option.

**Merge PDFs into the submission package (W7)**
- Gotenberg has a PDF merge route, so no PDF library is needed in the app. pdf-lib's last release (1.17.1, 2021-11-06) therefore does not matter.
- Bill files that are images: fetch paperless's archived PDF version of each document rather than the original, so the merge only ever sees PDFs. To confirm on the live paperless (including HEIC uploads).
- If the package can be "form PDF + files in a zip", no merge is needed at all. Worth asking before building the merge.

**Parse OCR text (W1, W4)**
- paperless supplies the text. The work is regex and heuristics over strings plus fixture tests; Node and Python are equal here.
- Python's one candidate, invoice2data, is built for per-vendor YAML templates over PDF invoices. W1 needs an app-agnostic parser for payment screenshots, which it does not provide. Not a reason to add Python.

**Amount in words (Indian system: lakh, crore)**
- About 20 lines and one table of test cases in either language. Not a deciding factor.

**Local vision model (later, maybe)**
- An HTTP call to the GPU host. `ollama-js` exists and is MIT; plain `fetch` also works. No Python needed in the app.

**Upkeep**
- One maintainer already carries Go and TypeScript (Syndra). Python would be a third language, with its own lockfile, image, linter and test runner, in a small LXC that already holds Next.js, a worker, Postgres and Gotenberg.

## What the internet thinks

*Opinion, summarised from the facts file. The search found blogs, vendor pages and forum posts only; no Hacker News or Reddit threads.*

- Small teams: a second language usually costs more than it gives. Keep one core language and add another only for a clear technical case, behind a stable interface.
- A Python backend beside Next.js is worth it when a feature depends on Python libraries or on logic you already maintain in Python (Vercel's own guidance).
- For docx, the advice is the same in both camps: use a template engine to modify an existing file (docxtpl's authors say python-docx is weak at modifying), and write into existing runs to keep formatting.
- Python's PDF libraries are better maintained than Node's; PyMuPDF and the `mupdf` npm package are both AGPL, so neither is a free pass.

## When to revisit

Add a Python sidecar (one worker container, same Postgres queue or a single HTTP endpoint) only if one of these happens:

1. **The spike fails**: docxtemplater output of the real template does not match the Word output after one round of template fixes, and python-docx does match.
2. **PDF content work appears** that Gotenberg cannot do and the app must do itself: reading text or tables out of PDFs that paperless did not OCR well, splitting or rotating pages, stamping, repairing broken PDFs. Then pypdf or pikepdf earn the container.
3. **Extraction needs a Python-only library**: OCR-text regex accuracy on the W1 sample (about 10 confirmations per app) stays too low and the fix is a model or library that runs in-process in Python, not one reachable over HTTP.

Not triggers: a vision model behind an HTTP API, more form fields, more Claimants, or the maintainer's own Mac-side scripts (`build_ledger.py` and Claude helpers can stay Python outside the app).

## Spike

Half a day, before any W7 code. Pass or fail decides trigger 1.

1. Copy the template; in Word, tag one data row (`{#lines}{sno}` in the first cell through `{remarks}{/lines}` in the last), delete the other three blank rows, tag the header labels, the Total cell and the amount in words. Keep the original untouched.
2. Pick one filed Claim as the reference (its docx and its Word-exported PDF from `Filed/`). Fill the tagged template with the same data using docxtemplater + pizzip (`paragraphLoop: true`).
3. Compare docx: unzip both, diff `word/document.xml`. Expect differences only in text and row count; no changed `w:rPr`, `w:tcPr`, `w:tblPr` or column widths.
4. Convert the filled docx with Gotenberg 9 and compare to the Word PDF: same page count, then a rendered-page image diff. Record the result against FUNCTIONAL §11 items 3 and 3a.
5. Edge cases: 1 line, 4 lines, and enough lines to reach page 2 (rows have `cantSplit=0` and `tblHeader=0`, so the header will not repeat; check that matches past forms); a long description that wraps; a total in lakhs for the words line.
6. Fonts: runs use Arial and the file embeds Arial Narrow. Check which font Gotenberg's LibreOffice actually uses; if it substitutes, mount the font into the Gotenberg container. This is the most likely cause of a visual difference and has nothing to do with Python vs Node.
7. Merge: send the form PDF plus two Bill PDFs (one of them a paperless archive of a photo) to Gotenberg's merge route; check order and page count.
8. Keep steps 2 to 4 as the first automated test (golden docx XML and page count), since the project is test-driven.

Unconfirmed, to settle in the spike: Gotenberg's bundled fonts; that paperless archive PDFs exist for every Bill file type; that docxtemplater leaves this template's run formatting untouched (reasoned from how it works, not yet run).
