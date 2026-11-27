# Design: Dues core architecture

Roadmap phase: this design covers the whole core (Phases 0–5, see Roadmap); the change itself targets **Phase 0–1**.

Related: [proposal](proposal.md) · capability specs under `specs/<capability>/spec.md` (`platform-foundations`, `identity-access`, `expense-tracking`, `document-intake`, `bill-matching`, `paybacks`, `claims`, `duplicate-guard`, `reminders`; written in parallel, this design follows the proposal's capability list, not their exact text) · [FUNCTIONAL.md](../../../docs/spec/FUNCTIONAL.md) · [GLOSSARY.md](../../../GLOSSARY.md) · ADRs [0001](../../../docs/adr/0001-tracker-db-owns-status-paperless-owns-documents.md), [0002](../../../docs/adr/0002-additive-folder-paperless-sync-by-checksum.md), [0003](../../../docs/adr/0003-app-builds-claims-claude-optional.md), [0004](../../../docs/adr/0004-documents-on-dedicated-nfs-dataset.md) · stack research in `docs/research/notes/Tracker stack choice/`. No other changes exist yet.

## Context

Dues follows every Payment a Claimant makes for the lab until the university reimburses it. One invariant drives the product: `Open amount = Payment − Σ Bills − Σ Refunds`. Documents arrive through paperless-ngx (phone share → webhook); Postgres owns status, paperless owns documents (ADR 0001). The app builds Claims itself (ADR 0003). Sign-in is Zitadel OIDC with a `claimant` role.

Constraints that shape the design:

- **One maintainer.** Few moving parts; boring technology; every rule in one place.
- **TypeScript only (ADR 0007, 2026-11-21).** One TypeScript app, Next.js 16 on Bun with Node 26 LTS as fallback (Drizzle, pg-boss, docxtemplater, Gotenberg, onnxruntime-node). Another language or a GPU model joins only as an HTTP Adapter behind an existing port. The web framework (Next.js 16 proposed) awaits the owner's confirmation, so the design stays in Modules and Interfaces, not files and frameworks.
- **The app is the only gate.** The network does not isolate hosts; every read and write is scoped by Claimant inside the app.
- **Money rules.** Integer paise; moments as UTC `timestamptz`; business dates as plain `date`; suggest, then confirm; append-only audit log.
- **Scale is small.** Tens of Claimants, hundreds of Expenses each, a few Claims a month. Correctness and Locality beat throughput everywhere.

Vocabulary used below: **Module**, **Interface** (everything a caller must know: types, invariants, ordering, error modes, config), **Implementation**, **Depth** (Leverage at the Interface), **Seam**, **Adapter**, **Leverage**, **Locality**. One Adapter is a hypothetical Seam; two Adapters make a real one. Seams are introduced only where something actually varies.

## Goals / Non-Goals

**Goals**

- Every money rule and state transition lives in one deep Module with a command-shaped Interface that is also the test surface.
- A change of framework changes Adapters and the shell, not the Module map.
- Reading a bill is a pipeline of swappable parts (PageText, Extractor, Locator, validators) behind language-agnostic contracts; a part in another language or on a GPU joins as an HTTP Adapter (ADR 0007).
- Authorization is enforced at one Seam; no query can forget the Claimant scope.
- Webhooks and Reading submissions are safe to repeat; concurrent documents for one Expense cannot corrupt the Open amount or create twin Expenses.
- External systems (paperless, Gotenberg, Zitadel, Web Push) can be down without losing or corrupting money state.

**Non-Goals**

- UI design (separate track, starts after Phase 1).
- Approvals inside the app, statement upload or parsing, sending email from the app, multi-currency, multi-instance scaling.
- Event sourcing, a generic workflow engine, a plugin system, a repository layer over Postgres.
- Mirroring status into paperless as a source of truth (ADR 0001).

## Module map

```
 driving Adapters (no rules of their own)
 ┌────────┐ ┌───────────────┐ ┌──────────────────┐ ┌──────┐
 │ Web UI │ │ MCP (read)    │ │ paperless webhook│ │ cron │
 └───┬────┘ └──────┬────────┘ └────────┬─────────┘ └──┬───┘
     │ Actor       │ Actor             │ doc id       │
     ▼             ▼                   ▼              ▼
 ┌─────────────────────┐        ┌──────────┐    ┌───────────┐
 │ Claimants (identity)│◀───────│  Intake  │    │ Reminders │
 └─────────────────────┘        └─┬──┬───┬─┘    └──┬─────┬──┘
                       Extractor ◀┘  │   │ commands │     │
                        (Seam)       │   ▼          ▼     ▼
 ┌──────────────┐   Paperless ◀──────┘ ┌──────────────┐ ┌──────────┐
 │ Claim package│──▶ (Seam)  ◀──┐      │    Books     │ │ Notifier │
 └──┬───────────┘               │      │ (pure core + │ │  (Seam)  │
    │ PdfConverter (Seam)       │      │  Matching)   │ └────▲─────┘
    ▼                      ┌────┴────┐ └──────┬───────┘      │
 Gotenberg                 │Reactions│◀─jobs──┤ same tx      │
                           └────┬────┘        ▼              │
                                └──────▶  Postgres ──────────┘
```

Reading pipeline, inside Intake (design §3a): `PageText` (Seam: pdfium-text-layer, ppocr-onnx, canned) gives `Page[]`; `Locator` (pure) turns an invoice plus `Page[]` into boxes; validators (pure) compare proposal, readings and boxes. `Extractor` (Seam) is the third swappable part.

Dependency direction: everything points **towards Books**; Books points at Postgres, the pure Matching rules and an `enqueue` function, and at nothing else. Books never calls paperless, Gotenberg, Zitadel or Web Push.

**Where state lives.** Postgres: Expenses, Bills, Refunds, Claims, Claim lines, Ledger, Owed to university, Payback links, duplicate decisions, Claimant profiles, sessions, tokens, idempotency keys, audit log, job queue, push subscriptions. paperless: every file, its OCR text and checksum. Dues stores only the paperless document ID and SHA-256 checksum. Tags and custom fields written to paperless are a convenience; if they disagree with Postgres, Postgres wins (ADR 0001). The maintainer's Mac folder holds copies only (ADR 0002).

### 1. Books (the deep Module)

Named **Books**, not "ledger", because GLOSSARY reserves **Ledger** for the record of Claim lines. Covers capabilities `expense-tracking`, `paybacks`, `duplicate-guard`, the state half of `claims`, and the audit log of `platform-foundations`.

- **Interface**
  - `execute(actor, command, opts?: {idempotencyKey}) → Ok{events[]} | Rejected{reason}`. One entry point for every write.
  - Command families (exact list belongs to the specs): Expense (`LogExpense`, `LogDocument`, `CreateDraft`, `ConfirmDraft`, `DiscardDraft`, `CorrectExpense`, `Describe`, `CloseExpense`, `MergeExpenses`); Bill (`MarkFulfilled`, `UseProofAsBill`, `CorrectBill`, `ConfirmDiffers`, `CancelBill`, `ReturnBill`, `ConfirmMatch`, `MoveBill`); Refund (`ExpectRefund`, `MarkRefundReceived`; writing a Refund off happens inside `CloseExpense`); Claim (`CreateClaim`, `AddBill`, `RemoveBill`, `AttachClaimForm`, `SubmitClaim`, `RecallClaim`, `MarkReimbursed`); Fund (`CreateFund`, `EditFund`, `ShareFund`, `SetPersonalVersion`, `ResetToTeamVersion`, `ArchiveFund`, `SetAdvance`, `OrderFunds`); Order page (`DetachBill`, `ExpectRefund` for "Item cancelled", `CloseOrder` for "No more invoices" and "Close the order?", `UndoCloseOrder`); Payback (`LinkPayback`, `UndoPaybackLink`); duplicates (`ResolveDuplicate same|different`); `MarkRepaid` (Owed to university); `ProposeOrderCandidates`, `PickOrder`; `ImportLedgerLines` (admin).
  - Queries, all taking `actor`: `expenses(filter)`, `expense(id)`, `order(id)` (the Order page), `claims()`, `claim(id)`, `claimSnapshot(id)` (input to Claim package), `attentionSnapshot()` (input to Reminders), `ownsDocument(paperlessId)`, `syncManifest()`.
  - **Invariants** the caller may rely on: `Open amount = Payment − Σ Bills − Σ Refunds − Σ written off` always holds in what queries return; money is integer paise; a Bill on a submitted Claim is locked, and so are its Expense's amount, payee, date and Payment method; only `ready` Bills enter a Claim; a Bill never appears on two Claims or twice in the Ledger; every accepted command appends its events to the audit log in the same transaction as the state change; a rejected command changes nothing.
  - **Ordering**: commands for one Claimant are serialised (see D5). Events in one result are in application order.
  - **Error modes** (typed, never thrown for domain reasons): `not_found` (also returned for another Claimant's entity, so existence does not leak), `forbidden`, `invalid_transition`, `locked`, `blocked_duplicate{claimedBy}` (name only, no details of the other Claimant's data), `blocked_check`, `needs_description`, `stale_form`, `idempotency_conflict`, `validation`.
  - **Config**: matching and duplicate thresholds (±10 days, ±7 days, ±₹1) and the Order leftover threshold (₹10, `LEFTOVER_QUESTION_FROM`) as named constants in one place.
- **Hides**: all four state machines; derivation of Expense status, Open amount and "why it's open"; splitting an Order's expected Bill; cancellation → expected Refund; return after submission → Owed to university; Claim naming and rounding up to whole rupees; the duplicate guard (block and warn, remembered "different" pairs); Payback linking and undo; Matching; tracker ID allocation (`E-…`, `B-…`); locking; the audit log; idempotency records; the Claimant scope.
- **Implementation shape**: functional core, imperative shell. Core: `decide(slice, command, actor, now) → events | rejection` and `apply(slice, event) → slice`, pure. Shell: open transaction → take lock(s) → load the slice the command touches → `decide` → `apply` → write changed rows, audit rows and follow-up jobs → commit.
- **Dependencies**: Postgres; a clock (passed in); an `enqueue(tx, job)` function (passed in); Matching (pure, called inside `decide`).
- **Seams**: none towards the store (D3). `enqueue` has two Adapters: the real queue and a recording list in tests.
- **Tested through its Interface**: scenario tests issue commands through `execute` against a real Postgres and assert on events, rejections and query results; one scenario per state transition and money rule, mirroring the spec scenarios. Property tests on the pure core: for any command sequence, Open amount equals recomputation from Bills and Refunds, and folding `apply` over the emitted events reproduces the stored state (proves the audit log is complete). Concurrency tests run two commands in parallel (D5).

### 2. Matching (pure, inside Books' boundary)

- **Interface**: `propose(documentFacts, candidateExpenses, config) → Proposal`, where Proposal is one of `attach(expense)`, `attachWithCheck(best, others[])`, `newExpense`, `attachProof(expense)`, `samePaymentSuggestion(expense)`, `mergeSuggestion(expenses[])`. Deterministic; no I/O; never returns an Expense outside the candidates it was given.
- **Hides**: vendor/payee similarity, date windows, amount tolerance, exact-ID short-circuit (Expense ID or order number), tie-breaking, the "one Payment for several invoices" sum search.
- **Why separate from the rest of Books' core**: it is the part most likely to be tuned (capability `bill-matching`), and its tests are a table of fixtures → Proposal. Deletion test: delete it and the scoring spreads through `decide` for `LogDocument`; kept.
- **Dependencies / Seams**: none. Only caller: Books.

### 3. Extractor (pulled providers) and Readings (ADR 0006)

One contract, two kinds of reader. A provider is `Document → RawExtraction`, called by Dues; the Claimant's Claude Code is the same function turned around: it asks Intake which of the Claimant's unconfirmed Bills are still to read and hands back what it read, over MCP, which only reads and proposes.

- **Port** `Extractor.extract({images[], textLayer?, schema}) → RawExtraction | unavailable | refused | contract_mismatch`.
  - `RawExtraction` (contract 2): `{ invoices: [{ kind, vendor_name, vendor_gstin, bill_number, bill_date, grand_total, …, each with its printed label }] }`, values **as printed**. The same JSON Schema is sent to providers as `response_format: json_schema`, is the MCP tool input, and is the fixture format.
  - **Invariants**: no conversion, no confidence, no Claimant data; a file may hold several invoices; unreadable fields are null, never guessed.
  - **Error modes**: `unavailable` (retry later), `refused` (expired/revoked: skip this provider until reconfigured), `contract_mismatch`.
- **Adapters**: one `openai-compatible` Adapter (BharatCode `glm-5.3-flash` and vLLM Gemma 4 are config rows) and a `canned` fake. Two Adapters, a real Seam. No rules Adapter.
- **Config**: `extractors: [{name, baseUrl, model, keyEnv, privacy: internal|external}]`, tried in order; external rows are skipped for Claimants who have not opted in.
- **Hides**: prompt, page rendering (text PDF: text layer + 100 dpi image; other PDFs 200 dpi; photos ≤ 2048 px; ≤ 4 pages), text layer, schema request, retries, provider quirks.
- **Tested through its Interface**: contract tests on fictional fixtures against the fake; a recorded smoke test per configured provider.

**Readings.** Every result, pulled or pushed, is stored as a Reading `{documentRef, checksum, extractor{name, model, version}, by: provider|claude-code, actor, raw, at}`: append-only, unique on (document, extractor name, model, version). The proposal is an order-independent fold over a document's Readings: Intake converts printed values (paise, ISO dates with plausibility checks, handwritten `2270-00` = ₹2,270.00), runs validators (subtotal + tax = total, GSTIN check digit, 12-digit UPI reference, value grounded in the page text, via the Locator; the list is §3a) and derives confidence from validators. A second Reading only adds care: Readings that differ stop total, date, bill number and GSTIN (compared after conversion; vendor and description never stop, the page value shows and the other stays on record); agreement removes no stop and never confirms, and "Two readings agree" shows only on a total that already stops, on a printed bill, when the readers are of different model families. Handwritten bills never auto-accept. Reviewing the folded proposal field by field is designed in `docs/research/notes/Bill review UX/design.md` §7 (variant R, approved 21 Nov 2026); see ADRs 0008 and 0009.

**Extraction approach and verdict (task 1.1; prototype on branch `prototype/explorations`, data stays in `private/`).** Scored on a gold set of 42 real bills with a GLM vision model, through the one provider Adapter. Only aggregate counts and verdicts are recorded here.

- **Keep.** For text PDFs, send the PDF text layer plus a 100 dpi page image: 0 broken fields and 55% fewer prompt tokens than the text layer plus a 200 dpi image.
- **Keep (raster bills).** The Extractor sends PageText (`ppocr-onnx`) text beside the image, as text PDFs already send their text layer. On 24 raster bills, 2 runs: date right 19–20 to 20–21, bill number 14–15 to 15–16, total and GSTIN unchanged; +18% prompt tokens; run-to-run agreement 114/120 against 113/120.
- **Drop.** Text only (no image); a 1280 px cap (it broke GSTINs); document crop; a 2048 px upscale (worse); region bands; paperless's Tesseract text added to the prompt for raster images (no gain, +18% tokens over the raster baseline). Text from PP-OCR is a different case; see Keep.
- **No second reading by trigger.** Triggers that call for a second reading caught only 5 of 8 bills with a wrong key field (the keep rule needed ≥ 80%). Agreement between two model families works for totals but not for dates and bill numbers: 6 cases where both families agree on the wrong value. Agreement raises confidence; it never replaces review (ADR 0009).
- **Paperless's role: nothing before the model; two jobs after it.** It keeps the archive file (the page source for PageText) and the checksum, which catches duplicate uploads. Its OCR text is no longer used for grounding: it found 40 of 77 values on raster bills against 66 for PP-OCRv6 (ADR 0007). Its own created date is dropped as a Reading (15 right, 6 wrong, 17 none of 38).
- **Grounding rules** (validator rules, unchanged): an ambiguous numeric date does not count as grounded; a total must be > 0; a bill number carries label risk (a "Reference Number" read as the bill number).
- **Boxes** now come from PageText plus the Locator over paperless's archive PDF (§3a, evidence in ADR 0007). Scored strictly (a box is right only if it covers the whole value; on raster pages against hand-checked reference boxes), total / date / bill number / GSTIN: on 14 text PDFs the text layer boxes 14 / 14 / 13 / 13 of 14 / 14 / 14 / 13, and PP-OCRv6 small run on the same pages matches it; on 24 photos and scans, small plus the `medium` second pass boxes 22 / 16 / 15 / 13 of 24 / 21 / 16 / 13, with no wrong box (21 Nov 2026). The earlier figure of 34 / 28 / 28 / 26 on 38 bills counted boxes found, not boxes right. Photos and handwriting are sometimes not located; the review UI then shows "not located" with no box.
- **Review.** What the Claimant sees and does with these boxes and values is in `docs/research/notes/Bill review UX/design.md` §7 (variant R, approved 21 Nov 2026) and ADRs 0008 and 0009; not restated here. The differing-values stop, the no-default total and the "Reading arrives while open" line are behaviour decided 21–22 Nov 2026 in `docs/research/notes/Claude Code checks UX/decisions.md`; visuals pending.
- **Rendering is now:** text PDF = text layer + 100 dpi image; other PDFs and photos = images as above. The contract (`RawExtraction`, contract 2) is frozen (task 1.6, ADR 0007).

### 3a. Reading pipeline: PageText, Locator, validators (ADR 0007)

Three parts sit between a stored document and a highlighted, validated proposal. Each can be swapped by config; every swap passes the gold-set gate (swap rule below).

**PageText (Seam).**

- **Interface**: `read({bytes, mime}) → Page[] | unavailable`. `Page = {width, height, source{name, model, version}, words: [{text, quad, conf?}]}`, in page points.
- **Adapters**:
  - `pdfium-text-layer`: `@embedpdf/pdfium` character boxes grouped into words; exact; about 0.01 s a page.
  - `ppocr-onnx`: PP-OCRv6 through `onnxruntime-node`. Config tier `tiny | small | medium`, default `small`; `intraOpNumThreads` 2 (the thread cap is what made it fast: 13.9 s to 2.95 s a page); one page per worker to bound memory. `small` took 2.95 s a page and 2.7 GB; `medium` 8.5 s a page and 3.4 GB for a 6-page worker, and over 38 bills located only 2 more totals and 2 more dates. So `medium` runs again only on raster pages, for fields the `small` pass left not located, as a background job. Model files with denormal weights zeroed are harmless but not the speed fix (no gain on AMD Zen 3). The ocr-node library pads each page by about 10 px before detection; word boxes subtract the pad so they sit in page coordinates. It returns **word boxes**, cut from each recognised line at the character positions the recogniser's CTC decoding gives, never by splitting a line box in proportion to its characters. A word box starts a full character width left of its first CTC position, because the recogniser places characters slightly right of where they are printed. The line-to-page transform is copied before its native buffer is freed (reading it after free collapsed every word to the line start). (Owner check, 21 Nov 2026: a proportional split put a GSTIN box beside the GSTIN, because the OCR line also held text from the next table cell.)
  - `canned`: fake for tests.
  - Later: `http-ocr` for a GPU service (for example Nemotron OCR v2 or PaddleOCR-VL), the same port in any language.
- **Config**: `pageText: [{name, …}]`, in order. A born-digital page with a text layer uses it; other pages use OCR. Routing is hidden from callers.
- **Hides**: rasterising, the worker pool, model files, thread caps.
- **Caching**: results are stored per (document checksum, source name, model, version), so boxes are reproducible and are recomputed when a source changes.

**Locator (pure Module, no Seam).**

- **Interface**: `locate(invoice: RawExtraction invoice, pages: Page[]) → per field {boxes: [{page, quad}], source} | not_located`.
- **Hides**: the matcher: digit look-alikes (O/0, l/1, S/5, B/8, Z/2); bill number and GSTIN compared on letters and digits only, look-alikes folded, 1 edit at 8+ characters or 2 at 14+; handwritten `2270-00` amounts; dates with spaced separators; and `pick`, which keeps the match whose preceding text best fits the printed label.
- **Invariants** (owner check of the bake-off overlays, 21 Nov 2026):
  - Never a box without a match (variant R). A value that is not located (for example a handwritten date) shows no box.
  - **A box covers the whole value.** The value may span several words (a handwritten `4` apart from `331`, rupees and paise in separate columns); the box is the union of all of them. A match on only part of the value's digits is not a match, so it gives `not_located`, never a partial box.
  - **A degenerate box is not a match.** A box far narrower than the value's characters need at that line height (a sliver) means the value is `not_located` and no box is drawn. A box that merely exists never scores as right; the gate checks it covers the whole value. (An owner-ordered visual check found 10 of the experiment's "located" raster boxes were slivers of about 6 px covering none of the value.)
  - **One box per field.** When the same value is printed twice (an e-invoice acknowledgement date and the bill date), `pick` keeps the one whose label fits.
