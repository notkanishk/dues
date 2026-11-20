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
| Assistant API over HTTP | token scope, idempotent endpoints, contract | UI |

Stack-specific commands are filled in at task 1.6.

## 1. Phase 0: stack decision and spikes

- [ ] 1.1 Finish the invoice-parsing experiment (branch `prototype/explorations`); score all variants against the gold set; write the verdict and the extraction approach (local rules, Python worker, or LLM/vision) into this change
- [ ] 1.2 Spike: fill the real form template with the chosen docx library from one fictionalised Claim; convert with Gotenberg; compare page count, table, fonts (Arial / Arial Narrow) against the Word-exported PDF
- [ ] 1.3 Spike: decode a real Zitadel token for a test user; record the exact roles-claim shape as a fixture (no secrets) for task 2.6
- [ ] 1.4 Spike: paperless OIDC login against a Zitadel test client; per-user API token upload owner; webhook payload, custom secret header and whether OCR text is ready when it fires
- [ ] 1.5 Device test: share the success screen from CRED, Google Pay, PhonePe, Paytm, BHIM and a bank app; record image vs text vs nothing; check HEIC handling in paperless
- [ ] 1.6 Decide the stack from 1.1–1.2; record it as ADR 0006; fill in this file's build/test commands and the Extractor Adapter choice; freeze the Extractor contract (design §3)

## 2. Phase 1: foundations, identity, Expense core

- [ ] 2.1 Scaffold the repo (app, worker, Postgres 18, Gotenberg in Docker Compose); CI runs tests against a real Postgres; `<APP_HOST>` deploy notes stay in `private/`
- [ ] 2.2 test: money — paise in, paise out; sums exact; no float path (platform-foundations)
- [ ] 2.3 Money type and formatting (₹ Indian grouping, two decimals, paise kept as printed)
- [ ] 2.4 test: Keys and References — UUIDv7 keys; `E-`/`B-`/`R-`/`O-` References global, unpadded, immutable (ADR 0005)
- [ ] 2.5 Schema for Expense, Bill, Refund, Owed to university, audit log; sequences for References
- [ ] 2.6 test: `authenticate` on recorded tokens — no `claimant` role refused; `admin` passes ownership; role removed refused
- [ ] 2.7 Claimants: OIDC code + PKCE login, Actor, profile (name, employee code, designation, Approvers, time zone, Payment methods with match hints)
- [ ] 2.8 test: Books `LogExpense` → `open` Expense with one expected Bill (online) or fulfilled Bill (shop/service); audit entry written in the same transaction
- [ ] 2.9 Books shell: `execute(actor, command)` with per-Claimant lock, events, audit log
- [ ] 2.10 test: Open amount and "why it's open" derived on read for awaiting goods, refund owed, bill missing, mismatch, in claim
- [ ] 2.11 Derivation of status, Open amount and reason (no stored status)
- [ ] 2.12 test: Order flow — split expected Bill per invoice; cancel part → expected Refund; cancel rest; return before claim → Bill cancelled permanently
- [ ] 2.13 Order commands
- [ ] 2.14 test: Refund expected → received; Expense settles only when Open amount is zero, every Refund arrived, every Bill reimbursed or cancelled
- [ ] 2.15 Refund commands and settling
- [ ] 2.16 test: corrections allowed until a Bill is on a submitted Claim; "differs from the document" flag; closing (personal / duplicate / written off) rules
- [ ] 2.17 Correction and closing commands
- [ ] 2.18 test: authorization — another Claimant's Expense is `not_found`; admin sees it and is audited as actor
- [ ] 2.19 Authorization at the Actor Seam

## 3. Phase 2: document intake and matching

- [ ] 3.1 test: Extractor contract fixtures (fictionalised payment confirmations, GST invoices, receipts, handwritten bills) → kind + fields + confidence
- [ ] 3.2 Extractor Adapter chosen in 1.6, plus a canned fake
- [ ] 3.3 test: Paperless Adapter against a recorded-response fake (get, download, annotate, upload, findByChecksum)
- [ ] 3.4 Paperless HTTP Adapter (service-account token)
- [ ] 3.5 test: Matching `propose` — one clear match, several candidates (Check), none; ±₹1 / ±10 days; one Payment for 2–3 invoices from one vendor; four invoices get no suggestion
- [ ] 3.6 Matching
- [ ] 3.7 test: Intake — payment confirmation logs an Expense at once; same UPI reference attaches instead; unreadable → "Couldn't read" Expense; two unreadables within 10 minutes → "Same payment as E-x?"; invoice-first logs an Expense with Payment method "not recorded"; late confirmation fills it; repeat webhook is a no-op
- [ ] 3.8 Intake and the webhook endpoint (secret check, idempotent)
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
- [ ] 4.5 test: naming — fixed at package build, renamed if rebuilt in a later month before submission, frozen at submission and after recall
- [ ] 4.6 Claim naming
- [ ] 4.7 test: Claim package `build` with fake PdfConverter — rows grouped by purpose, form shows invoice data only, email subject and breakdown; one golden test through real Gotenberg
- [ ] 4.8 Claim package (template fill + Gotenberg Adapter)
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
- [ ] 5.9 test: Notifier with a recording fake — nudge after a logged payment, daily nudge, no subscription
- [ ] 5.10 Web Push Notifier and the daily job

## 6. Phase 5: assistant API

- [ ] 6.1 test: personal access tokens scoped to the maintainer; another Claimant's data refused; idempotency keys
- [ ] 6.2 Tokens and API shell
- [ ] 6.3 test: Back-fill drafts, Amazon picks, invoice upload with a Reference, mark reimbursed, sync manifest
- [ ] 6.4 Assistant endpoints

## 7. Release

- [ ] 7.1 Backups (Postgres dump + paperless export) to a target off the app host; restore tested
- [ ] 7.2 Delete paperless test documents before production (FUNCTIONAL §11)
- [ ] 7.3 code-review of each phase before merge (opus); P1/P2 fix sections added below as reviews find issues
