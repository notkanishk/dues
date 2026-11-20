# Reimbursement Tracker — Functional Spec (v1)

Function only; UI is designed separately. Terms are defined in [GLOSSARY.md](GLOSSARY.md); decisions in [docs/adr/](docs/adr/). Where this spec and `mockup/DESIGN.md` disagree, this spec wins.

## 1. Principles

0. **Multi-Claimant.** Anyone at the makerspace can sign in (Zitadel, OIDC) and track and file their own Claims. Every Expense, Bill and Claim belongs to one Claimant; the Ledger and duplicate check span all Claimants.
1. **Money first.** An Expense exists the moment money leaves the Claimant's account, before any order number or document exists.
2. **One invariant drives everything:** `Open amount = Payment − Σ Bills − Σ Refunds`. Every reminder is some form of "this Expense still has an Open amount, and here is why".
3. **Bills are claimed, not Expenses.** A Bill goes on a Claim when it is Fulfilled and has its document. One Expense can feed several Claims (Amazon splits invoices per delivery).
4. **The tracker owns status; paperless owns documents** (ADR 0001). Files are mirrored between paperless and the Mac folder additively (ADR 0002).
5. **The app builds Claims; Claude is optional** (ADR 0003). Form, PDF and submission package are app features for every Claimant. Claude only helps with browser jobs (Amazon orders, invoice downloads) and the maintainer's own convenience. Nothing is sent or submitted without the Claimant.
7. **Statements never enter the app.** Day to day, Refunds and Reimbursements are marked received by hand. Back-fill is done by Claude outside the app: Claude reads the statement and creates draft Expenses through the app's API, which the Claimant then confirms in the app.
6. **Suggest, then confirm.** Matching (document ↔ Expense, Amazon order ↔ Expense) is proposed automatically and confirmed with one action. Never silent.

## 2. Entities

### Expense
| Field | Notes |
|---|---|
| id | Reference, e.g. `E-213` (ADR 0005) |
| status | `draft` · `open` · `settled` · `closed` (§3.1) |
| paid_on | Date of the Payment |
| amount | Payment amount, ₹ 2dp |
| claimant | Owner |
| payment_method | One of the Claimant's own Payment methods (free text they define in settings) |
| payee | Who the money went to: a vendor, or a colleague for a Payback |
| vendor | Who sold the goods/service (same as payee unless Payback) |
| kind | `online` (order on a site) · `shop` (in person / QR) · `service` (no goods: cab, printing, AWS) |
| orderer | Person who placed the order (default: the Claimant) |
| payback | true when the Payment was to a colleague who paid the vendor |
| order_ref | Site order number, optional |
| purpose | Free tag ("O-week", "Robotics club") — groups the claim email breakdown |
| upi_ref | 12-digit UPI reference, optional; strongest key for Back-fill de-duplication |
| source | `manual` · `document` · `amazon` · `back-fill` |
| proof_docs | paperless IDs of Payment proofs (payment-app screenshots, card/bank receipts) |
| notes | Free text |

### Bill
| Field | Notes |
|---|---|
| id | `B-431` |
| expense_id | Parent Expense |
| kind | `invoice` · `informal` · `payment_proof` |
| bill_no | As printed; empty for informal/payment proof |
| bill_date | Date on the bill |
| amount | ₹ 2dp |
| description | Becomes the Claim line description |
| fulfilled | bool + `fulfilled_on` |
| paperless_id | Document ID; required before the Bill can be claimed |
| status | `expected` · `ready` · `claimed` · `reimbursed` · `cancelled` (§3.2) |
| claim_id | Set when added to a Claim |
| remarks | e.g. "Informal/raw bill attached" (auto for `informal`) |

### Refund
`id, expense_id, amount, refunded_on, reason (cancelled | returned | partial)`. Status `expected` → `received`.

