# Python vs TypeScript/Node: file-processing libraries (facts only)

Snapshot date: 2026-11-20. No recommendation or verdict is made here.

Conventions:
- Stars and open-issue counts are GitHub API values at fetch time (GitHub API rate limits were hit partway through, so some release data comes from PyPI/npm instead).
- "Latest release" is the version and date shown by the named source. Where no date could be read from a primary source, it is marked UNCONFIRMED (see the UNCONFIRMED section).
- Community items are labelled OPINION and are not facts.

---

## Job 1: Fill an existing .docx template with a variable-length table

### Facts table

| Library | Lang | Licence | Latest release (date) | GitHub stars | Open issues | Table-row loop support | Source |
|---|---|---|---|---|---|---|---|
| python-docx | Python | MIT | 1.2.0, 2025-06-16 (PyPI) | 5,775 | 554 | No template-tag engine. Docs describe "creating and updating" .docx files; rows can be added in code with `table.add_row()` in a loop. Template variables and loops are not mentioned in the docs. | https://github.com/python-openxml/python-docx ; https://pypi.org/pypi/python-docx/json ; https://python-docx.readthedocs.io/en/latest/ |
| docxtpl (python-docx-template, elapouya) | Python | LGPL-2.1 (GitHub page); PyPI says LGPL-2.1-only | 0.20.2, 2025-11-13 (PyPI) | 2,735 | 182 | Yes. Row tags `{%tr ... %}` remove the marker row from output; docs say `{%tr jinja2_tag %}` is for table rows and warn not to use `{%tr` twice in one row. A `{%tr for item in items %}` pattern is implied by that syntax; the fetched text did not show a full example. | https://github.com/elapouya/python-docx-template ; https://docxtpl.readthedocs.io/en/latest/ ; https://pypi.org/pypi/docxtpl/json |
| docx-mailmerge (Bouke) | Python | MIT | 0.5.0, 2019-10-09 (PyPI). Repo is archived; page states archive date 2022-04-16 and author says interest "has faded". | Not fetched (UNCONFIRMED) | Not fetched | Yes. `merge_rows` repeats table rows from a list of dicts, anchored on a MergeField in the template row. | https://github.com/Bouke/docx-mailmerge ; https://pypi.org/pypi/docx-mailmerge/json |
| docx-mailmerge2 (PyPI continuation) | Python | MIT | 1.0.3, 2026-10-19 (PyPI) | Not fetched (UNCONFIRMED) | Not fetched | Row repetition is inherited from the original design; not verified in this pass (UNCONFIRMED). | https://pypi.org/project/docx-mailmerge2/ |
| docxtemplater | Node/JS | Free core: "MIT or GPLv3 (dual licensed)" per pricing page. GitHub API shows NOASSERTION. | 3.71.1 on npm (publish date UNCONFIRMED) | 3,653 | 5 | Yes, in the free tier. Tag-types doc: "To create tables with varying numbers of rows, use loop tags within table cells." Opening loop tag in the first cell, closing in the last cell of the same row. | https://github.com/open-xml-templating/docxtemplater ; https://docxtemplater.com/docs/tag-types/ ; https://registry.npmjs.org/docxtemplater/latest |
| pizzip (required by docxtemplater) | Node/JS | npm: "(MIT OR GPL-3.0)"; GitHub API: NOASSERTION | 3.3.0 on npm (publish date UNCONFIRMED) | 66 | 0 | Not applicable (zip layer). | https://github.com/open-xml-templating/pizzip ; https://registry.npmjs.org/pizzip/latest |
| docxtemplater PRO modules | Node/JS | Commercial, per-year | Pricing page (served from cache per fetch note): One module 500 EUR/yr; PRO 1250 EUR/yr (4 modules); Enterprise 3000 EUR/yr (all modules); Premium 9000 EUR/yr | n/a | n/a | Pricing page lists "Loops" in the free tier. Paid: Table Module ("loop over table columns", builds tables from 2D arrays), Image, HTML, XLSX, Slides, Chart, Subtemplate, Word-run, Footnotes, Styling and others (19 modules listed). | https://docxtemplater.com/pricing/ ; https://docxtemplater.com/docs/tag-types/ (Word-run labelled premium) |
| dolanmiu/docx | Node/JS | MIT | 9.16.0 on npm (publish date UNCONFIRMED) | 6,006 | 6 | Not a template engine. README: "Easily generate and modify .docx files with JS/TS. Works for Node and on the Browser." Table rows are built in code. How existing templates are opened and modified was not confirmed. | https://github.com/dolanmiu/docx ; https://registry.npmjs.org/docx/latest |
| docx-templates (guigrpa) | Node/JS | MIT | 4.15.0 on npm (publish date UNCONFIRMED) | 1,098 | 87 | Yes. Page states: "FOR loops also work over table rows," with `+++FOR ...+++` / `+++END-FOR ...+++` markers in separate rows. | https://github.com/guigrpa/docx-templates ; https://registry.npmjs.org/docx-templates/latest |

### Formatting preservation (facts found)