- Model grounding is not an Adapter. It is a hypothetical Seam, added only if the gate shows a need.

**Validators ("comparing").** The fold's validators are a named list of pure functions `(proposal, readings, located) → Signal`, chosen by config: grounded-in-text (via the Locator), arithmetic, GSTIN check digit, UPI reference, cross-family agreement, plausibility. Adding or removing one is a config change.

**Extractor** (§3): for raster bills it now sends PageText text beside the image, as it does the text layer for text PDFs (decided 21 Nov 2026; evidence in §3). The Extractor's prompt therefore depends on a PageText read finishing first for raster pages.

**Swap rule.** Any Adapter or validator change must pass the gold-set gate. A script in `evals/` runs any PageText x Extractor x Locator combination against a private gold set kept outside the repo and prints the per-field table. A box counts as right only if it covers the whole value: on text pages, every character box of the value from the text layer; on raster pages, a hand-checked reference box for that field (an overlap with another engine is not enough). The swap must not score below the current one on any field. Only aggregate numbers are recorded.

**Tested through its Interface**: PageText contract tests against fictional PDFs and the canned fake; Locator as a table of fictional pages and values to boxes; each validator as a table; the gate on the private gold set.

### 4. Paperless (Adapter Module)

- **Interface**: `getDocument(id) → {id, ownerUsername, checksum, mime, text, type, tags, fields, created}`; `download(id, "archive" | "original") → bytes`; `annotate(id, {type?, correspondent?, addTags?, removeTags?, fields?})` (set semantics, safe to repeat; one API call, so a state move is add one `reimb:*` and remove the other two together: `bulk_edit` `modify_tags` or a PATCH with the full tag set); `upload(bytes, meta) → id` (resolves only when paperless has finished consuming); `findByChecksum(sha256) → id?`; `listInbox(olderThan) → ids`.
  - **Error modes**: `not_found`, `unavailable`.