### Claim
`id`, `claimant`, `name` (assigned **at first submission**: submission month + sequence among that Claimant's Claims that month, e.g. `2026/November1`; drafts are just "Draft"; a recalled and resubmitted Claim keeps its name), `status` (§3.3), `submitted_on` (latest submission), `reimbursed_on`, `total` (Σ Claim lines, rounded **up** to whole rupees), `form_doc` (paperless ID of the form PDF).

**Rounding:** a Claim's total is rounded up to whole rupees (as the university form requires); Claim lines keep exact paise. Both are stored on the Claim; the difference is not tracked anywhere else.

### Owed to university
`id`, `claimant`, `bill_id`, `claim_id` (the submitted Claim the Bill was on), `amount`, `status` (`open` · `repaid` with date). Created when a Bill already on a submitted Claim is returned (W2.6). Not expected to happen in practice; exists only so the money trail can't silently break. Never appears on a form (no minus lines).

### Ledger line (history)
The existing `ledger.csv` rows (199 at import). Read-only history: date, bill_no, description, amount, claim. Imported as Ledger lines with no Expense or Bill behind them (design D9), so the duplicate check sees them.

### Claimant (profile)
Identity from Zitadel (subject, name, email). Profile fields the form needs: full name, employee code, designation. Approvers (names + emails for the submission email). Payment methods (list of labels, e.g. "Savings account", "Credit card", "Cash"; editable, can be archived, never hard-coded), each with optional match hints (bank name, card last 4, UPI handle) used to recognise it on a payment screenshot. Notification preference (Web Push on/off, daily nudge time). Claim naming sequence.

### Person
`name`, optional `upi_handle`, optional link to a Claimant. Used for Orderer and Payback payees.

## 3. State machines

### 3.1 Expense (derived, never set by hand except `closed`)
```
draft ──confirm──▶ open ──Open amount = 0 and all Bills reimbursed/cancelled──▶ settled
  │                  │
  └──discard──▶ closed ◀──mark personal / duplicate / written off──┘
```
- `draft`: created from an Amazon pick or a Back-fill and not yet confirmed by the Claimant. Shared payment confirmations (W1) and bills (W4) skip `draft` and open the Expense directly.
- `open`: confirmed, Open amount ≠ 0 or some Bill not yet reimbursed.
- **Corrections:** amount, payee, date and Payment method stay editable until one of the Expense's Bills is on a submitted Claim; every edit goes to the audit log.
- **Closing** (personal / duplicate / written off) asks what happens to each expected Refund (still expected, or written off) and cancels unclaimed Bills; blocked if any Bill is on a submitted Claim.
- **Why it's open** (shown everywhere, drives reminders): `awaiting goods` (Bills expected, not fulfilled) · `refund owed` (Refund expected) · `bill missing` (fulfilled, no document) · `mismatch ₹X` (nothing expected any more, but Bills + Refunds ≠ Payment) · `in claim` (all covered, waiting for Reimbursement).

### 3.2 Bill
```
expected ──goods arrive / service done──▶ fulfilled? ──document attached──▶ ready ──added to Claim──▶ claimed ──Reimbursement──▶ reimbursed
   │                                          (ready requires both fulfilled AND paperless_id)
   └──cancelled before fulfilment──▶ cancelled  (creates an expected Refund of the same amount)
```
- `shop` and `service` Expenses create their Bill already fulfilled.
- A bill arriving first creates its Expense and a fulfilled, `ready` Bill (you can only scan what you have); no payment record is needed to claim it.
- Only `ready` Bills can be added to a Claim. Also blocked: a Bill matching a Ledger line (§7); a Bill with an open "Check" match (W4.3, one tap to confirm or move); a Bill held by two Claimants with no Payback link (W9.5); a Bill whose Expense has no "what for" (it can be typed inline while building the Claim, W7).
- **Corrections after a document is attached:** amount, bill no and date stay editable (e.g. the reader got them wrong). The Bill then shows "differs from the document" until the Claimant confirms the document says so; every edit goes to the audit log. Locked once the Bill is on a submitted Claim.

### 3.3 Claim
```
draft ──app builds form + package, Claimant sends──▶ submitted ──marked reimbursed──▶ reimbursed
  ▲                                                             │
  └───────────────────────recall (edit and resend)──────────────┘
```
- Adding/removing Bills only in `draft`. A Claimant can have several `draft` Claims.
- Recall returns the Claim to `draft` with its name; resubmitting updates `submitted_on`.
- On `reimbursed`: Bills → `reimbursed`, Claim lines appended to the Ledger, documents re-tagged `reimb:reimbursed`.

## 4. Workflows

Each step marks who acts: **K** (the Claimant), **T** (tracker app), **P** (paperless), **C** (Claude, optional, maintainer only).

### W1. Log a payment right after paying (phone) — the zero-friction path

**Goal:** paying, then sharing the payment confirmation, is the *only* required action — whatever the Claimant pays with (CRED, GPay, PhonePe, Paytm, BHIM, a bank app, a card). Everything else is automatic or optional later.

1. **K (the only required step):** share the payment confirmation to the paperless uploader, pinned as a Direct Share target so it is one tap: the payment app's success screen (its share button if it gives an image, otherwise screenshot → share), a card/bank receipt, or an order confirmation for card checkouts.
2. **P:** stores it under K's paperless user (owner = Claimant), type `Payment proof`, tag `inbox`; webhook to T.
3. **T: extracts** from the OCR text with an app-agnostic parser: amount (₹ figure), payee name ("Paid to", "To", merchant line), date-time, transaction reference (12-digit UPI ref / UTR / transaction ID — labels differ by app), and the paying bank/card as shown. Small per-app recognisers can be added for common apps, but nothing assumes one app. If OCR text is too poor, T may run a local vision model (GPU host) as a second pass; never an external service.
4. **T: logs the Expense immediately** — not a draft. Kind guessed from the payee (known vendor history; Amazon/Robu/Blinkit → `online`, else `shop`), Payment method matched via the Claimant's method hints (bank name, card last 4, UPI handle), "what for" left empty. Dedupe: a second screenshot with the same UPI ref attaches to the existing Expense instead of creating one. When neither can be read (no ref), two confirmations from the same Claimant within 10 minutes get "Same payment as E-x?" (one tap merges; never automatic).
5. **T: optional nudge** — a Web Push notification to K's phone: "₹2,500 to Robu.in logged. What was it for?" with actions *Add details* (opens a one-field form: what for; kind and order ref one tap away) and *Later*. Ignoring it is fine.
6. **Later, in batch:** Expenses missing "what for" collect under one attention item ("3 payments need a description"); the daily nudge links there. They can be described in one pass, and "what for" is needed only before a Bill goes on a Claim.

**When extraction fails:** the Expense is still created with the screenshot attached and amount blank, flagged "Couldn't read this payment" — never dropped. K fills the amount once.

**No confirmation to share** (cash, or an app that shows nothing useful): quick-add form in T — amount + what for, two fields. Claude Back-fill (W6) remains the maintainer's catch-all for anything forgotten.

**Checks before build:** which paperless uploader app supports Android Direct Share (and iOS share sheet, for iPhone Claimants) and logs in as the Claimant's own paperless user; extraction accuracy on a sample of real confirmations from several apps (CRED, GPay, PhonePe, Paytm, a bank app; ~10 each).

### W2. Online order: delivery, partial delivery, cancellation
1. An `online` Expense is the Order. It starts with **one expected Bill for the full Payment** and reason `awaiting goods`.
2. As each delivery's Invoice arrives (W4 or W5), it is split off the expected Bill as its own fulfilled Bill; the expected remainder shrinks. Each Invoice can be claimed on its own, so an Order can be partly reimbursed.
3. Cancelling part of an Order reduces the expected remainder by that amount and creates an expected Refund for it; cancelling everything left turns the remainder into a Refund.
4. K marks a Refund received when the money is back.
5. Returned after delivery (Bill not yet on a submitted Claim): Bill → `cancelled` permanently (it can never become ready again, even after a recall) and an expected Refund.
6. Returned after the Bill was on a submitted Claim: T creates an **Owed to university** record (§2) and an attention item; K marks it repaid. Has never happened.
7. Replacement with no money change: nothing changes except the Bill stays expected longer.
8. The Order completes (Expense `settled`) when its Bills + Refunds add up to the Payment and every Bill is reimbursed or cancelled.

### W3. Shop or service payment
1. W1, with kind `shop` or `service` → one Bill created already fulfilled, reason `bill missing`.
2. K scans the paper bill (W4) or, if none exists, marks the payment confirmation as the Bill (`payment_proof`). Bill → `ready`.

### W4. A document arrives (phone share, upload, email, Mac drop)
Any document is logged with zero further steps; matching prevents the same purchase becoming two Expenses, whatever order the payment confirmation and the invoice arrive in.
1. P: stores it under the uploader's paperless user, tag `inbox`; webhook to T.
2. T classifies it: **payment confirmation** (→ W1) or **bill** (Invoice / Informal bill), from OCR text.
3. For a bill, T extracts vendor, bill no, bill date, total, and looks for the Claimant's Expense it belongs to: open amount ≥ bill total, vendor/payee similar, date within ±10 days (or exact Expense ID / order no when known).
   - **One clear match** → attached as a fulfilled Bill automatically (splitting an Order's expected Bill when it is an online Expense).
   - **Several candidates** → attached to the best one, with "Check: could also be E-xxxx" in attention; one tap to confirm or move it. The Bill can't go on a Claim until then.
   - **No match** → a new Expense is **logged immediately** from the invoice: amount = bill total, vendor, paid_on = bill date, Payment method "not recorded". The Bill is fulfilled and claimable at once — a payment record is never required to claim.
4. A payment confirmation arriving later for that Expense (same amount ±₹1, date ±10 days, payee ≈ vendor) attaches to it as Payment proof and fills paid_on, Payment method and reference — instead of creating a new Expense.
   - **One payment for several invoices:** if the payment equals the sum of 2–3 invoice-only Expenses from the same vendor within ±10 days, T suggests merging them into **one Expense** (one tap, never automatic). Each invoice stays its own Bill, so each is still its own Claim line.
5. T writes back to paperless: removes `inbox`, sets document type, correspondent (vendor), custom fields (§5), tag `reimb:ready`.
- Earlier "draft from document" behaviour is replaced by this; `draft` remains only for Amazon picks and Back-fill.

### W5. Pick my orders from the shared Amazon account (laptop)
1. K presses "Read Amazon" in T → hand-off to C.
2. C (Claude in Chrome, logged-in session, read-only) reads orders since the last run: date, order no., items + images, total, ship-to, payment method, placed-by, delivery status per shipment, invoice availability. Posts them to T as candidates.
3. K ticks the orders he paid for (or paid back the orderer for). Each tick → Expense (`online`, orderer from Amazon "placed by") with one expected Bill per shipment; already-delivered shipments are marked fulfilled.
4. For fulfilled shipments, C downloads the invoice PDF and uploads it to P with the Expense ID → W4 auto-attaches (exact Expense ID, no suggestion needed).
5. Candidates matching a Ledger line or an existing Expense (order no.) are shown as already tracked.

### W6. Back-fill (Claude only, outside the app)
1. The maintainer asks Claude to back-fill a period. Claude gets the statement (downloads it from the bank's site in Chrome after the maintainer logs in, or reads a file the maintainer provides), parses it, and drops lines already tracked (same amount ±3 days, or UPI ref).
2. Claude asks the maintainer which remaining lines are lab Expenses, then creates them through the app API as `draft` Expenses (source `back-fill`, amount, date, payee, Payment method, UPI ref), attaching any matching documents.
3. The maintainer confirms the drafts in the app like any other draft (W1 step 4).
- The app has no statement upload, parser or reconciliation screen; it only needs the API to create drafts and to list existing Expenses for de-duplication.

### W7. Build and submit a Claim (app feature, ADR 0003)
1. Claimant selects `ready` Bills (default: all) → T creates a `draft` Claim, runs the duplicate check (§7) across all Claimants. Bills whose Expense lacks "what for" are listed with an inline field to fill it here.
2. T fills the Contingency Reimbursement Form from the Claimant profile and Claim lines (grouped by `purpose`, total rounded **up**, amount in words), renders the PDF, and assembles the submission package: form PDF + Bill files + email subject/body with the purpose breakdown, addressed to the Claimant's Approvers.
3. T stores the form PDF as a `Claim form` document and tags the Bills' documents with the Claim.
4. Claimant sends the email themselves (download package / open mail client), then marks the Claim `submitted`.
- Maintainer only: Claude can additionally create the Gmail draft and copy files to the maintainer's local folder workflow.

### W8. Reimbursement arrives
1. Claimant marks the Claim reimbursed when the money arrives (one credit per Claim, paid in full) → §3.3 completion: Bills `reimbursed`, Claim lines appended to the Ledger, documents re-tagged.
2. During a Back-fill, Claude can mark it via the API when it finds the credit.

### W9. Payback to a colleague
1. Colleague paid the vendor; Claimant pays the colleague back (W1).
2. Expense records `payback = true`, payee = colleague, vendor = the shop/site (kept separately), orderer = colleague.
3. If the colleague is also a Claimant and logged that vendor payment as their own Expense, T offers to link it: their Expense closes as "paid back by <Claimant>" and its Bills move to the Payback Expense. Otherwise Bills come from the colleague (forwarded invoice) → W4.
4. The form shows only the invoice (date, bill no, description, amount). Payback, payee, Orderer and Payment method never appear on the form; they live in the app only.
5. **Undo:** the link can be undone (colleague's Expense reopens, Bills move back) until any of those Bills is on a submitted Claim; then it is locked.
6. **Never linked:** if both Claimants hold the same Bill (§7 match) and no link exists, **both** are blocked from claiming it and both get "Link as payback?"; never first-claimer-wins.

## 5. paperless-ngx setup (to be created by Claude; currently fresh install)

**Multi-Claimant:** each Claimant has a paperless user (same Zitadel identity via paperless OIDC login, to confirm with infra). Documents are owned by the uploading Claimant; the tracker's service account can read all and only shows a Claimant their own. The owner on a phone upload is how T knows whose draft Expense to create.

**Document types:** Invoice · Informal bill · Payment proof · Claim form.

**Tags:** `inbox` (auto on every new document, removed when linked) · `reimb:ready` · `reimb:claimed` · `reimb:reimbursed` · `personal`.

**Correspondents:** vendors (auto-learned; created on confirm in W4).

**Custom fields:**
| Field | Type | Purpose |
|---|---|---|
| Expense ID | Text | Tracker link (`E-213`); set on uploads that already know their Expense so W4 can auto-attach |
| Bill ID | Text | `B-431` |
| Amount | Monetary (INR) | Bill amount as confirmed |
| Bill no | Text | As printed |
| Claim | Text | e.g. `jdoe/2026/November1` |

**Storage path:** `{{ owner_username }}/{{ created_year }}/{{ document_type }}/{{ title }}` — paperless media lives on TrueNAS (§6).

**Workflows:**
1. *Inbox on arrival* — Document Added (any source) → tag `inbox`.
2. *Notify tracker* — Document Added → Webhook `POST <tracker>/hooks/paperless` with document ID.

**Intake channels:** Android uploader app (share menu) for payment screenshots and photos; web upload; optional mail rule per Claimant for forwarded invoices.

**API use by the tracker:** service-account token; `GET /api/documents/<id>/` (+ OCR content) on webhook; `custom_field_query` to find by Expense/Bill ID; `bulk_edit` to set tags/fields on confirm; `post_document` (+ `/api/tasks/`) for uploads (claim forms, Amazon invoices).

## 6. File storage (ADR 0004)

- Documents live in a dedicated TrueNAS dataset (e.g. `<pool>/reimbursements`) exported over NFS only to the Proxmox host (`<PVE_HOST>`), mapped to one service UID, bind-mounted into the paperless LXC and the tracker LXC. Not on the general SMB share, not in user home folders, never mounted on client machines.
- **Blocked** until the NAS has snapshots, an off-site backup and healthy disks. **Launch on paperless's local disk** with the nightly backup, only until TrueNAS is connected; preparing the NAS is a separate task, and the move needs the maintainer's OK.
- Other Claimants never see or need a folder; the app offers "download Claim" for local copies.
- Historic `Filed/` content is imported once: files into paperless (owner: the maintainer, tagged with their Claim), rows already in the Ledger.

### 6.1 The maintainer's Mac folder (ADR 0002, maintainer only)

The maintainer keeps a local `Reimbursement` folder in sync with their data in the app. Claude runs the sync on demand ("sync") and before building a Claim.
- **Mapping:** root = their Bills not yet in any Claim; `Working`, `Working2`, `Working3` = their `draft`/`submitted` Claims (one each); `Filed/<year>/<Claim>` = their `reimbursed` Claims. Each folder also holds that Claim's form docx/PDF.
- **Folder → app:** a new file in the root (SHA-256 not yet in paperless) is uploaded to paperless with the maintainer as owner and tag `inbox` → W4.
- **App → folder:** a Bill document missing locally is downloaded into the folder its Bill/Claim maps to; when a Claim changes state, Claude moves its folder accordingly (WorkingN → `Filed/<year>/<Claim>`).
- Additive and keyed by SHA-256 = paperless `checksum` (paperless 3.x uses SHA-256): never deletes or renames across; local renames don't break links.

## 7. Duplicate check

Runs on: confirming an Expense, attaching a Bill, Amazon pick, adding a Bill to a Claim. Spans all Claimants.
- **Block**: same `bill_no` + same amount as a Ledger line or another Bill (any Claimant); same Amazon order + shipment already tracked; same file checksum already linked to another Bill.
- **Warn**: same amount within ±7 days and similar vendor, no bill_no to compare — checked against open Bills **and the Ledger** (catches Informal bills and Payment proofs, which have no number). Resolve "same thing" (merge/close one) or "different" (remembered per pair, permanently; that pair never warns again).
- A Payback and the colleague's linked Expense are one purchase, not duplicates (W9 merges them).
- Cross-Claimant hits show only that the Bill is already claimed and by whom, not the other Claimant's details.

## 8. Reminders ("needs attention" rules)

| Rule | Condition |
|---|---|
| Draft waiting | Expense `draft` > 1 day |
| Goods late | Bill `expected` > 7 days after paid_on |
| Bill missing | Bill fulfilled, no document > 3 days |
| Refund owed | Refund `expected` > 10 days |
| Mismatch | Nothing expected (no expected Bill or Refund) but Bills + Refunds ≠ Payment; fires at once. Fix: add a Bill, record a Refund, or correct the amount |
| Needs description | Expense without "what for" (one grouped item; daily nudge) |
| Couldn't read | Payment proof whose amount couldn't be extracted |
| Owed to university | Owed to university record `open` |
| Check match | Bill attached with another candidate Expense, not yet confirmed |
| Link as payback? | Same Bill held by two Claimants, no Payback link |
| Claim unpaid | Claim `submitted` > 45 days |
| Possible duplicate | §7 warn |

## 9. Claude helpers (maintainer only; the app works without them)

Claude talks to the app through its API with a personal access token scoped to the maintainer's own data.

| Job | Output |
|---|---|
| Back-fill (W6) | Draft Expenses created via API |
| Read Amazon orders (shared lab account, Chrome) | Draft Expenses / expected Bills via API |
| Fetch Amazon invoices for fulfilled Bills | Uploaded to paperless with Expense/Bill ID |
| Mac folder sync (§6.1) | The maintainer's Reimbursement folder mirrors their Bills and Claims |
| Gmail draft for a Claim | Draft in the maintainer's Gmail |

## 10. Platform and security

- **Identity:** Zitadel (`auth.example.org`), sign-in via Google Workspace only. New Zitadel project "Reimbursements" with a confidential OIDC web app (authorization code + PKCE). Authorise from the `roles` claim: signing in without the `claimant` role gets no access (no self-service onboarding); project roles `claimant` and `admin` (later `approver`, `finance` if approvals move into the app). Roles granted and reviewed through Syndra. Users keyed on Zitadel user ID (`sub`), not email. No local passwords, no second user DB beyond the profile.
- **Profile gaps:** Zitadel has name and email only; employee code and designation are entered by the Claimant once in their profile.
- **paperless-ngx:** its own LXC (`<PAPERLESS_HOST>`). Put behind the internal Caddy as `paperless.example.org`; enable its OIDC login against Zitadel so each Claimant's phone uploads carry their owner. Its disk is small and local; storage moves per §6.
- **Tracker hosting:** own LXC on the Proxmox host (`<PVE_HOST>`) running Docker Compose (app + Postgres), served as `dues.example.org` by the internal Caddy (`<PROXY_HOST>`, whose wildcard cert already covers it). Off campus via NetBird. Not published on the public reverse proxy.
- **Tracker LXC:** a dedicated container (`<APP_HOST>`) on the Proxmox host, on the same internal network as the proxy and paperless, addressed by a DHCP reservation on the router (no in-container static IP, per network policy).
- **The app is the only gate** (the network does not isolate hosts, so the app enforces access itself): every API call checks the session and Claimant ownership. Inbound limits (app port only from the proxy + paperless) are enforced on the tracker host itself (Docker binds Postgres/Gotenberg to the internal network only; nftables in the CT or the Proxmox firewall on net0).
- **Data rules:** money stored as integer paise + currency code; append-only audit log written before every state change (who, what, when, from-state, to-state).
- **Time (infrastructure in UTC, people see local time):**
  - Hosts, containers, Postgres (`timezone`, `log_timezone`) and cron run in **UTC**; cron lines carry a comment with the IST equivalent.
  - Moments (created/updated, state changes, audit log, webhook receipt) are `timestamptz`, stored UTC, exchanged as ISO 8601 with offset (`2026-11-20T09:14:10Z`).
  - Business dates (paid_on, bill_date, refunded_on, submitted_on, reimbursed_on) are plain `date` values: the calendar day as the Claimant experienced it, never converted.
  - Each Claimant has a time-zone setting (IANA name, default `Asia/Kolkata`, suggested from the browser on first sign-in). It decides display, "today", reminder ageing ("Goods late > 7 days") and the submission month used to name Claims.
  - Dates extracted from screenshots and bills are read in the Claimant's zone; a payment at 00:30 IST is that day, not the previous UTC day.
  - paperless keeps `PAPERLESS_TIME_ZONE=Asia/Kolkata` (its display zone and document `created` date).
- **Uploads:** check type (PDF, JPEG, PNG, HEIC), cap size, never execute, downloads served as attachments.
- **Backups:** Postgres dump + document store backed up to a target other than the Proxmox host's local disk; restore tested before go-live.
- **Change control:** every write to Zitadel, TrueNAS, Caddy or pfSense is done one at a time with the maintainer's explicit approval and a backup of the config first.

## 11. Open questions

Remaining items are facts to check, not decisions:
1. NAS readiness (snapshots, off-site backup, healthy disks): separate infrastructure task; launch does not wait for it.
2. ~~paperless OIDC~~ **Checked 2026-11-20** (installed source on the paperless host + [fact checks](../research/notes/Tracker%20fact%20checks/fact_checks.md)): allauth 65.16.1 `openid_connect` is installed; config via `PAPERLESS_APPS` + `PAPERLESS_SOCIALACCOUNT_PROVIDERS`, callback `https://<host>/accounts/oidc/<provider_id>/login/callback/`; `PAPERLESS_SOCIAL_AUTO_SIGNUP=true` and `PAPERLESS_SOCIAL_ACCOUNT_DEFAULT_GROUPS` = a group with *Add document* (else uploads get 403); OIDC-only users can generate a profile API token; uploads are owned by the token's user (`owner_id=request.user.id`, client can't override). Uploaders: Android = gmag11 "Paperless NGX Uploader" (share target, pasted API token, no OIDC); iOS = Swift Paperless (share extension, OIDC via a **public PKCE** client, likely a second Zitadel app). Still to test live: Zitadel roles claim (JSON object) → paperless group sync.
3. Server-side form rendering must match the current docx exactly — test LibreOffice conversion against a Word-exported PDF.
4. Which payment apps' success screens can share an image directly vs need a screenshot. Official pages confirm a Share button only for Google Pay and Paytm, and say nothing about image vs text for any app: **device test needed** (CRED, GPay, PhonePe, Paytm, BHIM, a bank app). W1 already falls back to screenshot → share.
3a. Form PDF (item 3) will be tested with Gotenberg on the tracker's own LXC once it exists.

Resolved 2026-11-20, round 2: access by `claimant` role via Syndra only · form carries invoice data only (no payback/payee info) · Owed to university: repaid only, never on a form · launch on local disk until TrueNAS is connected.

Resolved 2026-11-20 (logic-prototype grilling, round 1): Check blocks claiming · one payment for several invoices = one Expense, one Claim line per invoice · "different" remembered per pair · Unaccounted replaced by Mismatch · Owed to university is a record · Payback link undoable until submitted · unlinked shared Bill blocks both · missing "what for" blocks, fill inline · corrections after document flagged · rounding stored on Claim only · Claim keeps name after recall · unreadable twins offered as same payment.