- python-docx: editing `run.text` keeps run formatting; setting `cell.text` replaces formatting. Source is a secondary tutorial, so UNCONFIRMED against primary docs: https://python.plainenglish.io/translate-a-word-docx-in-python-and-keep-the-formatting-python-docx-run-by-run-tables-included-bb43249e2845 . A forum post citing Stack Overflow question 73487377 says the same thing: https://forum.aspose.com/t/how-to-keep-the-table-cell-text-format-while-updating-the-table-in-docx-python/250990
- docxtpl: a PyPI-page excerpt (via search) says the library removes existing character styling from the template unless a style is set in RichText. Secondary excerpt, UNCONFIRMED: https://pypi.org/project/docxtpl/

---

## Job 2: PDF work (merge, read text, thumbnails)

### Facts table

| Library | Lang | Licence | Latest release (date) | GitHub stars | Open issues | Source |
|---|---|---|---|---|---|---|
| pypdf | Python | BSD-3-Clause (PyPI page); GitHub API NOASSERTION | 7.1.1, 2026-11-18 (PyPI and GitHub release) | 10,303 | 171 | https://github.com/py-pdf/pypdf ; https://pypi.org/project/pypdf/ ; https://api.github.com/repos/py-pdf/pypdf/releases/latest |
| pikepdf | Python (C++ core, qpdf) | MPL-2.0 | 10.18.2, 2026-11-16 (GitHub release and PyPI page) | 2,827 | 17 | https://github.com/pikepdf/pikepdf ; https://pypi.org/project/pikepdf/ |
| PyMuPDF | Python (MuPDF C core) | Dual: "GNU AFFERO GPL 3.0 or Artifex Commercial License" (PyPI page) | Version string "2.1", 2026-11-02 (PyPI and GitHub release). The version number is unusual relative to earlier series; not checked against Artifex docs (UNCONFIRMED). | 11,175 | 86 | https://github.com/pymupdf/PyMuPDF ; https://pypi.org/project/PyMuPDF/ |
| pdf-lib | Node/JS | MIT | 1.17.1, 2021-11-06 (GitHub release); npm 1.17.1. Repo last push 2024-07-17. | 8,688 | 319 | https://github.com/Hopding/pdf-lib ; https://registry.npmjs.org/pdf-lib/latest |
| pdfjs-dist (Mozilla pdf.js) | Node/JS (browser-oriented) | Apache-2.0 (npm and GitHub) | 6.5.438 on npm and GitHub releases page ("released 01 Nov"; year not shown on page, so UNCONFIRMED) | pdf.js repo: 54,162 | pdf.js repo: 466 | https://github.com/mozilla/pdf.js ; https://github.com/mozilla/pdf.js/releases ; https://registry.npmjs.org/pdfjs-dist/latest |
| mupdf (npm, mupdf.js package) | Node/JS (WASM binding to MuPDF) | AGPL-3.0-or-later (npm) | 1.28.6 on npm (publish date UNCONFIRMED) | ArtifexSoftware/mupdf.js: 613 stars, 16 issues, last push 2026-07-01 | 16 (mupdf.js repo) | https://github.com/ArtifexSoftware/mupdf.js ; https://registry.npmjs.org/mupdf/latest |