- **Hides**: the service-account token, tag / type / custom-field ID lookup and creation, `post_document` + task polling, `bulk_edit`, pagination, API version header.
- **Seam**: real HTTP Adapter and an in-memory fake (used by Intake, Reactions and Claim package tests). The real Adapter has a small contract-test suite run against a live paperless in Phase 0 and before upgrades.

### 5. Intake

Capability `document-intake`.

- **Interface**: `handleDocument(paperlessId) → Logged{events} | Skipped{reason} | Parked{reason}` (pull: runs the configured providers); `pending(actor) → [{documentRef, checksum, mime, have: [extractor]}]` (the Actor's unconfirmed Bills only) and `propose(actor, documentRef, rawExtraction, extractor) → Recorded{agreement, reviewUrl} | Rejected{not_found | locked | validation | contract_mismatch}` (push: the Claimant's Claude Code). All safe to call any number of times for the same document. `Skipped`: documents Dues uploaded itself (Claim forms) and documents already linked. `Parked`: the paperless owner is not a Claimant; surfaced to an admin, never dropped.
- **Hides**: fetching the document, owner → Claimant resolution, provider order and privacy filtering, Readings and their fold (§3), matching `instrument` to the Claimant's Payment method hints, building the `LogDocument` command, the "couldn't read" path (Expense still logged with a blank amount), write-back to paperless.
- **Deliberately not here**: the match decision. Intake reports a fact (`LogDocument{documentRef, extraction}`); Books decides under its lock what the fact means (D5).
- **Dependencies**: Paperless, Extractor, PageText, Locator, Claimants, Books.
- **Driving Adapters**: the paperless webhook (pull) and the Dues MCP server (push; the only door for a Claude Code, read only: it lists unconfirmed Bills, fetches pages and adds a Reading, and cannot confirm a Bill or touch a Claim; OAuth through Zitadel, scope `extraction`, tools `documents_to_read`, `read_document`, `submit_extraction`), shipped to Claimants as a Claude Code plugin (remote MCP server + one skill: "read my bills"). There is no token API and no maintainer-only variant.
  - **Client registration**: a pre-registered static client ID, or a Client ID Metadata Document, so Zitadel's dynamic client registration stays closed.
  - **Consent**: Dues shows its own page (Allow / Don't allow) around the sign-in redirect, because Zitadel has no per-application consent screen.
  - **One connection per Claimant**: Disconnect in Settings records a cut-off time per Claimant; the MCP server refuses any token issued before it (`claude mcp remove` on a computer does not revoke). Readings already made stay. The audit log holds each run; the Claimant gets no run log.
  - **No run state**: Dues keeps no in-progress or failure state; the last read (date, count) comes from the Readings. A Reading arriving for an open Bill never changes it under the hand.
  - **Connect line**: Settings shows one line of the shape `claude plugin install <plugin> --marketplace <repo> -y && claude "read my bills"`.
  - **Open (MCP spike)**: does the browser open by itself on the first tool call? If not, the skill prints one sign-in link. Does a pre-registered client or a Client ID Metadata Document work against Zitadel?
- **Tested through its Interface**: fake Paperless + canned Extractor + real Books; assert on Books state and on the annotations the fake received. Repeat-delivery and out-of-order tests (invoice first, confirmation first, both at once).

### 6. Claim package

The rendering half of capability `claims`.

- **Interface**: `build(claimSnapshot, fundTemplates, profile, billFiles) → {formDocx, formPdf, files[], email{to, cc, subject, body}, shrunk[], linesDigest}`. `fundTemplates` is the Claimant's effective version of the Fund's mail, form, file-name and claim-name templates; the Claim keeps a snapshot of it. Returns results; stores nothing. The caller uploads the form through Paperless and records it with `AttachClaimForm{paperlessId, linesDigest}`; `SubmitClaim` is rejected `stale_form` if Claim lines changed since.
  - **Invariants**: the form shows invoice data only (no Payback, payee, Orderer or Payment method); total is the rounded-up figure stored on the Claim, lines keep exact paise; same input → byte-identical docx.
  - **Error modes**: `converter_unavailable`, `template_invalid`, `missing_profile_field{name}`.
- **Hides**: the tagged template, row loop, amount in words (lakh / crore), grouping by Purpose inside the Fund's Claim, the Fund's mail variables (nothing is added to the subject or body that the template does not put there), file naming from the Fund's pattern (a clash gets {n}), attachment sizing (original files; about 18 MB raw target; shrink the largest images, then scanned PDFs, never text PDFs; split into two mails if still too big), order, merge or zip, and the mail paths: a Gmail draft (compose scope) with a zip, copy-body and `.eml` fallback. Dues never sends mail by any path (FUNCTIONAL principle 8); the Gmail Adapter creates drafts only and has no send call.
- **Seam**: `PdfConverter.convert(docx) → pdf` and `merge(pdfs) → pdf`, with a Gotenberg Adapter and a fake. Template filling is not a Seam (one implementation).
- **Tested through its Interface**: golden test on filled `word/document.xml` and page count; a field-by-field text check of the PDF from real Gotenberg (every row's date, bill no, description, amount, receipt and remark, plus total and amount in words, against the Claim data); the fake converter for everything else.
- **Direction (spike 1.2, 21 Nov 2026; results in `docs/research/notes/Claim form PDF/results.md`)**:
  - **The .docx is always generated and kept** with the Claim. Owner, 21 Nov 2026: "it is good to have a docx version always".
  - **The PDF is made from that same .docx by Gotenberg 9.9 (LibreOffice) with its default fonts.** There is one template, so the .docx and the PDF cannot drift apart. Measured: same page count and page-break row as Word, 0 of 112 fields missing, 104 MiB, 0.1 s warm.
  - **The PDF must keep the form's general format and structure with no information loss.** Owner, 21 Nov 2026: "the pdf should just have the same general format and structure with no information loss". Pixel match with Word is not required. A golden test checks the text, field by field.
  - **Typst and HTML (Chromium) were considered and not chosen**, because each needs a second template, which means drift. Typst passed the no-information-loss check (0 of 112 fields missing, 2 pages, header row repeated), so the rejection is about drift, not about loss.
  - The filler is docxtemplater (ADR 0007).
  - Word on the Claimant's computer is a possible fallback that is not planned.

### 7. Claimants (identity and profile)

Capability `identity-access`.

- **Interface**: `authenticate(request) → Actor | unauthenticated | forbidden`, where `Actor = {claimantId, roles, via: session | mcp | intake}`; OIDC `signIn` / `callback` / `signOut`; `profile(actor)`, `updateProfile`, Payment methods (add, rename, archive, hints), time zone; the MCP connection (`connection(actor)`, `disconnect` records a cut-off time; MCP tokens issued before it are refused); `claimantForPaperlessUser(username) → claimantId?`.
  - **Invariants**: no `claimant` role → `forbidden`, no partial access; keyed on Zitadel `sub`, never email; an Actor is the only way to reach Books.
- **Hides**: the Zitadel roles-claim shape, discovery, PKCE, the session table, token hashing, first-sign-in profile creation.
- **Seam**: none. The claim → roles mapping is a pure function tested with token fixtures recorded in the Phase 0 spike; tests of other Modules construct an Actor directly.

### 8. Reminders

Capability `reminders`.

- **Interface**: `items(actor, now) → AttentionItem[]` (pure derivation over `Books.attentionSnapshot`, using the Claimant's time zone for "today"); `sendDailyNudges(now)` (cron).
- **Hides**: the rule table and its thresholds, grouping ("3 payments need a description"), nudge wording, per-Claimant nudge time.
- **Reuses, does not re-derive**: "why it's open" and Mismatch come from Books; Reminders adds ageing only.
- **Dependencies**: Books (query), Claimants (zone, preference), Notifier.
- **Tested**: snapshot + date → items, one row per rule.

### 9. Notifier

- **Interface**: `notify(claimantId, {title, body, url, actions?}) → sent | no_subscription`; `subscribe(actor, subscription)`, `unsubscribe`. Failure to deliver is never an error to the caller.
- **Hides**: VAPID keys, subscription storage, pruning expired subscriptions.
- **Seam**: Web Push Adapter and a recording fake.

### 10. Reactions (job handlers; follow-ups to Books events)

Not a deep Module: a short list of idempotent handlers, each `(event, deps) → void`, enqueued by Books in the same transaction as the event. Paperless write-back (tags `reimb:*`, custom fields, correspondent) and the "logged, what was it for?" nudge. They may fail and retry without affecting status. Tested by calling the handler with fakes.

### 11. Driving Adapters

- **Web UI**: renders queries, issues commands. No money rule, transition check or scope check lives here.
- **Dues MCP server** (capability `document-intake`, §5): the only door for a Claimant's Claude Code, read only. It maps to Intake's `pending`, a page fetch and `propose`; it adds only transport, validation and the Disconnect cut-off check. Deletion test: delete it and nothing else changes; it is an Adapter, not a Module. Withdrawn from this change: the token-based Assistant API and the maintainer helpers (Back-fill drafts, Amazon picks, invoice upload by ID, marking a Reimbursement, folder sync); they return later as their own decision.
- **paperless webhook**: checks the shared secret, enqueues `intake(documentId)`, answers `202`. Trusts nothing in the body except the ID.
- **Uploads** through the app (web upload) are validated (type, size) and passed straight to `Paperless.upload`; the app keeps no file.
- **Downloads** are proxied by the app after `Books.ownsDocument(actor, id)`; Claimants are never handed an unscoped paperless link.

### Outside the app

- **Maintainer folder sync** (ADR 0002): not part of this change; it returns later as its own decision.
- **Jobs**: the queue library is used directly (pg-boss or the chosen stack's equivalent). No wrapper beyond the `enqueue(tx, job)` function Books accepts.

## Decisions

### D1. One deep Books Module instead of one Module per capability

Expense, Bill, Refund, Claim, Payback, duplicate guard, Ledger and audit log share one invariant and one transaction. **Rationale**: almost every rule crosses entities (cancelling a Bill creates a Refund; a return after submission creates Owed to university; reimbursing a Claim changes Bills and appends Ledger lines; a Payback link moves Bills between two Claimants' Expenses). Split by entity, each Module's Interface would have to expose the others' internals. One Interface (`execute` + a few queries) gives the most Leverage and keeps every money rule in one place (Locality). **Alternatives**: a Module per capability (rejected: shallow, chatty, cross-Module transactions); a separate duplicate-guard Module (rejected: needs every Books table and must run inside Books' transaction).

### D2. State tables plus an append-only audit log; not event-sourced

`decide` returns events; the shell applies them to ordinary state rows and appends the same events to the audit log, in one transaction, audit rows first. State is never rebuilt from the log. **How commands, events and audit relate**: command = what an Actor asked; events = what Books decided happened; audit row = one event plus who, when, command, idempotency key, entity, from-state, to-state and payload. **Rationale**: the duplicate guard and Reminders are cross-row queries that want plain tables and unique indexes; one maintainer should not own projections, upcasting and replay tooling; the requirement is an audit trail, not time travel. The pure core still gives the testing benefit of event sourcing, and the replay property test proves the log is complete enough to become the source later if ever needed. The audit table is append-only in the database (the app's role has no `UPDATE` / `DELETE` on it). **Alternatives**: full event sourcing (rejected as above); audit by database triggers (rejected: records row diffs, not who and why); audit written by callers (rejected: forgettable).

### D3. Store facts, derive status; no store Seam

Stored: facts (amounts, dates, fulfilled-on, document link, Claim membership, Claim status, `draft`, `closed` + reason). Derived by one pure function at read time: Expense `open` / `settled`, Open amount, "why it's open", Bill status. **Rationale**: a derived value that is not stored cannot drift from the invariant. Known ceiling: derivation on every list read; materialise only if a list becomes slow. There is no repository Interface or in-memory store: the pure core needs no database to test, and the shell's behaviour (locks, unique indexes, transactions) is exactly what a fake would not reproduce. Tests of the Interface use a real Postgres. **Alternatives**: stored status columns kept in sync (rejected: drift); in-memory store Adapter (rejected: second implementation of the hard part, tests the fake).

### D4. Idempotency: natural keys first, idempotency keys second

- **Webhook**: the handler only enqueues `intake(documentId)` with the document ID as the job's singleton key. `LogDocument` is idempotent on the paperless document ID (unique link); a repeat returns the original result. Removing the `inbox` tag is Intake's last step, so a periodic sweep of `Paperless.listInbox(olderThan)` re-enqueues anything a lost webhook or crashed job left behind. Documents Dues uploaded itself are skipped, and Dues removes the `inbox` tag paperless auto-applies to them (Claim forms, invoices uploaded for a known Expense), or Inbox never empties.
- **MCP Reading submission**: a Reading is unique on (document, extractor name, model, version), so a repeated or resumed run is the same Reading and nothing doubles. No other write exists on the MCP server.
- **Reactions and paperless writes**: set semantics, safe to repeat.

**Rationale**: paperless will redeliver or miss; Claude Code runs resume. **Alternatives**: trusting webhook delivery (rejected); dedupe only in the queue (rejected: UI and API writes bypass it).

### D5. Concurrency: serialise writes per Claimant; decide matches under the lock

`execute` takes a transaction-scoped Postgres advisory lock on the Claimant ID before loading the slice. The owners are the Claimants of the Expenses the command touches, read before the lock; once the slice loads they are checked again, and if any loaded Expense's owner is not one whose lock is held (a Bill changed owner in between), the transaction rolls back and the command reruns, up to 3 times. Commands touching two Claimants (Payback link, cross-Claimant duplicate resolution) take both locks in ID order. Moving a Bill between two Claimants' Expenses is refused (`invalid_transition`), an admin's included, until a spec allows it. The match decision is made by Books inside `LogDocument`, not by Intake beforehand, so two documents for one Expense arriving together are processed one after the other against current state: the second sees the first's Bill, the shrunken expected remainder, or the Expense the first one just created. Cross-Claimant duplicate blocks are backed by unique indexes (Bills on Claims, Ledger lines), so a race across two Claimants fails closed. **Known ceiling**: one writer per Claimant at a time; irrelevant at this scale; move to per-Expense row locks only if it ever matters. **Alternatives**: optimistic version columns with retry (rejected: cannot protect "no Expense exists yet", the twin-Expense race); serialising only in the queue (rejected: UI commands race with Intake); `SERIALIZABLE` isolation (rejected: retry handling everywhere).

### D6. Authorization at one Seam: the Actor parameter of Books

Every Books command and query requires an Actor, produced only by `Claimants.authenticate` (session, or the MCP connection's token) or by Intake (`via: intake`, the document owner's Claimant). No Books operation accepts a Claimant ID from request input. Scoping is applied in the one place Books loads rows; foreign entities are `not_found`. The only cross-Claimant reads are internal to the duplicate guard and Payback linking, and their results are redacted to "already claimed, by whom". MCP tokens carry the issuing Claimant's scope and nothing more, and are refused if issued before that Claimant's Disconnect cut-off. `admin` may see and do everything across all Claimants: an admin Actor signed in by session passes the ownership filter (over MCP or Intake an admin has only their own Claimant's scope), and every admin change to another Claimant's data is audited with the admin as actor and the Claimant as owner (open question 9). Access needs the `claimant` role; `admin` only widens scope. **Rationale**: the app is the only gate, so the scope must be impossible to forget. **Alternatives**: checks in route handlers (rejected: one missed handler leaks); Postgres row-level security (deferred: the duplicate guard legitimately reads across Claimants, and a second enforcement point is only worth it if a second writer to the database appears).

### D7. Extractors return printed values; Dues owns conversion and confidence (revised by ADR 0006)

See Module 3. Intake applies the thresholds and chains Adapters. **Rationale**: this is the one place the language may differ, so the contract is JSON, stateless and Claimant-free; it can be served in-process or by a worker with no change to callers, and the experiment's corpus is its test suite. **Alternatives**: separate classifier and extractor Seams (rejected: same input, always called together); extractor matching Payment methods or Expenses itself (rejected: leaks Claimant data across the Seam and makes fixtures stateful).

### D8. Books never calls external systems; follow-ups are jobs enqueued in the same transaction

Paperless write-back and notifications are Reactions. **Rationale**: status changes must commit when paperless is down (ADR 0001: paperless metadata is a convenience); enqueueing in the transaction means a committed event always has its follow-up and a rolled-back one never does. **Alternatives**: calling paperless inside the command (rejected: couples money state to its availability); tailing the audit log as an outbox (rejected: commit-order gaps make a correct tailer subtle; the queue already lives in Postgres).

### D9. The Ledger is its own append-only table

Ledger lines hold claimant, Claim name, bill number, bill date, description, amount, optional Bill ID and checksum, and source (`claim` | `import`). `MarkReimbursed` appends one line per Claim line; the import appends history. The duplicate guard checks live Bills and the Ledger. **Rationale**: FUNCTIONAL describes imported history as "Bills without an Expense"; a Bill without an Expense would break the rule that every Bill belongs to an Expense and force null checks through the core. A Ledger line with no Bill behind it says the same thing without the exception. **Alternative**: nullable `expense_id` on Bills (rejected as above). To be confirmed against the `duplicate-guard` spec.

### D10. Stack-neutral shape: one app image, a worker process, Postgres, Gotenberg

Web process and worker process from the same image; Postgres holds data and queue; Gotenberg as a sidecar; an OCR worker (PageText `ppocr-onnx`, same image, bounded memory) and, later, optional HTTP OCR services. All bound to the internal network on `<APP_HOST>`, served as `dues.example.org` through the internal proxy. Nothing in the Module map depends on Next.js, Drizzle or pg-boss specifically.

## Risks / Trade-offs

- [Books grows into a large Module] → Its Interface stays one `execute` and a handful of queries; inside, one file per command family over the shared pure core. Size inside is acceptable; surface growth is the thing to resist.
- [Derive-on-read becomes slow] → Hundreds of rows per Claimant; materialise behind the same queries if measured slow.
- [Per-Claimant lock held during a slow command] → Commands do no I/O other than Postgres (D8); extraction and rendering happen outside the lock.
- [Extraction accuracy on real payment confirmations is poor] → Never blocks logging: the Expense is created with a blank amount and "couldn't read"; the vision second pass is another Adapter behind the same Seam.
- [Auto-attach on "one clear match" is wrong] → Every attach is an audited event and reversible with `MoveBill` until the Bill is on a submitted Claim; thresholds live in one config.
- [Form PDF differs from the Word output; fonts substituted in Gotenberg] → Phase 0 spike with a golden test; mount the fonts; if the template tool fails, revisit the filler behind Claim package (ADR 0007: any other language would join only over HTTP).
- [paperless webhook lost, or delivered before OCR text is ready] → Inbox sweep; Intake retries with backoff when text is empty before declaring "couldn't read".
- [~~paperless rejects an identical file~~ — false: paperless-ngx 3.x consumes identical files by default and only logs a warning (`PAPERLESS_CONSUMER_DELETE_DUPLICATES` unset = false; checked in `documents/consumer.py` on the paperless host, 2026-11-20); a second Claimant's copy reaches Dues as its own document and the checksum rule in duplicate-guard raises "same Bill held by two Claimants" path.
- [Zitadel roles claim shape differs from the docs] → Phase 0 spike records real tokens as fixtures for the mapping function.
- [Real documents contain personal data; repo is public] → Fixtures synthetic or redacted; real corpus only under `private/`.
- [Audit payloads hold personal data forever] → Accepted for an internal tool; payloads carry IDs and changed fields, not document text.
- [No store Seam means tests need Postgres] → Accepted: one container, and the tests then cover the locks and indexes that carry the guarantees.
- [Framework confirmation slips] → Phases 0–1 work on Books' pure core and the contracts; only the shell waits.

## Migration Plan

**Import of existing claim history into the Ledger**

1. A script outside the app (maintainer's machine) reads the existing history file and produces rows: date, bill number, description, amount in paise, Claim name. It also uploads the historic filed documents to paperless under the maintainer's user, tagged with their Claim and with `inbox` removed (ADR 0002 checksum rule makes re-runs additive).
2. `ImportLedgerLines{claimant, rows, dryRun}` (admin Actor; how the one-off script reaches it is decided when the maintainer helpers return). Each row gets a deterministic key (hash of its normalised content plus its position in its Claim); re-running imports nothing twice.
3. Dry run first: reports row count, total per Claim, rows that already collide with each other on bill number + amount (history is recorded as it happened, collisions are flagged, not rejected), and unparseable rows. The maintainer compares counts and totals with the source before the real run.
4. Real run appends Ledger lines with `source = import`, one audit event per batch. No Expenses, Bills or Claims are created.
5. Imported documents trigger the webhook; Intake skips documents carrying a historic Claim tag.

**Rollout**

1. Phase 0 spikes on throwaway instances.
2. Provision `<APP_HOST>` (app, worker, Postgres, Gotenberg); Zitadel project, roles and clients; paperless OIDC, document types, tags, custom fields, webhook. Each write to shared infrastructure one at a time with the maintainer's approval and a config backup first.
3. Restore test of the Postgres dump before go-live.
4. Maintainer only: import the Ledger, then run the hand workflow and Dues side by side for one full Claim.
5. Grant `claimant` to further members one at a time.

**Rollback**

- Before other Claimants join: stop the app; the hand workflow is untouched and still authoritative. The import is re-runnable, so the database can be dropped and rebuilt.
- After: restore the last Postgres dump; documents are unaffected (paperless owns them); paperless tags and fields can be rewritten from Postgres by replaying Reactions.
- Schema migrations are forward-only and additive within a phase; a release that needs a destructive migration ships it one release after the code stops using the old shape.

## Open Questions

1. ~~Web framework~~ **Resolved (owner, 2026-11-21):** Next.js 16 on Bun (ADR 0007); Bun compatibility checked in task 1.7, Node 26 LTS as fallback.
2. ~~Claim name timing~~ **Resolved (maintainer, 2026-11-20):** the name is fixed when the package is built (the Fund's mail can carry it as {claim_name}), renamed if rebuilt in a later month before submission, frozen once submitted. Was: Does the form or the package file naming carry the Claim name? The name is assigned at first submission, but the package is built before it. If yes, the name must be reserved when the package is built.
3. ~~Same file from two Claimants~~ **Resolved:** paperless-ngx 3.x consumes identical files by default and only logs a warning (`PAPERLESS_CONSUMER_DELETE_DUPLICATES` unset = false; checked in `documents/consumer.py` on the paperless host, 2026-11-20). Dues receives both copies; duplicate-guard's checksum rule and the payback prompt handle them. Keep `CONSUMER_DELETE_DUPLICATES` off. Was: Two Claimants holding the same file: paperless rejects the second identical upload. How does the second Claimant's copy reach Dues (surface paperless's duplicate error, or link by checksum on request)?
4. Does the paperless webhook action allow a custom secret header, and does it fire before OCR text is available? (Phase 0 live test.)
5. Zitadel roles claim: exact shape in real tokens, and whether paperless group sync works with it.
6. ~~Submission package~~ **Resolved:** today's workflow sends the form PDF and each Bill file as separate email attachments; no merge. "Download Claim" offers a zip.
7. Do paperless archive PDFs exist for every Bill file type, including HEIC?
8. ~~IDs~~ **Resolved (maintainer, 2026-11-20), ADR 0005:** UUIDv7 keys inside; References `E-213`, `B-431`, `R-12`, `O-1` from one global sequence per type, unpadded. Was: Tracker IDs (`E-…`, `B-…`): one global sequence or per Claimant?
9. ~~Admin scope~~ **Resolved (maintainer, 2026-11-20):** `admin` may see and do everything across all Claimants. The Actor carries the role; the single authorization Seam lets an admin Actor signed in by session pass the ownership filter (over MCP or Intake an admin has only their own Claimant's scope), and every admin change on another Claimant's data is audited with the admin as actor.
10. ~~Stored status~~ **Resolved:** no spec scenario requires a stored status column; derive-on-read stands. Was: is derive-on-read acceptable for the specs' wording of "status", or do any scenarios require a stored status?
11. ~~Ledger table~~ **Resolved:** `duplicate-guard` spec now imports history as Ledger lines (D9). Was: Ledger as its own table (D9) vs the functional spec's "Bills without an Expense": confirm with the `duplicate-guard` spec.
12. MCP spike (task 6.0, before the MCP server is built): does the browser open by itself on the first tool call from Claude Code, or must the skill print one sign-in link? Does a pre-registered client ID, or a Client ID Metadata Document, work against Zitadel with dynamic registration closed?
13. Gmail compose scope: does the university Workspace allow it (being checked)? Without it the zip and `.eml` paths carry the mail step.
14. Attachment size: shrinking (about 18 MB raw target, largest images first, then scanned PDFs, never text PDFs) and splitting into two mails are decided. Open: confirm Gmail's 25 MB limit on the encoded mail with one real draft of about 22 MB.
15. ~~Leftover threshold~~ **Resolved (owner, 2026-11-22), decisions 55 and 56:** a leftover under ₹10 skips the question and offers "₹1 left. Close the order?" (yes = Not claiming). "No more invoices" asks one three-way question: Refund coming (expected Refund), Claim without a bill (a `no_bill` Bill, `ready`), Not claiming (remainder written off, counted in the Open amount, Advance unchanged). Each can be undone from the Order page.
16. Which Fund a new Purpose starts on.
17. Registering Dues with Google for Gmail drafts (OAuth client, verification): parked, owner: later.
18. ~~Approvers list in the profile~~ **Resolved (owner, 2026-11-22), decision 54:** removed. Each Fund keeps its own To and CC; a personal version of a Fund can change them.

## Verification

**Pending stack decision.** Build and test commands are fixed when the experiment concludes (if the TypeScript candidate wins: a typecheck, a unit + integration test run against a Postgres container, and a browser test run; exact commands to be recorded here and in `AGENTS.md`).

What will be verified, whatever the stack:

- **Books, pure core**: property tests for the Open amount invariant and for replay (events folded through `apply` equal stored state); table tests per state machine.
- **Books, Interface**: one scenario test per spec scenario through `execute` against real Postgres; rejection reasons asserted; audit rows asserted for every accepted command; append-only enforced (an `UPDATE` on the audit table fails).
- **Authorization**: for every query and command, a second Claimant's Actor gets `not_found`; a test enumerates the Interface so a new operation cannot skip it.
- **Idempotency**: same webhook twice → one Expense; same Reading submitted twice → one Reading.
- **Concurrency**: two `LogDocument` commands in parallel for one Expense (two invoices; invoice + payment confirmation with no Expense yet) → one Expense, correct Open amount; two Claimants adding the same Bill to Claims in parallel → exactly one succeeds.
- **Matching**: fixture table → Proposal, including several candidates and one Payment for several invoices.
- **Extractor**: the corpus contract suite against every Adapter; accuracy per field reported, with the threshold agreed after the experiment.
- **Intake**: fake Paperless + canned Extractor; repeat, out-of-order, unreadable, unknown owner, self-uploaded document.
- **Claim package**: golden `word/document.xml` and page count; rendered-page comparison against a Word-exported reference (Phase 0); amount-in-words table including lakh and crore.
- **Paperless Adapter**: contract tests against a live paperless.
- **Import**: dry-run totals equal the source; second run imports zero rows.
- **Operations**: restore from backup tested; time rules (a Payment at 00:30 in the Claimant's zone lands on that day).

## Roadmap phases

- **Phase 0: stack decision and spikes.** Conclude the invoice-parsing experiment and freeze the Extractor contract. Spikes: docx fill vs the Word output; Gotenberg fonts; Zitadel roles-claim shape (record fixtures); paperless OIDC live test (including webhook header and timing); payment-app share device test. Each spike closes an Open Question or a Risk.
- **Phase 1: foundations, identity, Expense core.** Deployment shape, money and time rules, audit log, Claimants (sign-in, role gate, profile, Payment methods, time zone), Books with Expense / Bill / Refund commands, Open amount, corrections, closing, entries without a bill, closing what is left of an Order. Ledger import.
- **Phase 2: document intake and matching.** Paperless Adapter, webhook, Intake, Extractor Adapter(s), Matching, Check matches, write-back Reactions, inbox sweep.
- **Phase 3: Claims, form and PDF.** Claim commands, naming, rounding, Claim package, Gotenberg, submission, recall, Reimbursement → Ledger.
- **Phase 4: duplicates hardening, Paybacks, Reminders and Web Push.** Warn rules and remembered pairs, Payback link and undo, unlinked shared Bills, Owed to university, attention rules, Notifier.
- **Phase 5: Claude Code over MCP.** The read-only MCP server, the consent page, Disconnect with its cut-off, the plugin and its one-line install. Maintainer helpers (Back-fill, Amazon picks, folder sync) are out of this change.
- **UI design** runs in parallel once Phase 1 has fixed the Books Interface; the UI is a driving Adapter and can change without touching a rule.


## Decisions recorded after review (2026-11-20)

- Amounts keep the paise printed on their document everywhere; only a Claim's total is rounded up (platform-foundations).
- Claim name fixed at package build, frozen at submission (claims).
- `admin` sees and does everything, audited (identity-access).
- UUIDv7 keys plus global unpadded References (ADR 0005, platform-foundations).
- Pluggable extraction (ADR 0006): one OpenAI-compatible provider Adapter configured by rows; Claimant's Claude Code pushes Readings over MCP; append-only Readings folded into one proposal; external providers only with the Claimant's opt-in; rules extractor dropped.
