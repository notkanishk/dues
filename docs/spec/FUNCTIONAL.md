# Reimbursement Tracker — Functional Spec (v1)

Function only; UI is designed separately. Terms are defined in [GLOSSARY.md](GLOSSARY.md); decisions in [docs/adr/](docs/adr/). Where this spec and `mockup/DESIGN.md` disagree, this spec wins.

## 1. Principles

0. **Multi-Claimant.** Anyone at the makerspace can sign in (Zitadel, OIDC) and track and file their own Claims. Every Expense, Bill and Claim belongs to one Claimant; the Ledger and duplicate check span all Claimants.
1. **Money first.** An Expense exists the moment money leaves the Claimant's account, before any order number or document exists.
2. **One invariant drives everything:** `Open amount = Payment − Σ Bills − Σ Refunds`. Every reminder is some form of "this Expense still has an Open amount, and here is why".
3. **Bills are claimed, not Expenses.** A Bill goes on a Claim when it is Fulfilled and has its document. One Expense can feed several Claims (Amazon splits invoices per delivery).
4. **The tracker owns status; paperless owns documents** (ADR 0001). Files are mirrored between paperless and the Mac folder additively (ADR 0002).
5. **The app builds Claims; Claude is optional** (ADR 0003). Form, PDF and submission package are app features for every Claimant. A Claimant's own Claude Code may read their unconfirmed Bills over MCP (read only, §9); nothing depends on it. Nothing is sent or submitted without the Claimant.
7. **Statements never enter the app.** Day to day, Refunds and Reimbursements are marked received by hand. Back-fill by Claude outside the app (W6) is not part of the current change; it returns later as its own decision.
6. **Suggest, then confirm.** Matching (document ↔ Expense, Amazon order ↔ Expense) is proposed automatically and confirmed with one action. Never silent.
8. **Dues never sends mail.** Not by itself, in any scenario, by any path. It prepares a Gmail draft or files; the Claimant sends. The Claim is marked submitted only after the Claimant says they sent it (W7).

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
| payee | Who the money went to: a vendor, or a colleague for a Payback. Dues remembers each payee's type (shop, online order, paying someone back) and learns which vendor it stands for (§2 Payee memory) |
| vendor | Who sold the goods/service (same as payee unless Payback) |
| kind | `online` (order on a site) · `shop` (in person / QR) · `service` (no goods: cab, printing, AWS) |
| orderer | Person who placed the order (default: the Claimant); set on the "What for?" step as "Ordered by": Me or a recent Person |
| payback | true when the Payment was to a colleague who paid the vendor |
| order_ref | Site order number, optional |
| what_for | Free text answer to "What for?"; needed before a Bill goes on a Claim |
| fund | Link to a Fund (§2): where the money comes from and which Claim it files on. Chosen on the "What for?" step (Makerspace preselected, or the Fund of the active Purpose); a Purpose's Fund when a Purpose is set |
| purpose | Link to a Purpose (§2), optional; none means the Expense sits in its Fund with no group. Groups the claim form lines and the mail breakdown inside that Fund's Claim |
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
| description | Becomes the Claim line description; defaults to the Expense's "what for" |
| fulfilled | bool + `fulfilled_on` |
| paperless_id | Document ID; required before the Bill can be claimed |
| status | `expected` · `ready` · `claimed` · `reimbursed` · `cancelled` (§3.2) |
| review | `in review` (not every field confirmed) · `confirmed`; alongside `status`, not part of it (§3.2) |
| claim_id | Set when added to a Claim |
| remarks | e.g. "Informal/raw bill attached" (auto for `informal`) |
| file_name | Name of the Bill's file in the claim mail and package, made from the Fund's file-name pattern (§2 Fund); shown at filing review and editable for that one file; an edited name is kept |

### Refund
`id, expense_id, amount, refunded_on, reason (cancelled | returned | partial)`. Status `expected` → `received`.

### Claim
`id`, `claimant`, `fund_id` (the Fund it files; each Claim is of exactly one Fund), `name` (made from the Fund's claim-name pattern, e.g. `{Month}{n}`, and assigned **when the submission package is built**, since the Fund's mail can carry it as `{claim_name}`: build month + sequence among that Claimant's named Claims that month, e.g. `2026/November1`; renamed if rebuilt in a later month before submission; frozen once submitted, including after recall; a Claim without a built package shows only "Draft"), `status` (§3.3), `submitted_on` (latest submission), `reimbursed_on`, `total` (Σ Claim lines, rounded **up** to whole rupees, for every Fund), `reimbursed_amount` (the credit actually received, entered when marked reimbursed, defaulting to `total`), `template_snapshot` (the Fund's mail, form, file-name and claim-name templates, as they stood when the Claim was filed; later edits never change a filed Claim), `form_doc` (paperless ID of the form PDF).