Licence note on PyMuPDF (facts from search results, not from Artifex's own page; the Artifex about page returned 404): dual-licensed AGPL or commercial. A closed-source network service would fall under AGPL network-use terms unless a commercial licence is obtained. Secondary commentary: https://www.file2markdown.ai/blog/is-pymupdf-free-for-commercial-use ; downstream vendor licensing statement: https://www.bentopdf.com/licensing . Both UNCONFIRMED against primary Artifex text.

Capability facts (merge, text extraction, thumbnail rendering) were not verified for each library in this pass. Only licence, release, and repo metadata were checked.

---

## Job 3: Parsing OCR text from invoices and receipts

### Facts table

| Library | Lang | Licence | Latest release (date) | GitHub stars | Open issues | Source |
|---|---|---|---|---|---|---|
| invoice2data (invoice-x) | Python | MIT | Latest release UNCONFIRMED (PyPI and GitHub release fetches both failed). Repo last push 2026-11-17. | 2,252 | 22 | https://github.com/invoice-x/invoice2data |

Its documented approach is YAML/template-based field extraction from PDF text (per search-result excerpt of its docs, https://invoice2data.readthedocs.io/ ; not fetched directly).

Node equivalent: no drop-in equivalent of invoice2data was found in search. Candidates surfaced by search (not verified for licence, release, or maintenance):
- Tesseract.js (local OCR, returns text only; field parsing must be written by the app).
- Mindee Node.js SDK (managed API): https://docs.mindee.com/v1/integration/nodejs-sdk
- Veryfi Node.js SDK (managed API, returns JSON for invoices/receipts): https://www.veryfi.com/?p=24150
- llm-document-ocr npm package (uses GPT-4 and Claude 3): https://npmjs.org/package/llm-document-ocr
- Guide distinguishing raw PDF text parsing (pdf-parse), local Tesseract OCR, and managed APIs: https://invoicedataextraction.com/blog/extract-invoice-data-javascript-nodejs (secondary)

---

## Job 4: Local model client libraries

### Facts table

| Library | Lang | Licence | Latest release (date) | GitHub stars | Open issues | Source |
|---|---|---|---|---|---|---|
| ollama-python | Python | MIT | 0.6.3, 2026-09-29 (PyPI) | 10,728 | 245 | https://github.com/ollama/ollama-python ; https://pypi.org/project/ollama/ |
| ollama-js | Node/JS | MIT | 0.6.4 on npm (publish date UNCONFIRMED) | 4,420 | 111 | https://github.com/ollama/ollama-js ; https://registry.npmjs.org/ollama/latest |
| transformers (Hugging Face) | Python | Apache-2.0 | 5.23.0, 2026-11-13 (PyPI page) | 169,314 | 1,104 | https://github.com/huggingface/transformers ; https://pypi.org/project/transformers/ |
| transformers.js (@huggingface/transformers) | Node/JS and browser | Apache-2.0 | 4.3.2 on npm (publish date UNCONFIRMED) | 16,436 | 305 | https://github.com/huggingface/transformers.js ; https://registry.npmjs.org/@huggingface/transformers/latest |

Vision-model capability per library (which models run, image input support) was not checked in this pass.

---

## Job 5: Community opinion

No Hacker News, Reddit, or Stack Overflow threads were returned by search for the requested queries (Reddit and HN queries returned only package pages and blogs). The items below are the closest found. All are OPINION.

1. Vercel guidance: a Python backend alongside Next.js makes sense when a feature depends on Python libraries or logic already maintained in Python. (vendor doc) https://vercel.com/i/python-backend-nextjs-use-cases
2. A polyglot-programming glossary entry says that in small teams or early-stage systems the costs of polyglot programming typically outweigh the benefits, and a second language is justified only when there is a clear technical case per boundary. https://maddevs.io/glossary/polyglot-programming/
3. An engineering article suggests basing core services on one language and isolating polyglot components behind stable interfaces. https://engineered.at/articles/single-vs-many-programming-languages
4. A polyglot-monorepo write-up notes that each language brings its own workspace manager and the managers do not coordinate with each other. https://dev.to/_mh/polyglot-monorepo-magic-typescript-python-and-go-in-one-repo-298n
5. A dev.to commenter says generating a .docx from scratch with custom formatting in the Node `docx` package "can be done" but is "slow and painful" (single anecdote, no Python comparison). https://dev.to/isaacdlyman/comment/5no0
6. The docxtpl project's own rationale: python-docx is powerful for creating documents but not for modifying them. https://pypi.org/project/docxtpl/
7. A HackerNoon tutorial uses Node.js as an orchestrator with Python and Node workers over RabbitMQ and Celery for document processing. https://hackernoon.com/supercharging-ai-workflows-distributed-document-processing-with-nodejs-python-and-rabbitmq
8. A forum post citing Stack Overflow question 73487377: to keep table-cell formatting, write new text into the existing Run node. https://forum.aspose.com/t/how-to-keep-the-table-cell-text-format-while-updating-the-table-in-docx-python/250990
9. A vendor licensing page states its own commercial licence does not cover PyMuPDF's AGPL terms; PyMuPDF needs its own Artifex licence when bundled. https://www.bentopdf.com/licensing
10. A blog post argues AGPL's network clause applies to hosted use without distributing binaries. https://www.file2markdown.ai/blog/is-pymupdf-free-for-commercial-use

---

## UNCONFIRMED

Items below were not confirmed from a primary source (registry or official repo/doc page) in this pass.

- Publish dates for npm packages, from registry /latest endpoints that omit time: docxtemplater 3.71.1, pizzip 3.3.0, docx 9.16.0, docx-templates 4.15.0, pdfjs-dist 6.5.438 (year missing), mupdf 1.28.6, ollama-js 0.6.4, @huggingface/transformers 4.3.2.
- invoice2data latest release version and date (PyPI and GitHub fetches failed with 403/unavailable).
- ArtifexSoftware/mupdf.js latest release (GitHub API returned 403; no release info read).
- GitHub stars and open issues for docx-mailmerge (Bouke) and docx-mailmerge2.
- docxtemplater PRO prices: pricing page was served from cache per the fetch note; live prices not re-checked.
- docxtemplater GitHub licence field shows NOASSERTION; the MIT/GPLv3 dual-licence statement comes from the pricing page only.
- PyMuPDF: whether the AGPL network clause applies to a hosted web app (Artifex about page returned 404; only secondary commentary found). Version string "2.1" not checked against Artifex docs.
- docxtpl latest release: PyPI shows 0.20.2 (2025-11-13). A search excerpt cited 0.20.0 (2024-12-29); superseded by the PyPI value.
- Capability facts not checked: thumbnail rendering per PDF library; pdf-lib/pypdf/pikepdf merge and text-extraction APIs; invoice2data template format details; vision-model support in ollama-js and transformers.js.
- Node drop-in alternatives for invoice2data (Tesseract.js, Mindee SDK, Veryfi SDK, llm-document-ocr): licences, release dates, and maintenance not checked.
- Hacker News and Reddit discussions for the requested queries: not found by search. Opinion items above are blogs, vendor pages and forum posts only.
