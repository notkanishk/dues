Test-first vertical slices: each `test:` task is written red, then its paired task makes it green. Tests sit only at the agreed Seams (design.md Module map):

| Seam | Catches | Misses |
|---|---|---|
| Books `execute` / queries, against real Postgres | every state machine, Open amount, money rules, duplicates, Paybacks, concurrency, authorization | rendering, external systems |
| Matching `propose` (pure) | candidate ranking, tolerances, merge suggestions | persistence, locking |
| Extractor contract (fixtures in, fields out) | field accuracy, confidence, classification | how Books uses the result |
| Intake `handleDocument` with fake Paperless + canned Extractor | webhook-to-Expense flow, idempotency, parking | real OCR, real paperless |
| Claim package `build` with fake PdfConverter; one golden test with real Gotenberg | form rows, totals, words, email, naming | Word-level visual fidelity beyond the golden file |
| Claimants `authenticate` on recorded tokens | role gate, admin, Actor shape | Zitadel availability |
| Reminders `items(actor, now)` | every attention rule and its ageing | delivery |
| Dues MCP server (read only) | Claimant scope, Disconnect cut-off, Reading idempotency, no write tool | Claude Code itself, the consent page's look |
| PageText `read` (fictional PDFs, canned fake) | boxes in page points, source routing, cache key | OCR accuracy on real bills |
| Locator `locate` (pure, fictional pages) | look-alikes, fuzzy ids, `pick`, never a box without a match | how Intake uses the boxes |
| Validators (pure, one table each) | each Signal | combination into confidence |
| `evals/` gold-set gate (private gold set, aggregates only) | any swap scoring below the current one on a field | review UX |

Commands (ADR 0007: Next.js 16 on Bun):

| Purpose | Command |
|---|---|
| Install | `bun install` |
| Dev, build | `bun --bun next dev`, `bun --bun next build` |
| Typecheck | `bunx tsc --noEmit` |
| Unit and golden tests | `bunx vitest run --pool=threads` |
| Database tests (real Postgres) | `bunx vitest run --pool=threads --project db` |
| End-to-end | `bunx playwright test` |
| Migrations | `bunx drizzle-kit generate`, `bunx drizzle-kit migrate` |
| Gold-set gate | `bun evals/run.ts` (private gold set path from env; prints aggregates only) |

## 1. Phase 0: stack decision and spikes

- [x] 1.1 Finish the invoice-parsing experiment (branch `prototype/explorations`); score all variants against the gold set; write the verdict and the extraction approach (local rules, Python worker, or LLM/vision) into this change. Verdict: LLM/vision through the provider adapter; see design §3 "Extraction approach and verdict" and ADR 0006.
- [x] 1.2 Spike: fill the real form template with the chosen docx library from one fictionalised Claim; convert with Gotenberg; compare page count, table, fonts (Arial / Arial Narrow) against the Word-exported PDF. Verdict: Gotenberg 9 with default fonts over the same .docx; see `docs/research/notes/Claim form PDF/results.md` and design §6
- [ ] 1.3 Spike: decode a real Zitadel token for a test user; record the exact roles-claim shape as a fixture (no secrets) for task 2.6
- [ ] 1.4 Spike: paperless OIDC login against a Zitadel test client; per-user API token upload owner; webhook payload, custom secret header and whether OCR text is ready when it fires
- [ ] 1.5 Device test: share the success screen from CRED, Google Pay, PhonePe, Paytm, BHIM and a bank app; record image vs text vs nothing; check HEIC handling in paperless
- [x] 1.6 Decide the stack from 1.1–1.2; record it as ADR 0007; fill in this file's build/test commands; freeze RawExtraction contract 2 (design §3, ADR 0006). Done: ADR 0007 (TypeScript only); commands above; contract 2 frozen. Web framework (Next.js 16 proposed) is still open, awaiting the owner.
- [x] 1.7 Bun compatibility check (fictional data, experiment host): under `bun --bun`, Next.js 16 build and standalone start; web-push VAPID send to a local push endpoint; pg-boss 12 send/work; Drizzle migrate on Postgres 18; openid-client discovery; `@embedpdf/pdfium` char boxes; onnxruntime-node PP-OCRv6 one page with memory bound; docxtemplater fill. Anything failing runs on Node 24; record which in ADR 0007. Done: all 8 production pieces pass on Bun 1.4.5; only Vitest's forks pool fails, so tests use `--pool=threads` (ADR 0007).
- [x] 1.8 Rerun the 1.7 checks on the versions pinned in ADR 0007 (Bun 1.4.5, Node 26 LTS fallback, Postgres 19.0, TypeScript 7.0, Next.js 16.4, Gotenberg 9.9.1); add a TypeScript 7 typecheck of the Next.js app and a Gotenberg 9.9.1 docx-to-PDF conversion. Record any piece that fails and its fallback in ADR 0007. Done: all pass on Bun 1.4.5 and Node 26.13; only Vitest needs `--pool=threads`; CI clears `tsconfig.tsbuildinfo` (ADR 0007).