**Rounding:** a Claim's total is rounded up to whole rupees for every Fund (not a Fund setting); Claim lines keep exact paise. Both are stored on the Claim; the difference is not tracked anywhere else.

### Owed to university
`id`, `claimant`, `bill_id`, `claim_id` (the submitted Claim the Bill was on), `amount`, `status` (`open` · `repaid` with date). Created when a Bill already on a submitted Claim is returned (W2.6). Not expected to happen in practice; exists only so the money trail can't silently break. Never appears on a form (no minus lines).

### Ledger line (history)
The existing `ledger.csv` rows (199 at import). Read-only history: date, bill_no, description, amount, claim. Imported as Ledger lines with no Expense or Bill behind them (design D9), so the duplicate check sees them.

### Claimant (profile)
Identity from Zitadel (subject, name, email). Profile fields the form needs: full name, employee code, designation. Approvers (names + emails). Payment methods (list of labels, e.g. "Savings account", "Credit card", "Cash"; editable, can be archived, never hard-coded), each with optional match hints (bank name, card last 4, UPI handle) used to recognise it on a payment screenshot. Notification preference (Web Push on/off, daily nudge time). Funds: their own order and which they hide (never shared). Claim naming sequence.

### Fund
| Field | Notes |
|---|---|
| id | Key |
| creator | The Claimant who made it. A new Fund is private to its creator; "Share with team" makes it a team Fund |
| name | e.g. "Makerspace", "Travel grant" |
| mail | A mail builder: To, CC, subject, body. Variables Dues fills: `{claimant}`, `{claim_name}`, `{total}`, `{total_in_words}`, `{bill_count}`, `{date_range}`, `{purpose}`, `{breakdown}`. Nothing goes into the subject or body unless this template puts it there |
| notes | Shown only to Dues users, never in the mail or the form |
| form template | A Word file with placeholders; the PDF is made from it (§4 W7) |
| file_name_pattern | Variables `{purpose}`, `{what}`, `{vendor}`, `{person}`, `{n}`, `{kind}` (§4 W7 File names). Makerspace default `{purpose} - {what} {kind}` |
| claim_name_pattern | e.g. `{Month}{n}` ("September1") |
| what_for_hint | Grey example text on the upload prompt's "What for?" |
| archived | Hidden from the prompt; history kept |

- Settings → Funds. **Makerspace** is a Fund like any other: first by default, its template starting as today's Contingency Reimbursement Form. Each Fund files as its own Claim. No budget or cap for now.
- **Preview.** The Funds page shows the form and the mail side by side, filled from a sample claim, with a switch "Use my last claim".
- **Sharing.** The team version of a Fund is edited by an admin and the Fund's creator. Anyone can make "my version" of a Fund's mail, form, file-name pattern or hint; it overrides only for them, with "Reset to team version". When the team version changes under a personal version, that person sees one line: "Team version updated. Compare".
- **Order and hiding.** Each Claimant orders and hides Funds for themselves only. The upload and payment prompt shows Funds in that order, Makerspace first and preselected.
- **Snapshot.** A filed Claim keeps the template version it used (`template_snapshot`).

### Purpose
| Field | Notes |
|---|---|
| id | Key |
| claimant | Owner |
| name | e.g. "Robotics club", "O-week trip" |
| fund | The Fund it sits in |
| active | bool. Zero or more Purposes can be active at once; ending one ("End trip") stops it catching payments |

- A Purpose is an optional group inside a Fund. Its Expenses form one breakdown group in that Fund's Claim (the form lines and the `{breakdown}` of the mail). An Expense with no Purpose sits in its Fund with no group.
- An active Purpose preselects its Fund on the prompt. With exactly one active, new payments go into it by default; with two or more, the "What for?" step offers the active Purposes as choices plus None.
- Moving an Expense between Funds changes the Advance left of the Funds it leaves and enters, where they have an Advance on (§2 Advance). Which Fund a new Purpose starts on is open (§11).

### Advance (a personal amount on a Fund)
Lives inside a Fund: per Claimant and Fund, never shared, off by default. When on, the Claimant enters one total (₹, paise) for that Fund. No top-up or return records: they edit the total. The Fund chip on the prompt reads "Makerspace" and, with the Advance on, "Makerspace · Advance".

`Advance left (Fund) = Advance total − Σ Payments + Σ Refunds received + Σ Reimbursements received`, over the Claimant's Expenses of that Fund. A Payment lowers it. A Refund or a Reimbursement received raises it by the amount actually received. It can go below zero: the Claimant has their own money in. Funds and Purposes work the same whether the Advance is on or off.