## 2. Phase 1: foundations, identity, Expense core

- [x] 2.1 Scaffold the repo (app, worker, Postgres 19, Gotenberg 9.9 in Docker; versions as pinned in ADR 0007 Compose); CI runs tests against a real Postgres; `<APP_HOST>` deploy notes stay in `private/`
- [x] 2.2 test: money — paise in, paise out; sums exact; no float path (platform-foundations)
- [x] 2.3 Money type and formatting (₹ Indian grouping, two decimals, paise kept as printed)
- [x] 2.4 test: Keys and References — UUIDv7 keys; `E-`/`B-`/`R-`/`O-` References global, unpadded, immutable (ADR 0005)
- [x] 2.5 Schema for Expense, Bill, Refund, Owed to university, audit log; sequences for References
- [ ] 2.6 test: `authenticate` on recorded tokens — no `claimant` role refused; `admin` passes ownership; role removed refused
- [ ] 2.7 Claimants: OIDC code + PKCE login, Actor, profile (name, employee code, designation, time zone, Payment methods with match hints)
- [x] 2.8 test: Books `LogExpense` → `open` Expense with one expected Bill (online) or fulfilled Bill (shop/service); audit entry written in the same transaction. Done: `src/books/books.test.ts`, `core.test.ts`; the reasons `awaiting goods` and `bill missing` come with 2.10–2.11
- [ ] 2.8a test: entry without a bill — one sheet with What for, Amount, Date (default today, any past date), Fund (Makerspace first), Purpose, Vendor/payee, Kind, Ordered by, Payment method (default Cash), Payback and Remarks (starts "No bill (cash)"); none of bill number, GSTIN, order reference, UPI reference, documents, matching or review; saves an open Expense with one `no_bill` Bill, Fulfilled and `ready`, in Ready to file; never in Waiting for invoice, no "bill missing", no Invoice waiting; editable until on a submitted Claim; counts against the Fund's Advance; several entries for one day allowed, no recents; "Add a bill" attaches a document, turns it into a normal Bill and puts it in review
- [ ] 2.8b Books `LogNoBillEntry`, `AddBillToEntry`; the `no_bill` Bill kind (no `paperless_id`, remarks required, no review); Home "+ Add without a bill"
- [x] 2.9 Books shell: `execute(actor, command)` with per-Claimant lock, events, audit log. Done: `src/books/`; idempotency keys in `idempotency_keys` (migration 0002); a Bill's kind is null until its document arrives
- [x] 2.10 test: Open amount and "why it's open" derived on read for awaiting goods, refund owed, bill missing, mismatch, in claim. Done: `src/books/core.test.ts` (scenarios, order, property), `books.test.ts` (Refunds from the table)
- [x] 2.11 Derivation of status, Open amount and reason (no stored status). Done: `deriveExpense` in `src/books/core.ts`; Claim membership (`claim`) and `writtenOff` arrive as slice fields the loader fills with none until Claims and 2.13d
- [x] 2.12 test: Order flow — split expected Bill per invoice; cancel part → expected Refund; cancel rest; return before claim → Bill cancelled permanently. Done: `src/books/core.test.ts` ("Order commands", property over command sequences), `books.test.ts` ("Order flow"); return after submission (Owed to university) waits for Claims
- [x] 2.13 Order commands. Done: `SplitExpectedBill` (LogDocument issues it when documents arrive, Phase 2), `ExpectRefund` (Item cancelled), `CancelBill`, `ReturnBill` in `src/books/core.ts`; a Bill on any Claim is refused as `locked` until Claims
- [x] 2.13a test: Order page — Payment first, then each Bill with Move to another payment, Detach (own invoice-only Expense) and Edit (opens review); "Still expected ₹x" with Item cancelled (expected Refund, Refund received) and No more invoices; a small leftover gets "₹1 left. Close the order?" and is never closed silently. Done for Books: `orderPage` (`core.test.ts`) and `order()` (`books.test.ts`, "The Order page"); Edit (review, ADR 0009) and the page itself remain for the screen work
- [x] 2.13b Order page queries and commands (`DetachBill`, Item cancelled). Done for Books: `order(actor, expenseId)`, `MoveBill`, `DetachBill`; Item cancelled is `ExpectRefund` (2.13). A Bill has no seller yet (`seller: null` until a Reading gives "Sold by", Phase 2); the screen remains
- [x] 2.13c test: closing what is left of an Order — "No more invoices" asks "₹270 of this order has no invoice. What happened?" with Refund coming (expected Refund, "Refund received" later), Claim without a bill (a `no_bill` Bill of ₹270 with the Order's What for and remark "No invoice from seller", `ready`) and Not claiming (remainder written off, counted in the Open amount, the Order can settle, Advance left unchanged); each undone from the Order page; a leftover under ₹10 skips the question and offers "₹1 left. Close the order?" (yes = Not claiming), ₹10 or more asks the question; never closed silently. Done for Books (`core.test.ts` "CloseOrder", "orderPage", the property test; `books.test.ts` "The Order page"); "Advance left does not rise" waits for the Advance (2.22); the question's wording and consequence lines are the screen's
- [x] 2.13d Three-way close commands, written-off remainder in the Open amount, undo. Done: `CloseOrder` (choice `refund_coming` | `claim_without_bill` | `not_claiming`; `LEFTOVER_QUESTION_FROM` ₹10) and `UndoCloseOrder`; the expected Bill records `closed_as`, a written-off remainder is a `write_offs` row with `bill_id`, a leftover No bill names its `from_bill_id` (migration 0005); its remark is edited with `CorrectBill`
- [x] 2.14 test: Refund expected → received; Expense settles only when Open amount is zero, every Refund arrived, every Bill reimbursed or cancelled. Done: `core.test.ts` ("MarkRefundReceived and settling"), `books.test.ts`; settling with a reimbursed Bill is pinned on the pure core until Claims
- [x] 2.15 Refund commands and settling. Done: `MarkRefundReceived`; settling stays derived by `deriveExpense`; writing a Refund off happens inside `CloseExpense` (a `RefundWrittenOff` event, 2.17), not as a command of its own
- [x] 2.16 test: corrections allowed until a Bill is on a submitted Claim; "differs from the document" flag; closing (personal / duplicate / written off) rules. Done: `core.test.ts` ("CorrectExpense", "CorrectBill and ConfirmDiffers", "CloseExpense", the property test), `books.test.ts`; a submitted Claim and "Unlocked by recall" are pinned on the pure core until Claims
- [x] 2.17 Correction and closing commands. Done: `CorrectExpense` (amount, payee, date; Payment method with 2.21), `CorrectBill`, `ConfirmDiffers`, `CloseExpense` with each expected Refund kept or written off; written-off amounts in `write_offs` (migration 0004), summed into Σ written off; the retag follow-up is a `paperless.setTags` job for its Reaction
- [x] 2.18 test: authorization — another Claimant's Expense is `not_found`; admin sees it and is audited as actor. Done: `books.test.ts` "Authorization at the Actor Seam" (every command and query enumerated by type: role-less `forbidden`, foreign `not_found`; admin read and correction audited as actor with the Claimant as owner; owner's lock, both locks in ID order; idempotency keys; the property over owner, admin, another Claimant and a role-less Actor), and the owner/admin property in `core.test.ts`
- [x] 2.19 Authorization at the Actor Seam. Done: role gate (`claimant` or `admin`, else `forbidden` before any read); `admin` passes the ownership filter; commands lock the owners of what they touch in ID order (the Actor's own when none), and refuse to write outside the held locks; `audit_log.owner_id` (migration 0006, backfilled from each entry's Expense); an admin's LogExpense is the admin's own, a detached Bill's new Expense the Order owner's
- [ ] 2.19a test: Fund — fields (name, mail, notes, form template, file-name pattern, claim-name pattern, hint, archive); notes never in mail or form; Makerspace first by default; private to its creator, Share with team makes it a team Fund, team version edited only by an admin and the creator (admin edit audited); "my version" overrides mail, form, file-name pattern and hint for one Claimant only, Reset to team version, "Team version updated. Compare"; each Claimant orders and hides Funds for themselves only
- [ ] 2.19b Fund entity, sharing, personal versions, per-Claimant order and hiding, Archive
- [ ] 2.20 test: Purpose — an optional group inside a Fund (name and Fund); zero or more active at once; an active Purpose preselects its Fund; End trip stops catching payments but keeps its Expenses; one active → default, two or more → choices plus None; owner only; the prompt lists Funds in the Claimant's order, Makerspace first and preselected
- [ ] 2.21 Purpose entity inside a Fund, link from Expense (`fund`, `purpose`, free-text `what_for`), active Purposes. Open: which Fund a new Purpose starts on (design Open Question 16)
- [ ] 2.22 test: Advance balance per Fund — total minus Payments plus Refunds received plus Reimbursements received over that Fund's Expenses; other Funds untouched; below zero allowed; moving an Expense between Funds changes both; off by default; personal, never shared; no top-up records; Funds and Purposes behave the same with the Advance on or off
- [ ] 2.23 Advance on a Fund (per Claimant) and Advance left derived on read; chip "Makerspace" / "Makerspace · Advance"; Home block per Fund (red below zero, amber at 15% or less, green above, hidden when off)