### Payee memory
Per Claimant and payee: the type the Claimant gave (shop, online order, paying someone back) and the vendors the payee has stood for (alias, e.g. a gateway name for a shop). Both are used to guess kind and to match Bills (W4).

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
- **Closing** (personal / duplicate / written off) asks what happens to each expected Refund (still expected, or written off) and cancels unclaimed Bills; blocked if any Bill is on a submitted Claim. In paperless the documents lose their `reimb:*` tag; closing as personal also adds `personal` (written only by Dues, only here), duplicate and written off add no tag.
- **Why it's open** (shown everywhere, drives reminders): `awaiting goods` (Bills expected, not fulfilled) · `refund owed` (Refund expected) · `bill missing` (fulfilled, no document) · `mismatch ₹X` (nothing expected any more, but Bills + Refunds ≠ Payment) · `in claim` (all covered, waiting for Reimbursement).

### 3.2 Bill
```
expected ──goods arrive / service done──▶ fulfilled? ──document attached──▶ ready ──added to Claim──▶ claimed ──Reimbursement──▶ reimbursed
   │                                          (ready requires both fulfilled AND paperless_id)
   └──cancelled before fulfilment──▶ cancelled  (creates an expected Refund of the same amount)

review, alongside status:  in review ──Claimant confirms every field──▶ confirmed
                           in review ◀──any value changes, or Undo confirm──┘
```
- `shop` and `service` Expenses create their Bill already fulfilled.
- A bill arriving first creates its Expense and a fulfilled, `ready` Bill (you can only scan what you have); no payment record is needed to claim it.
- Only `ready` Bills can be added to a Claim. Also blocked: a Bill in review (not every field confirmed); a Bill matching a Ledger line (§7); a Bill with an open "Check" match (W4.3, one tap to confirm or move); a Bill held by two Claimants with no Payback link (W9.5); a Bill whose Expense has no "what for" (it can be typed inline while building the Claim, W7).
- **Field confirmation.** The fields read from a Bill's document (bill no, bill date, amount, and the like) are each confirmed by the Claimant; the reader only proposes. A Bill is **confirmed** when every one of its fields is; until then it is **in review**. How a Claimant reviews a Bill is designed in [`docs/research/notes/Bill review UX/design.md`](../research/notes/Bill%20review%20UX/design.md) §7 (variant R, approved 21 Nov 2026); see ADRs [0008](../adr/0008-region-marking-has-no-keyboard-only-path.md) and [0009](../adr/0009-bill-confirm-reopen-undo-model.md).
- **Confirmed → back in review.** Any change to a value on a confirmed Bill, by any path, reopens it: it is in review until confirmed again. Keeping the reader's value changes nothing and does not reopen. Undo is allowed until the Bill is on a submitted Claim: one "Undo confirm" per Bill restores the values from before the confirm and puts the Bill back in review. Every confirm, reopen, edit and undo goes to the audit log (ADR 0009).
- **Recall unlocks.** When a Claim is recalled (§3.3), its Bills become editable again. Each Bill stays confirmed until one of its values changes; then it goes back to review and must be confirmed again (ADR 0009). "Undo confirm" is offered again, because the Bill is no longer on a submitted Claim.
- **Corrections after a document is attached:** amount, bill no and date stay editable (e.g. the reader got them wrong). An edit reopens review (above); once the value is confirmed again it carries the label "differs from the document". Every edit goes to the audit log. Locked once the Bill is on a submitted Claim.

### 3.3 Claim
```
draft ──app builds form + package, Claimant sends──▶ submitted ──marked reimbursed──▶ reimbursed
  ▲                                                             │
  └───────────────────────recall (edit and resend)──────────────┘
```
- Adding/removing Bills only in `draft`. A Claimant can have several `draft` Claims.
- Moving an Expense to another Purpose or Fund while its Bill is on a draft Claim takes the Bill off that draft and onto the draft Claim of its new Fund.
- Recall returns the Claim to `draft` with its name; resubmitting updates `submitted_on`. In paperless, recall puts `reimb:ready` back on the Bills' documents and keeps the Claim field.
- On `submitted`: documents → `reimb:claimed` with the Claim field set (not at draft).
- On `reimbursed`: Bills → `reimbursed`, Claim lines appended to the Ledger, documents re-tagged `reimb:reimbursed`.

## 4. Workflows