## 3. Phase 2: document intake and matching

- [ ] 3.1 test: openai-compatible Extractor Adapter against a recorded fake endpoint — json_schema request, page rendering, `unavailable` / `refused` / `contract_mismatch`
- [ ] 3.1a test: Extractor input for raster bills — the prompt carries the PageText (`ppocr-onnx`) text beside the image, as text PDFs carry their text layer; a text PDF is unchanged (fictional pages, canned PageText)
- [ ] 3.2 openai-compatible Adapter + canned fake; provider rows in config (BharatCode, then Gemma on the GPU host)
- [ ] 3.2a test: Readings fold — conversion of printed values (paise, dates incl. month-first receipts, `2270-00`), validators, agreement across families, handwritten never auto-accepted, late Reading never overwrites a confirmed value
- [ ] 3.2b Readings store and fold; Books `ReviseExtraction` for unconfirmed fields
- [ ] 3.2c test: provider order, privacy filter with Claimant opt-in, `refused` falls through
- [ ] 3.2d Provider routing + consent setting (identity-access)
- [ ] 3.2e test: PageText port — `ppocr-onnx` returns word boxes from CTC character positions, not proportional line splits (fictional line holding two table cells: the second cell's word box sits over that cell); fictional PDFs and the canned fake; `pdfium-text-layer` word boxes in page points; `ppocr-onnx` on a fictional raster, where a word box lands on its word and is not shifted by the ~10 px page pad; source routing (text layer first, OCR otherwise); cache key (checksum, source name/model/version); `unavailable`
- [ ] 3.2f PageText port, `pdfium-text-layer` and `ppocr-onnx` Adapters, `canned` fake, `pageText` config
- [ ] 3.2g test: Locator — table of fictional pages and invoices to boxes, including the owner-found cases (21 Nov 2026): a handwritten total split into words (`4` `331` `00`) gives one box over all of them; a partial digit match gives `not_located`; a degenerate sliver box (far narrower than the value needs at that line height) gives `not_located` and no box; the same date printed twice under different labels gives one box under the bill-date label; digit look-alikes, fuzzy bill number and GSTIN (1 edit at 8+, 2 at 14+), `2270-00` amount, spaced date separators, `pick` by label, never a box without a match, `not_located`
- [ ] 3.2h Locator (pure)
- [ ] 3.2i test: validator list — one table per validator (grounded-in-text, arithmetic, GSTIN check digit, UPI ref, cross-family agreement, plausibility); config adds or removes one
- [ ] 3.2j Validators as named pure functions `(proposal, readings, located) → Signal`; the fold takes the configured list
- [ ] 3.2k `evals/` gold-set gate (a box is right only if it covers the whole value: text layer characters, or hand-checked reference boxes on raster bills; a box that merely exists, such as a sliver, never scores as right): runs any PageText x Extractor x Locator combination on the private gold set (outside the repo), prints the per-field table, fails if a swap scores below the current one on any field; only aggregates recorded
- [ ] 3.2l test: PP-OCR worker bounds — thread cap (`intraOpNumThreads` 2), memory stays flat over many pages, one failed page does not stop the rest
- [ ] 3.2m PP-OCR worker: one page per worker, tier config (tiny | small | medium, default small; medium reruns only raster fields left not located, as a background job), subtract the page pad from word boxes, start a word box one character width left of its first CTC position, copy the line transform before freeing it; check the ONNX files' licence before shipping
- [ ] 3.3 test: Paperless Adapter against a recorded-response fake (get, download, annotate, upload, findByChecksum)
- [ ] 3.4 Paperless HTTP Adapter (service-account token)
- [ ] 3.5 test: Matching `propose` — amount leads, vendor soft: an exact amount auto-attaches only when date within ±10 days and (vendor or order number matches, or exactly one candidate); a smaller invoice auto-attaches and splits the Order's expected Bill only when date within the window and the order number or the shop (platform and learned aliases) matches, else best candidate with a Check; marketplace: the platform is the shop, the seller never breaks a match, the first invoice's order number is saved and later invoices match on it exactly; none → invoice-only Expense, "Unknown" vendor when unreadable; Payback matches on amount and date with no vendor check; confirmed or moved matches teach payee aliases that later matches use; ±₹1 / ±10 days for a late payment confirmation (invoice before payment); one Payment for 2–3 invoices from one vendor, suggested and never automatic; four invoices get no suggestion
- [ ] 3.6 Matching
- [ ] 3.6a test: after an auto-attach Dues says once "₹2,100 invoice added to <shop> · <what for>. ₹2,770 still expected." with Undo and Move; Undo restores the expected Bill
- [ ] 3.6b Auto-attach message, Undo and Move
- [ ] 3.7 test: Intake — payment confirmation logs an Expense at once; same UPI reference attaches instead; unreadable → "Couldn't read" Expense; two unreadables within 10 minutes → "Same payment as E-x?"; invoice-first logs an Expense with Payment method "not recorded"; late confirmation fills it; repeat webhook is a no-op
- [ ] 3.8 Intake and the webhook endpoint (secret check, idempotent)
- [ ] 3.8a test: payee type asked once for a person payee (Shop / Online order / Paying someone back) and remembered; "Paying someone back" makes a Payback; shops never asked; "What for?" step carries Ordered by (Me default, or a Person → `orderer`), the Fund choice (Claimant's order, Makerspace first and preselected, the Fund's grey hint) and the Purpose choice; an order-confirmation screenshot fills `order_ref`
- [ ] 3.8b Payee memory (type and aliases), the "What for?" step, order-confirmation handling
- [ ] 3.9 test: a Bill with an open Check cannot go on a Claim until confirmed or moved
- [ ] 3.10 Check confirm / move commands
- [ ] 3.11 test: write-back job — tags, document type, correspondent, custom fields (References) set after Books commits; retried when paperless is down
- [ ] 3.12 Reactions: paperless write-back
- [ ] 3.13 paperless configuration (Phase 0 findings): OIDC, default upload group, webhook workflow, service account — one change at a time with the maintainer's OK

## 4. Phase 3: Claims, form and PDF

- [ ] 4.1 test: building a Claim — only `ready` Bills; blocked by Check, Ledger match, unlinked shared Bill, missing "what for" (inline fill offered)
- [ ] 4.2 Claim draft commands
- [ ] 4.3 test: total rounded up to whole rupees, lines keep paise; amount in words
- [ ] 4.4 Claim totals
- [ ] 4.5 test: naming — made from the Fund's claim-name pattern, fixed at package build, renamed if rebuilt in a later month before submission, frozen at submission and after recall
- [ ] 4.6 Claim naming
- [ ] 4.7 test: Claim package `build` with fake PdfConverter — rows grouped by Purpose inside the Fund's Claim, form shows invoice data only, mail To, CC, subject and body from the Fund's template with its variables and nothing the template does not put there (the Purpose name is not added to the subject), the Claimant can edit the draft; one golden test through real Gotenberg, with a field-by-field text check of the PDF
- [ ] 4.8 Claim package (template fill + Gotenberg Adapter)
- [ ] 4.7a test: `no_bill` line on a Claim — one form line with text, amount and remark in the remarks column; the mail breakdown marks it "no bill"; no attachment and no file name; a Claim of only `no_bill` lines builds; a Bill turned normal by "Add a bill" attaches and is named like any Bill
- [ ] 4.7b `no_bill` lines in form, breakdown and package
- [ ] 4.8a test: filing — each Fund files as its own Claim with its own total and its own "File", Purposes are breakdown groups inside it; every Fund's total rounds up to the rupee; review at filing time (Bills, then form and breakdown); a Claim records the amount actually received on reimbursement
- [ ] 4.8b Filing by Fund, reimbursed amount
- [ ] 4.8c test: no-send rule — the mail Module has no send call; building, drafting or downloading a Claim sends nothing, on every path (Gmail draft, zip, `.eml`); "Sent it?" yes marks the Claim submitted, anything else leaves it a draft
- [ ] 4.8d Mail paths: Gmail draft Adapter (compose scope, drafts only) with a recording fake, zip + copy-body fallback, `.eml` fallback; "Sent it?" step. Open: Gmail scope on the university Workspace and the 25 MB test draft (design Open Questions 13, 14); registering Dues with Google is parked (Open Question 17)
- [ ] 4.8e test: Fund templates — variables filled ({claimant}, {claim_name}, {total}, {total_in_words}, {bill_count}, {date_range}, {purpose}, {breakdown}); preview of form and mail side by side from a sample claim, "Use my last claim"; a filed Claim keeps a snapshot of the template version it used and a later edit changes no past Claim; a personal version is used only for its Claimant
- [ ] 4.8f Fund templates, preview and snapshot
- [ ] 4.8g test: attachment sizing — original files untouched in the mail; about 18 MB raw target; over it, the largest images shrink first, then scanned PDFs, text PDFs never; every shrunk file listed ("3 photos made smaller to fit 25 MB"); originals in paperless unchanged; still too big → offer to split into two mails (fictional files)
- [ ] 4.8h Attachment sizing and the split offer. Open: confirm the limit with one real ~22 MB test draft (design Open Question 14)
- [ ] 4.8i test: file naming (a `no_bill` line has no file and no name) — pattern variables {purpose}, {what} (description, defaulting to "what for"), {vendor}, {person}, {n}, {kind} (Invoice, Bill, Payment); empty parts dropped with their separator; {n} only on a clash, one numbering style; Makerspace default gives "Solder Invoice" and "Club - Acrylic Beads Invoice"; an edited name at filing review is kept
- [ ] 4.8j File naming
- [ ] 4.8k test: moving an Expense to another Purpose or Fund while its Bill is on a draft Claim takes the Bill off that draft and onto the draft Claim of its new Fund; a move inside one Fund keeps the Bill on its Claim
- [ ] 4.8l Move-while-drafted command
- [ ] 4.9 test: submit, recall, mark reimbursed → Bills reimbursed, Claim lines appended to the Ledger, documents re-tagged
- [ ] 4.10 Submission and Reimbursement commands
- [ ] 4.11 test: Owed to university created when a claimed Bill is returned; `open` → `repaid`
- [ ] 4.12 Owed to university commands

## 5. Phase 4: duplicates, Paybacks, Reminders

- [ ] 5.1 test: Ledger import from the maintainer's history (dry run, idempotent re-run); block rules (Bill number + amount, Amazon order + shipment, file checksum) across Claimants; cross-Claimant hits show only "already claimed by"
- [ ] 5.2 Ledger import and block rules
- [ ] 5.3 test: warn rule (amount ±7 days, similar vendor, incl. Ledger); "different" remembered per pair forever
- [ ] 5.4 Warn rule and remembered pairs
- [ ] 5.5 test: Payback — link moves the colleague's Bills and closes their Expense; undo until a Bill is submitted; unlinked shared Bill blocks both and prompts
- [ ] 5.6 Payback commands
- [ ] 5.7 test: Reminders `items(actor, now)` for every rule in the reminders spec, ageing in the Claimant's zone
- [ ] 5.8 Reminders
- [ ] 5.8a test: Invoice waiting — the only invoice reminder: one item after 14 days from paid-on; "Ask <name> for the <vendor> invoice" when the Orderer is someone else; never twice; no 3-day Bill missing item; Home lists (Waiting for invoice with "Invoice with <name>", Ready to file, Filed awaiting money)
- [ ] 5.8b Invoice waiting rule and Home lists
- [ ] 5.9 test: Notifier with a recording fake — nudge after a logged payment, daily nudge, no subscription
- [ ] 5.10 Web Push Notifier and the daily job

## 6. Phase 5: Claude Code over MCP (read only)

- [ ] 6.0 spike: does the browser open by itself on the first tool call from Claude Code (if not, the skill prints one sign-in link); does a pre-registered client ID, or a Client ID Metadata Document, work against Zitadel with dynamic registration closed; image size limits in MCP results. Record the answers in design Open Question 12
- [ ] 6.1 test: MCP tools (`documents_to_read`, `read_document`, `submit_extraction`) scoped to the Claimant, the maintainer included; another Claimant's document not found; only unconfirmed Bills offered, a confirmed one never, an undone confirmation again; resubmission idempotent; no tool confirms a Bill or touches a Claim
- [ ] 6.2 Dues MCP server (OAuth via Zitadel, scope `extraction`, static or Metadata Document client)
- [ ] 6.3 test: Disconnect records a cut-off time per Claimant; a token issued before it is refused on every computer, one issued after is accepted; Readings already made stay
- [ ] 6.4 Connection, Disconnect and the consent page (Allow / Don't allow, the words in `docs/research/notes/Claude Code checks UX/decisions.md`); Settings shows connected since and last read (date, count); phone shows "Connect from your computer."
- [ ] 6.5 test: differing Readings stop only total, date, bill number and GSTIN after conversion; no-default total ("Choose 1 or 2"); "Two readings agree" only on a printed bill's stopping total from different model families; a Reading arriving for an open Bill changes nothing under the hand
- [ ] 6.6 Differing-Readings rules in Intake's fold
- [ ] 6.7 Claude Code plugin (remote MCP server + one skill, "read my bills"), the one-line install in Settings (`claude plugin install <plugin> --marketplace <repo> -y && claude "read my bills"`), and the run's terminal lines (results and failures; nothing in Dues)

## 7. Release

- [ ] 7.1 Backups (Postgres dump + paperless export) to a target off the app host; restore tested
- [ ] 7.2 Delete paperless test documents before production (FUNCTIONAL §11)
- [ ] 7.3 code-review of each phase before merge (opus); P1/P2 fix sections added below as reviews find issues