Each step marks who acts: **K** (the Claimant), **T** (tracker app), **P** (paperless), **C** (Claude, optional; only the Claimant's own Claude Code reading over MCP, §9; the other C steps are withdrawn for now).

### W1. Log a payment right after paying (phone) — the zero-friction path

**Goal:** paying, then sharing the payment confirmation, is the *only* required action — whatever the Claimant pays with (CRED, GPay, PhonePe, Paytm, BHIM, a bank app, a card). Everything else is automatic or optional later.

1. **K (the only required step):** share the payment confirmation to the paperless uploader, pinned as a Direct Share target so it is one tap: the payment app's success screen (its share button if it gives an image, otherwise screenshot → share), a card/bank receipt, or an order confirmation for card checkouts.
2. **P:** stores it under K's paperless user (owner = Claimant), type `Payment proof`, tag `inbox`; webhook to T.
3. **T: extracts** the fields by sending the page images to the configured vision-language extractors (ADR 0006): providers pulled by Dues (internal GPU first; external ones only with the Claimant's opt-in) and, when the Claimant says "read my bills" in Claude Code, their own Claude Code (unconfirmed Bills only). Values come back as printed; Dues converts and checks them.
4. **T: logs the Expense immediately** — not a draft, with whatever Dues can read. Kind guessed from the payee (remembered type, known vendor history; Amazon/Robu/Blinkit → `online`, else `shop`), Payment method matched via the Claimant's method hints (bank name, card last 4, UPI handle), "what for" left empty. An order-confirmation screenshot, if shared, fills `order_ref`. Dedupe: a second screenshot with the same UPI ref attaches to the existing Expense instead of creating one. When neither can be read (no ref), two confirmations from the same Claimant within 10 minutes get "Same payment as E-x?" (one tap merges; never automatic).
5. **T: the one question** — Dues asks only "What for?" (a Web Push to K's phone: "₹2,500 to Robu.in logged. What was it for?", actions *Add details* and *Later*; ignoring it is fine). The same step carries:
   - **Ordered by:** Me (default) or a recent Person; stored in `orderer`.
   - **Fund and Purpose:** Funds are shown as choices in the Claimant's own order, Makerspace first and preselected; the chip reads "Makerspace" and, with the Advance on, "Makerspace · Advance". The Fund's "What for?" hint shows as grey example text. An active Purpose preselects its Fund. With exactly one Purpose active, the payment goes into it by default, one tap to put it elsewhere. With two or more active, the step offers the active Purposes as choices plus None. With none active, no Purpose is offered. Kind and order ref stay one tap away.
   - **Payee type:** the first time a payee that is a person (not a shop) appears, Dues asks once: *Shop / Online order / Paying someone back*. The answer is remembered for that payee. "Paying someone back" makes the Expense a Payback (W9).
6. **While waiting for a Bill,** the Expense sits in "Waiting for invoice" (W10). When the Orderer is someone else the line reads "Invoice with <name>".
7. **Later, in batch:** Expenses missing "what for" collect under one attention item ("3 payments need a description"); the daily nudge links there. They can be described in one pass, and "what for" is needed only before a Bill goes on a Claim.

**When extraction fails:** the Expense is still created with the screenshot attached and amount blank, flagged "Couldn't read this payment" — never dropped. K fills the amount once.

**No confirmation to share** (cash, or an app that shows nothing useful): quick-add form in T — amount + what for, two fields. Back-fill (W6) is withdrawn for now.

**Checks before build:** which paperless uploader app supports Android Direct Share (and iOS share sheet, for iPhone Claimants) and logs in as the Claimant's own paperless user; extraction accuracy on a sample of real confirmations from several apps (CRED, GPay, PhonePe, Paytm, a bank app; ~10 each).

### W2. Online order: delivery, partial delivery, cancellation
1. An `online` Expense is the Order. It starts with **one expected Bill for the full Payment** and reason `awaiting goods`.
2. As each delivery's Invoice arrives (W4 or W5), it is split off the expected Bill as its own fulfilled Bill; the expected remainder shrinks. Each Invoice can be claimed on its own, so an Order can be partly reimbursed. An invoice smaller than the open amount splits the Order the same way when it matches (W4.3).
3. Cancelling part of an Order reduces the expected remainder by that amount and creates an expected Refund for it; cancelling everything left turns the remainder into a Refund.
4. K marks a Refund received when the money is back.
5. Returned after delivery (Bill not yet on a submitted Claim): Bill → `cancelled` permanently (it can never become ready again, even after a recall) and an expected Refund.
6. Returned after the Bill was on a submitted Claim: T creates an **Owed to university** record (§2) and an attention item; K marks it repaid. Has never happened.
7. Replacement with no money change: nothing changes except the Bill stays expected longer.
8. The Order completes (Expense `settled`) when its Bills + Refunds add up to the Payment and every Bill is reimbursed or cancelled.
9. **The Order page.** At the top, the Payment: amount, date, method, proof, order number. Then each Bill (amount, seller, status) with **Move to another payment**, **Detach** (becomes its own invoice-only Expense) and **Edit** (opens review R). Then **Still expected ₹x** with **Item cancelled** (expects a Refund of that amount; **Refund received** when it lands) and **No more invoices**. A small leftover (for example ₹1 from rounding or a coupon) gets "₹1 left. Close the order?" and is never closed silently. The leftover threshold, and what "No more invoices" and "Close the order?" do to the remaining amount, are open (§11).

### W3. Shop or service payment
1. W1, with kind `shop` or `service` → one Bill created already fulfilled, reason `bill missing`.
2. K scans the paper bill (W4) or, if none exists, marks the payment confirmation as the Bill (`payment_proof`). Bill → `ready`.
3. In paperless a Payment proof loses `inbox` and gets its Expense ID but no `reimb:*` tag, unless it was marked as the Bill.

### W4. A document arrives (phone share, upload, email, Mac drop)
Any document is logged with zero further steps; matching prevents the same purchase becoming two Expenses, whatever order the payment confirmation and the invoice arrive in.
1. P: stores it under the uploader's paperless user, tag `inbox`; webhook to T.
2. T classifies it: **payment confirmation** (→ W1) or **bill** (Invoice / Informal bill), from OCR text.
3. For a bill, T extracts vendor, bill no, bill date, total, and looks for the Claimant's Expense it belongs to. **Amount leads and the vendor is a soft signal**, because a UPI payee name is often a gateway or a person: candidates are Expenses with the same amount and a date within ±10 days (or an exact Expense ID / order no. when known), and online Expenses whose open amount is larger than the invoice (below).
   - **Auto-attach only when** the amount is exact, the date is within the window, AND (the vendor or order number matches, OR there is exactly one candidate). It becomes a fulfilled Bill (splitting an Order's expected Bill when it is an online Expense).
   - **Smaller than the open amount** (an online Order that arrives in parts): the invoice still auto-attaches and splits the Order's expected Bill when the date is within the window AND the order number or the shop matches. The shop includes the platform and learned aliases. Otherwise it attaches to the best candidate with "Check".
   - **Marketplace invoices** (for example Amazon): the platform is the shop for matching; the "Sold by" seller is detail, so a different seller name never breaks a match. The order number read from the first invoice is saved on the Expense, and later invoices match on it exactly.
   - **After an auto-attach** Dues says once: "₹2,100 invoice added to <shop> · <what for>. ₹2,770 still expected." with Undo and Move.
   - **Anything else** attaches to the best candidate with a visible "Check: could also be E-xxxx" in attention and a one-tap move. The Bill can't go on a Claim until the Claimant confirms or moves it.
   - **Learning:** every match the Claimant confirms or moves teaches Dues a payee-to-vendor alias (e.g. a gateway name = a shop), used in later matches.
   - **Payback:** a payment to a person marked "Paying someone back" expects a Bill of that amount from any vendor. The vendor check is skipped; it matches on amount and date (W9).
   - **No match** → a new Expense is **logged immediately** from the invoice: amount = bill total, vendor, paid_on = bill date, Payment method "not recorded". If the vendor can't be read it shows "Unknown", and review asks for the vendor once. The Bill is fulfilled and claimable at once — a payment record is never required to claim.
4. **Invoice before payment:** a payment confirmation arriving later for that Expense (same amount ±₹1, date ±10 days, payee ≈ vendor or a learned alias) attaches to it as Payment proof and fills paid_on, Payment method and reference — instead of creating a new Expense.
   - **One payment for several invoices:** if the payment equals the sum of 2–3 invoice-only Expenses from the same vendor within ±10 days, T suggests merging them into **one Expense** (one tap, never automatic). Each invoice stays its own Bill, so each is still its own Claim line.
5. T writes back to paperless: removes `inbox`, sets document type, correspondent (vendor), custom fields (§5), tag `reimb:ready`.
- **State moves** are "add one `reimb:*`, remove the other two" in a single API call (`bulk_edit` `modify_tags`, or a PATCH with the full tag set).
- Earlier "draft from document" behaviour is replaced by this; `draft` remains only for Amazon picks and Back-fill.

### W5. Pick my orders from the shared Amazon account (laptop; withdrawn from the current change with the token API, returns later as its own decision)
1. K presses "Read Amazon" in T → hand-off to C.
2. C (Claude in Chrome, logged-in session, read-only) reads orders since the last run: date, order no., items + images, total, ship-to, payment method, placed-by, delivery status per shipment, invoice availability. Posts them to T as candidates.
3. K ticks the orders he paid for (or paid back the orderer for). Each tick → Expense (`online`, orderer from Amazon "placed by") with one expected Bill per shipment; already-delivered shipments are marked fulfilled.
4. For fulfilled shipments, C downloads the invoice PDF and uploads it to P with the Expense ID → W4 auto-attaches (exact Expense ID, no suggestion needed).
5. Candidates matching a Ledger line or an existing Expense (order no.) are shown as already tracked.

### W6. Back-fill (withdrawn from the current change; returns later as its own decision)

(Kept below as the record of the earlier design.)
1. The maintainer asks Claude to back-fill a period. Claude gets the statement (downloads it from the bank's site in Chrome after the maintainer logs in, or reads a file the maintainer provides), parses it, and drops lines already tracked (same amount ±3 days, or UPI ref).
2. Claude asks the maintainer which remaining lines are lab Expenses, then creates them through the app API as `draft` Expenses (source `back-fill`, amount, date, payee, Payment method, UPI ref), attaching any matching documents.
3. The maintainer confirms the drafts in the app like any other draft (W1 step 4).
- The app has no statement upload, parser or reconciliation screen; it only needs the API to create drafts and to list existing Expenses for de-duplication.

### W7. File a Claim (app feature, ADR 0003)
1. **K reviews at filing time, in one sitting:** all ready-to-file Bills first (any Bill still in review is confirmed here), then the filled form and the mail breakdown. T creates a `draft` Claim, runs the duplicate check (§7) across all Claimants, and lists Bills whose Expense lacks "what for" with an inline field.
2. **What goes on which Claim:** each Fund files as its own Claim, with its own total and its own "File" in Ready to file. Purposes are breakdown groups inside that Fund's Claim; Expenses with no Purpose sit together.
3. T fills the Fund's form template from the Claimant profile and Claim lines (grouped by Purpose; lines with no Purpose together; total rounded **up**; amount in words), renders the PDF, and assembles the submission package: form PDF + Bill files + the mail built from the Fund's mail template (To, CC, subject, body with its variables). **Nothing goes into the subject or body unless the Fund's template puts it there.** The Claimant sees the mail draft and can edit it before it is made. T keeps a snapshot of the template version used on the Claim (§2 Fund).
   - **Original files.** The mail and the package carry the original files, untouched: the PDF or image as shared, never a copy with reading boxes.
   - **Attachment size.** Mail attachments are base64-encoded, which adds about a third, and Gmail's 25 MB limit applies to the encoded mail, so the target is about 18 MB of raw files. If over, T shrinks the largest images first, then scanned PDFs, until it fits; text PDFs are left alone. The filing review lists every file shrunk ("3 photos made smaller to fit 25 MB"). The originals in paperless never change. If it is still too big, T offers to split the Claim into two mails. Open: confirm the limit with one real ~22 MB test draft (§11).
   - **File names.** Each Bill's file is named from the Fund's pattern. Variables: `{purpose}`, `{what}` (the Bill's description, which defaults to the Expense's "what for"), `{vendor}`, `{person}`, `{n}`, `{kind}` ("Invoice", "Bill", or "Payment" for a payment proof used as the Bill). An empty part is dropped with its separator. `{n}` is added only when two names in one Claim would clash, in one numbering style. Makerspace default `{purpose} - {what} {kind}`, e.g. "Solder Invoice", "Club - Acrylic Beads Invoice". Every file name is shown at filing review and can be edited for that one file; an edited name is kept.
4. T stores the form PDF as a `Claim form` document (a draft writes nothing else to paperless).
5. **Mail, never sent by Dues (principle 8).** Primary path: a Gmail draft (Gmail compose scope) with the form PDF and Bill files attached and the body from the Fund's template. Fallback: download a zip of all files plus a "copy body" button. If Gmail is blocked: an `.eml` file. A later path: the Claimant's own Claude Code (MCP) using its Gmail connector to prepare the draft; this needs its own decision (§9). Registering Dues with Google for Gmail drafts is parked (§11).
6. After the draft or download, T asks "Sent it?". Yes marks the Claim `submitted`. Only now T sets tag `reimb:claimed` and the Claim field on the Bills' documents and on the Claim form document, so Claims shows the whole package.

### W8. Reimbursement arrives
1. Claimant marks the Claim reimbursed when the money arrives (one credit per Claim, paid in full), entering the amount actually received (default: the Claim total); on a Fund with an Advance on it raises that Fund's Advance left (§2) → §3.3 completion: Bills `reimbursed`, Claim lines appended to the Ledger, documents re-tagged.

### W9. Payback to a colleague
1. Colleague paid the vendor; Claimant pays the colleague back (W1).
2. Expense records `payback = true` (the Claimant answered "Paying someone back" for that payee, W1), payee = colleague, vendor = the shop/site once a Bill arrives (kept separately), orderer = colleague. Dues expects a Bill of that amount from any vendor; the vendor check is skipped and it matches on amount and date (W4).
3. If the colleague is also a Claimant and logged that vendor payment as their own Expense, T offers to link it: their Expense closes as "paid back by <Claimant>" and its Bills move to the Payback Expense. Otherwise Bills come from the colleague (forwarded invoice) → W4.
4. A Bill in a colleague's name files as is; no note is needed. The form shows only the invoice (date, bill no, description, amount). Payback, payee, Orderer and Payment method never appear on the form; they live in the app only.
5. **Undo:** the link can be undone (colleague's Expense reopens, Bills move back) until any of those Bills is on a submitted Claim; then it is locked.
6. **Never linked:** if both Claimants hold the same Bill (§7 match) and no link exists, **both** are blocked from claiming it and both get "Link as payback?"; never first-claimer-wins.

### W10. Home
Home is three lists: **Waiting for invoice** (Expenses with no Bill document yet; "Invoice with <name>" when the Orderer is someone else), **Ready to file** (Bills ready for a Claim; one "File" per Claim that would be built, W7), and **Filed awaiting money** (submitted Claims not yet reimbursed). For each Fund with an Advance on, Home also shows that Fund's Advance left as a primary block (hidden when off): red below zero, amber at 15% or less of the total, green above that. Below zero it carries "₹x of your own money in". Placement and visuals are the designer's, not the spec's.

## 5. paperless-ngx setup (to be created by Claude; currently fresh install)

**Multi-Claimant:** each Claimant has a paperless user (same Zitadel identity via paperless OIDC login, to confirm with infra). Documents are owned by the uploading Claimant; the tracker's service account can read all and only shows a Claimant their own. The owner on a phone upload is how T knows whose draft Expense to create.

**Status lives in Dues.** Paperless has no status lists (no Ready, Claimed or Reimbursed views); status shows there only as a tag chip. Claimants get no paperless views: Dues is their only screen, and their paperless login exists only so uploads carry their owner.

**Saved views (admin only):**
| View | Filter | Shown |
|---|---|---|
| Inbox | tag `inbox`, oldest first | dashboard; empty means nothing to do |
| Not in Dues | no `inbox` tag, and neither Expense ID nor Claim field set | dashboard; empty means every document is linked |
| Claims | Claim field set, sorted by Claim | sidebar only |

Rule: a dashboard list is one that should be empty, and filters read link fields, never hand-kept ID lists.

**Document types:** Invoice · Informal bill · Payment proof · Claim form.

**Tags:** `inbox` (paperless's own inbox flag, on every consumed document, removed when linked) · `reimb:ready` · `reimb:claimed` · `reimb:reimbursed` · `personal` (written only by Dues, §3.1).

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

**Workflow:**
*Notify tracker* — Document Added → Webhook `POST <tracker>/hooks/paperless` with document ID.

**Intake channels:** Android uploader app (share menu) for payment screenshots and photos; web upload; optional mail rule per Claimant for forwarded invoices.

**Own uploads:** paperless adds `inbox` to every consumed document, including the tracker's own uploads (Claim forms, Amazon invoices, the historic import). The tracker removes `inbox` from them, or Inbox never empties.

**API use by the tracker:** service-account token; `GET /api/documents/<id>/` (+ OCR content) on webhook; `custom_field_query` to find by Expense/Bill ID; `bulk_edit` to set tags/fields on confirm; `post_document` (+ `/api/tasks/`) for uploads (claim forms, Amazon invoices).

## 6. File storage (ADR 0004)

- Documents live in a dedicated TrueNAS dataset (e.g. `<pool>/reimbursements`) exported over NFS only to the Proxmox host (`<PVE_HOST>`), mapped to one service UID, bind-mounted into the paperless LXC and the tracker LXC. Not on the general SMB share, not in user home folders, never mounted on client machines.
- **Blocked** until the NAS has snapshots, an off-site backup and healthy disks. **Launch on paperless's local disk** with the nightly backup, only until TrueNAS is connected; preparing the NAS is a separate task, and the move needs the maintainer's OK.
- Other Claimants never see or need a folder; the app offers "download Claim" for local copies.
- Historic `Filed/` content is imported once: files into paperless (owner: the maintainer, tagged with their Claim, `inbox` removed), rows already in the Ledger.

### 6.1 The maintainer's Mac folder (ADR 0002, maintainer only)

(Withdrawn from the current change with the token API; returns later as its own decision.) The maintainer keeps a local `Reimbursement` folder in sync with their data in the app. Claude runs the sync on demand ("sync") and before building a Claim.
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
| Refund owed | Refund `expected` > 10 days |
| Mismatch | Nothing expected (no expected Bill or Refund) but Bills + Refunds ≠ Payment; fires at once. Fix: add a Bill, record a Refund, or correct the amount |
| Invoice waiting | Expense in Waiting for invoice > 14 days from paid-on: the only invoice reminder, raised once; "Ask <name> for the <vendor> invoice" when the Orderer is someone else |
| Needs description | Expense without "what for" (one grouped item; daily nudge) |
| Couldn't read | Payment proof whose amount couldn't be extracted |
| Owed to university | Owed to university record `open` |
| Check match | Bill attached with another candidate Expense, not yet confirmed |
| Link as payback? | Same Bill held by two Claimants, no Payback link |
| Claim unpaid | Claim `submitted` > 45 days |
| Possible duplicate | §7 warn |

## 9. Claude Code reading (every Claimant; the app works without it)

A Claimant's own Claude Code can read their unconfirmed Bills and propose values. MCP is the only door, and it only reads: no token API, for the maintainer either. Behaviour is decided in `docs/research/notes/Claude Code checks UX/decisions.md`; capability spec `document-intake`.

| Job | How |
|---|---|
| Connect | Settings shows one line; pasting it installs the Dues plugin (remote MCP server and a skill) and starts the first run; Dues' own consent page asks Allow / Don't allow |
| Read my bills | The Claimant says "read my bills"; Claude Code reads each unconfirmed Bill and adds a Reading; the Claimant confirms in Dues |
| Result | One line and one link in the terminal; Dues shows no "in progress" or failure state |
| Disconnect | One per Claimant in Settings, on every computer at once: tokens issued before the cut-off time are refused; Readings already made stay |

It cannot confirm a Bill, build or send a Claim, or change anything but add a Reading. Withdrawn for now, to return as their own decision: Back-fill (W6), Amazon picks (W5), the maintainer's folder sync (§6.1), marking a Reimbursement by Claude. Drafting the mail through the Claimant's Claude Code and its Gmail connector is a later path (W7); Dues itself never sends mail.

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

Remaining items are facts to check, not decisions (items 7 to 11 are open design and future decisions):
1. NAS readiness (snapshots, off-site backup, healthy disks): separate infrastructure task; launch does not wait for it.
2. ~~paperless OIDC~~ **Checked 2026-11-20** (installed source on the paperless host + [fact checks](../research/notes/Tracker%20fact%20checks/fact_checks.md)): allauth 65.16.1 `openid_connect` is installed; config via `PAPERLESS_APPS` + `PAPERLESS_SOCIALACCOUNT_PROVIDERS`, callback `https://<host>/accounts/oidc/<provider_id>/login/callback/`; `PAPERLESS_SOCIAL_AUTO_SIGNUP=true` and `PAPERLESS_SOCIAL_ACCOUNT_DEFAULT_GROUPS` = a group with *Add document* (else uploads get 403); OIDC-only users can generate a profile API token; uploads are owned by the token's user (`owner_id=request.user.id`, client can't override). Uploaders: Android = gmag11 "Paperless NGX Uploader" (share target, pasted API token, no OIDC); iOS = Swift Paperless (share extension, OIDC via a **public PKCE** client, likely a second Zitadel app). Still to test live: Zitadel roles claim (JSON object) → paperless group sync.
3. Server-side form rendering must match the current docx exactly — test LibreOffice conversion against a Word-exported PDF.
4. Which payment apps' success screens can share an image directly vs need a screenshot. Official pages confirm a Share button only for Google Pay and Paytm, and say nothing about image vs text for any app: **device test needed** (CRED, GPay, PhonePe, Paytm, BHIM, a bank app). W1 already falls back to screenshot → share.
5. Gmail compose scope: whether the university Workspace allows it (being checked). Without it, W7 falls back to the zip or `.eml`. Registering Dues with Google for Gmail drafts is parked (owner: later).
6. Attachment size: shrinking and splitting are decided (W7); the limit is to be confirmed with one real ~22 MB test draft.
7. Home screen and the filing flow (W7, W10) are for the designer to shape.
8. Per-Purpose Approvers may come later.
9. Leftover threshold for "₹1 left. Close the order?" (W2.9), and what "No more invoices" and "Close the order?" do to the remaining amount.
10. Which Fund a new Purpose starts on.
11. Whether the Claimant's Approvers list stays in the profile beside each Fund's To and CC.
3a. Form PDF (item 3) will be tested with Gotenberg on the tracker's own LXC once it exists.

Decided 22 Nov 2026 (owner): payment first, matching by amount, Purposes and the Advance, home lists, mail by draft only. Round 2, same day: partial invoices and the Order page, one invoice reminder, Funds (mail and form templates, sharing, personal Advance), original attachments with sizing, file naming. See [`docs/research/notes/Core flow/decisions.md`](../research/notes/Core%20flow/decisions.md).

Resolved 2026-11-20, round 2: access by `claimant` role via Syndra only · form carries invoice data only (no payback/payee info) · Owed to university: repaid only, never on a form · launch on local disk until TrueNAS is connected.

Resolved 2026-11-20 (logic-prototype grilling, round 1): Check blocks claiming · one payment for several invoices = one Expense, one Claim line per invoice · "different" remembered per pair · Unaccounted replaced by Mismatch · Owed to university is a record · Payback link undoable until submitted · unlinked shared Bill blocks both · missing "what for" blocks, fill inline · corrections after document flagged · rounding stored on Claim only · Claim keeps name after recall · unreadable twins offered as same payment.
