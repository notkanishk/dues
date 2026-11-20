# Makerspace Reimbursement Tracker — Design Spec (v1 mockup)

Audience: the engineer building a clickable static HTML mockup. No backend; all data hardcoded, state in memory. "Today" in the mockup is **Fri 20 Nov 2026**.

---

## 1. Core concept

1. **One record type: an Item** = one payment the maintainer made for the lab. Everything (Amazon order, statement line, scanned bill, quick-add) becomes or attaches to an Item.
2. **Every open Item has exactly one "next thing"**: wait for delivery → get the invoice → claim it → get paid. The home screen is just open Items grouped by that next thing, with overdue ones pulled to the top.
3. **The app remembers; Claude does.** The app holds records, statuses and links to documents in paperless-ngx. Anything that is work (reading Amazon, parsing statements, fetching invoices, filling the form, PDF, email draft) is a hand-off to Claude via a button that produces a copyable instruction.
4. **The ledger of filed rows is always in the room**: every new Item, Amazon candidate and claim selection is checked against it automatically.

### Item model (what the mockup data needs)

| Field | Notes |
|---|---|
| `what` | Short description, becomes the form's Description |
| `amount` | ₹, 2 decimals |
| `paidOn` | Date |
| `vendor` | Free text with recents |
| `kind` | `online` (order placed on a site) · `shop` (paid in person / QR, goods in hand or to be delivered) · `service` (cab, printing, AWS — no delivery) |
| `orderRef` | Optional; only for `online` |
| `paidVia` | `Savings` · `Card` · `Other` |
| `stage` | See below |
| `stageSince` | Date the current stage began (drives "N d" ageing) |
| `billNo` | Optional; "-" if none |
| `purpose` | Optional free text tag ("O-week", "Air purifier") — Claude uses it to group the email breakdown |
| `docs[]` | Links to paperless documents, each typed `invoice` or `payment proof` |
| `remarks` | e.g. "Informal/raw bill attached", "UPI payment proof" |
| `batch` | Set once claimed |
| `flags[]` | Computed: overdue, duplicate, etc. (section 5) |

### Stages (the only status field)

| Stage | Meaning | Badge colour | Leaves when |
|---|---|---|---|
| **Awaiting delivery** | Paid, goods not here | grey | Delivered / Cancelled |
| **Refund pending** | Cancelled, money not back | amber | Refunded → Closed |
| **Needs invoice** | Have goods (or it's a service), no bill attached | amber | Invoice or payment proof attached |
| **Ready** | Has a document, not in any batch | green | Added to a batch |
| **Claimed** | In a submitted batch | blue | Batch marked reimbursed |
| **Reimbursed** | Money received | muted green | terminal |
| **Closed** | Refunded, personal, or discarded duplicate | muted grey | terminal |

`service` Items and shop purchases taken home on the spot start at **Needs invoice** (skip delivery). Items created from a scanned invoice start at **Ready**.

---

## 2. Information architecture

Three destinations, one detail panel, one add sheet. Same responsive page for phone and laptop (breakpoint 720px).

| # | Screen | Phone | Laptop | Why it exists |
|---|---|---|---|---|
| 1 | **Open** (home) | Yes — primary | Yes — primary, with multi-select | The to-do list. Replaces any separate dashboard / "needs attention" / "ready to claim" pages |
| 2 | **Add** (bottom sheet / modal) | Yes — primary use | Yes | Quick capture |
| 3 | **Item detail** (full screen on phone, right side panel on laptop) | Yes | Yes | Edit, change stage, attach docs, see duplicate match |
| 4 | **Import** — two sub-tabs: **Amazon** and **Statement** | Read-only (shown but with "Best on laptop" note) | Yes — primary | Bulk entry from the two sources that reveal forgotten payments |
| 5 | **Batches** (includes filed-ledger search) | Yes (view + mark reimbursed) | Yes | Claim hand-off result, mark reimbursed, duplicate lookup |

Deliberately **not** screens: Dashboard (Open is it), Ready-to-claim (a group on Open + a selection tray), Duplicates (inline badges + the Batches search), Documents (paperless is the document UI; the app only links), Settings (none in v1), Login (private network).

Navigation: phone = bottom bar `Open · Import · Batches` with a centred **+** button. Laptop = left-aligned top bar with the same three links, a global search box, and an **Add** button at right.

Global search (top bar on laptop, search icon on phone): one box that searches open Items **and** the filed ledger by description, vendor, bill no, order ref or amount. Results are in two groups: "Open items" and "Already filed".

---

## 3. Screens

### 3.1 Open (home)

**Purpose:** show what he's owed and what needs doing, in the order he should do it.

**Layout, top to bottom**

1. **Summary line** (one line, no cards): `Out of pocket ₹45,419.87 · 13 open` and, muted, `Claimed, awaiting ₹73,932.00`. Tapping the second part goes to Batches.
2. **Needs attention** section (hidden when empty). Each entry is a row with a coloured reason badge and one inline action. Contains flagged Items plus non-Item alerts (unmatched statement lines, overdue batch). Flagged Items appear here **only**, not again in their stage group below.
3. **Stage groups**, in this fixed order, each with header `Name · count · ₹subtotal`, collapsible, default expanded:
   - Awaiting delivery
   - Refund pending
   - Needs invoice
   - Ready to claim
4. Footer link: `Show closed & reimbursed` (expands a muted list; filter only, not a screen).

**Row — phone** (two lines, 64px min height)

- Line 1: `what` (truncate) · right-aligned amount (tabular figures)
- Line 2: vendor · paid date (`18 Nov`) · paid-via chip (`Savings` / `Card`) · reason badge if any
- Right edge: the one inline action for its stage (below)

**Row — laptop** (table, 40px rows). Columns: checkbox (Ready rows only) · Paid on · What · Vendor · Order / Bill no · Paid via · Amount (right-aligned) · Docs (paperclip + count, or "—") · Status badge · Action.

**Inline action per stage** (one tap, no confirm; shows a 5-second "Undo" toast)

| Stage | Buttons |
|---|---|
| Awaiting delivery | `Delivered` · overflow `⋯` → `Cancelled` |
| Refund pending | `Refunded` |
| Needs invoice | `Attach` (phone: opens camera/file picker; laptop: file picker) |
| Ready | Checkbox (laptop) / nothing (phone) |

**Primary action:** `+` / Add. **Secondary:** tap row → Item detail; search.

**Claim tray (laptop only):** sticky bar at the bottom, appears when ≥1 Ready row is checked: `5 selected · ₹19,988.87 · Batch name [November2] · [Hand to Claude]`. The Ready group header has a `Select all clean` link that checks every Ready row without a duplicate flag. Rows flagged "Already filed" have a disabled checkbox with tooltip "Resolve duplicate first".

**Empty state:** "Nothing open. Everything you've paid for is claimed or closed." with the Add button.

**Badges (exact wording)**

| Badge | Colour | When |
|---|---|---|
| `Not delivered · 11 d` | red | section 5, rule 1 |
| `No invoice · 9 d` | red | rule 2 |
| `Refund pending · 13 d` | red | rule 3 |
| `Already filed in January1` | red | hard duplicate |
| `Possible duplicate` | amber | soft duplicate |
| `Handwritten bill` | neutral | remark set |
| `Payment not matched` | neutral | Item has no statement line linked after that month's statement is reconciled |
| `Invoice on site` | neutral | `online` Item delivered, no invoice — hint that Claude can fetch it |

### 3.2 Add (quick-add sheet)

**Purpose:** capture a payment in under 15 seconds, standing at a shop counter.

**Layout** (bottom sheet on phone, 420px modal on laptop). Only the first two fields are required.

1. **Amount** — large numeric field, autofocused, numeric keypad, `₹` prefix.
2. **What** — single text field, placeholder "Plywood, cab to market…".
3. **Kind** — three segmented chips: `Online order` · `Shop` · `Service / no delivery`. Default `Shop`.
   - `Online order` reveals: Vendor chips (`Amazon` `Robu.in` `Blinkit` `Other…`) and optional `Order no.`; stage will be **Awaiting delivery**.
   - `Shop` reveals: optional Vendor text with recents, and a toggle `Got it with me` (default on → **Needs invoice**; off → **Awaiting delivery**).
   - `Service` reveals: optional Vendor; stage **Needs invoice**.
4. **Paid from** — two chips `Savings` · `Card`; pre-selected to the last one used.
5. **Attach** (optional) — `Photo` / `File` buttons; attaching something typed as invoice sets stage to **Ready**. A small switch under the thumbnail: `This is: Invoice | Payment proof` (default Payment proof for screenshots).
6. Collapsed `More` — Paid on (default today), Bill no, Purpose, Remarks.
7. **Save** button (full width). After save: sheet closes, toast "Saved · Awaiting delivery" with Undo, the new row briefly highlights in Open.

**Duplicate check on save:** if a hard or soft match exists, the Save button becomes a two-line warning above it: "Looks like *Spray Paint ₹250.00, filed in January1*" with `Save anyway` / `Discard`.

**Entry points:** `+` button; laptop Add; (real app, not mockup) Android share-target so a payment screenshot shared to the app opens this sheet with the image attached — show this as a hint line at the bottom of the sheet: "Tip: share a payment screenshot to Tracker to start here."

**Empty/validation:** Save disabled until Amount > 0 and What non-empty.

### 3.3 Item detail

**Purpose:** everything about one payment; the only place for edits.

**Layout**

1. Header: `what` (editable inline), amount, stage badge, any flag badges.
2. **Timeline** — horizontal stepper on laptop, vertical on phone. Steps depend on kind:
   - online/shop-not-in-hand: `Paid → Delivered → Invoice → Claimed → Reimbursed`
   - service / in-hand: `Paid → Invoice → Claimed → Reimbursed`
   - cancelled: `Paid → Cancelled → Refunded`
   Completed steps show their date; the current step shows its primary button (`Mark delivered`, `Attach invoice`, `Mark refunded`).
3. **Duplicate panel** (only when flagged): side-by-side "This item" vs "Filed row" — date, bill no, description, amount, batch, status — with buttons `Not a duplicate` (clears flag permanently for this pair) and `Discard this item` (→ Closed, reason "duplicate").
4. **Details** (editable list): Vendor, Kind, Order no, Paid on, Paid via, Bill no, Purpose, Remarks.
5. **Documents**: list of linked paperless docs — thumbnail, title, type chip (Invoice / Payment proof), `Open in paperless` link. Buttons: `Attach file`, `Take photo` (phone), `Ask Claude to fetch invoice` (only for `online` Items; opens the hand-off modal with text such as "Download the invoice for Robu.in order #RB-482917 and attach it to Tracker item 1").
6. **Statement match**: "Matched to Savings · 11 Nov · UPI/NEW ERA PLY · ₹6,450.00" or "Not matched yet".
7. Footer actions: `Cancelled / refund expected` · `Mark as personal (close)` · `Delete`.

**States:** Claimed/Reimbursed Items are read-only except Remarks, and show `In batch November1` as a link.

### 3.4 Import → Amazon

**Purpose:** from the shared lab Amazon account, tick only the orders he paid for.

**How data arrives:** a `Refresh from Amazon` button opens the hand-off modal ("Read the last 60 days of orders from the lab Amazon account in Chrome and send them to Tracker"). In the mockup the list is pre-filled and the header says `Fetched by Claude · 20 Nov, 10:14`.

**Layout**

1. Header: fetched timestamp · `Refresh from Amazon` · filter chips `Likely mine (UPI)` (default on) · `All orders`.
2. **Card grid** (laptop 3 across, phone 1). Each card shows exactly:
   - item thumbnail (64px)
   - item name (2 lines max)
   - `Qty 2`
   - order date
   - **grand total**
   - ship-to
   - payment method
   - a large checkbox / whole card is tappable
3. Sticky footer: `2 selected · ₹2,545.20 · [Add as items]`.

**Card states**

| State | Look | Behaviour |
|---|---|---|
| Candidate (UPI) | normal, unchecked | tickable |
| Card payment | dimmed, grouped under a divider "Paid by card — probably not yours (2)" , hidden unless `All orders` | tickable (he might be wrong) |
| `Already tracked` | green outline, check locked | links to the existing Item |
| `Already filed in September1` | red badge, checkbox disabled | `View filed row` link |

**Primary action:** `Add as items` → creates Items (kind online, vendor Amazon, order ref filled, stage Awaiting delivery, or Needs invoice if Amazon shows delivered), toast "2 items added", cards flip to `Already tracked`.

**Empty state:** "No Amazon orders loaded. Ask Claude to read the lab account." + the Refresh button.

### 3.5 Import → Statement

**Purpose:** once a month, make sure every lab debit has an Item and every Item has a debit; catch forgotten payments and confirm refunds.

**How data arrives:** drop zone "Drop the bank .xls or card .pdf (or upload from phone)". File is stored in paperless; parsing is a Claude hand-off in v1 ("Parse this statement into Tracker lines"). Mockup: pre-loaded, header `Savings + Card · Nov 2026 · 8 lines`.

**Layout**

1. Header: month picker (`Nov 2026`), account chips `All · Savings · Card`, progress `5 of 8 sorted`.
2. **Table** (laptop) / stacked rows (phone). Columns: Date · Account · Narration (raw bank text, monospace, truncated) · Debit · Credit · **Result**.
3. The **Result** cell is the whole interaction, one of:
   - `Matched → MDF sheets ×4` (green, auto; link to Item; `×` to unmatch)
   - `Suggested → Filament PLA refund` with `Confirm` button (amber)
   - Unsorted (red dot): three buttons `Personal` · `Lab — new item` · `Match…`
     - `Personal` → row greys out, done.
     - `Lab — new item` → opens Add sheet prefilled with amount, date, paid-from, vendor guess from narration.
     - `Match…` → small popover listing open Items with the same amount ±₹1 first, then all.
4. Below the table, **"Items with no debit this month"**: open Items paid in this month from these accounts that matched nothing (catch for typos or wrong account).

**Auto-match rule:** same account, amount equal to the paise, date within ±2 days of `paidOn`. Exactly one candidate → Matched. More than one → Suggested. Credits are matched to Refund-pending Items by amount and vendor text.

**Primary action:** sort every line (no separate "finish" button; progress reaches `8 of 8 sorted ✓`). **Empty state:** the drop zone plus "Last reconciled: Oct 2026".

### 3.6 Batches

**Purpose:** see claims in flight, mark them paid, and look up anything already filed.

**Layout**

1. **Search filed ledger** box (same engine as global search, scoped to filed rows): type amount, bill no or words. Results table: Date · Bill no · Description · Amount · Batch · Status.
2. **Batch list**, newest first. Row: name · status badge · submitted date · item count · total · age (`8 d`) · action.

| Batch status | Badge | Action |
|---|---|---|
| Draft (handed to Claude, not yet emailed) | grey | `Mark submitted` · `Copy hand-off again` · `Discard draft` (Items return to Ready) |
| Submitted | blue | `Mark reimbursed` |
| Reimbursed | muted green | — |

3. Tap a batch → expands inline to its rows in form order: S.No · Date (dd/mm/yy) · Bill No · Description · Amount · Receipt · Remarks, with total and the rounded-up form total.

**Empty state:** "No batches yet. Select Ready items on the Open screen to start one."

### 3.7 Hand-off modal (shared component)

Every "Ask Claude…" / "Hand to Claude" button opens the same modal: title, a read-only text block with the instruction, a `Copy` button, and one line: "Paste this to Claude on your Mac." No integration is simulated beyond that. For the claim hand-off the block contains: batch name, the row table (form columns), total, rounded-up total, and the list of attached document titles in row order.

---

## 4. Key flows (tap counts exclude typing)

### (a) Quick-add on phone after paying — target under 15 s
1. Tap home-screen icon → app opens on Open. Tap **+**. (1 tap)
2. Type amount (keypad already up).
3. Tap **What**, type 1–3 words. (1 tap)
4. Kind and Paid-from are already right in the common case (Shop, last-used account). If not, 1 tap each.
5. Tap **Save**. (1 tap)

**3 taps + typing** typical; 5 worst case. Online order with order number: +1 tap and a paste.

### (b) Mark delivered / cancelled
- Delivered: on Open, tap `Delivered` on the row. **1 tap.** Item moves to Needs invoice; Undo toast.
- Cancelled: tap `⋯` → `Cancelled`. **2 taps.** Item moves to Refund pending.
- Refund arrived: tap `Refunded`. **1 tap.** Item → Closed. (Or confirmed automatically in statement reconcile.)

### (c) Attach invoice
- Phone, paper bill: tap `Attach` on the row → camera opens → shoot → `Use photo`. **3 taps.** Uploads to paperless, links, Item → Ready.
- Laptop, PDF: drag the file onto the row (or `Attach` → pick). **1 drag.**
- Online order: Item detail → `Ask Claude to fetch invoice` → `Copy`. **3 taps**; Claude attaches it later and the Item turns Ready on its own.
- No bill exists (cab, QR to a person): attach the payment screenshot as `Payment proof`; that also satisfies Ready and sets remark "UPI payment proof".

### (d) Pick his orders from shared Amazon (laptop)
1. Import → Amazon. (1 click) List is already filtered to UPI orders.
2. Click each card that's his. (1 click per order)
3. Click `Add as items`. (1 click)

Card-paid and already-filed orders need no action. **N + 2 clicks.**

### (e) Reconcile a statement month (laptop)
1. Import → Statement, drop the file (hand-off to Claude parses it).
2. Auto-matched lines need nothing. For each Suggested line: `Confirm`. (1 click)
3. For each unsorted line: `Personal` (1 click), or `Lab — new item` → `Save` (2 clicks), or `Match…` → pick (2 clicks).
4. Glance at "Items with no debit this month"; open any to fix amount/account.

Done when progress shows all sorted. In the sample: 5 auto, 1 confirm, 2 unsorted = **about 4 clicks**.

### (f) Select ready items → hand to Claude
1. Open (laptop) → Ready to claim → `Select all clean` (or tick rows). (1 click)
2. Tray shows count and total; batch name is pre-filled with the next free name for the current month (`November2`); edit if wanted.
3. Click `Hand to Claude`. (1 click) Batch is created as **Draft**, Items leave Ready and show `In batch November2 (draft)`.
4. Modal → `Copy`. (1 click) Paste to Claude, which builds the form, PDF and email draft.
5. After he sends the email: Batches → `Mark submitted`. (2 clicks) Items → Claimed.

### (g) Mark batch reimbursed
1. Batches → `Mark reimbursed` on the row → confirm dialog "Mark 6 items in November1 as reimbursed?" → `Yes`. **3 taps.** All Items → Reimbursed; modal offers the hand-off "Move the November1 folder to Filed/2026".

### (h) Duplicate check
- **Automatic**, at four moments: saving an Item, loading Amazon candidates, attaching an invoice (bill no now known), and ticking Items for a claim.
- **Hard match** (`Already filed in <batch>`, red, blocks claim selection): same bill no (not blank or "-") **and** same amount; or same order ref.
- **Soft match** (`Possible duplicate`, amber, warns but allows): amount within ₹1 **and** date within ±3 days; or same vendor and same amount within 30 days. Checked against the filed ledger and other open Items.
- **Resolve:** tap badge → Item detail duplicate panel → `Not a duplicate` or `Discard this item`. **2 taps.**
- **Manual:** type an amount or bill no in global search; filed rows appear under "Already filed". **1 tap + typing.**

---

## 5. Needs-attention rules

An entry appears in **Needs attention** on Open while its rule is true, sorted red before amber, then oldest first. Thresholds are constants in one place.

| # | Rule | Threshold | Badge | Inline action |
|---|---|---|---|---|
| 1 | Awaiting delivery too long | > 7 days since paid | `Not delivered · N d` red | `Delivered` / `⋯ Cancelled` |
| 2 | Has goods or is a service, no document | > 3 days in Needs invoice | `No invoice · N d` red | `Attach` |
| 3 | Refund not received | > 10 days in Refund pending | `Refund pending · N d` red | `Refunded` |
| 4 | Hard duplicate | always | `Already filed in <batch>` red | `Review` |
| 5 | Soft duplicate | until dismissed | `Possible duplicate` amber | `Review` |
| 6 | Statement lines not yet sorted (unsorted or suggested) | any, for an uploaded statement | `3 statement lines to sort · Nov` amber | `Sort` → Import/Statement |
| 7 | Statement missing | after the 5th, last month not uploaded for an account | `Oct statement not uploaded · Card` amber | `Upload` |
| 8 | Batch unpaid | Submitted > 45 days | `Conference trip unpaid · 143 d` amber | `View` → Batches |
| 9 | Draft batch not submitted | Draft > 3 days | `November2 drafted, not submitted` amber | `View` |

Not attention (shown only in their group): anything younger than its threshold, and Ready Items (they are waiting on him by choice). The phone bottom-bar `Open` icon carries a count dot equal to the number of red entries.

---

## 6. Visual direction

Plain, dense, utilitarian — closer to a bank statement than a dashboard. No cards with shadows, no charts, no illustrations. Colour is used **only** for status.

**Type** — system UI stack. Amounts and narration use tabular figures (`font-variant-numeric: tabular-nums`), amounts right-aligned everywhere.

| Token | Size / weight |
|---|---|
| Summary amount | 20px / 600 |
| Section header | 13px / 600, uppercase, letter-spaced, muted |
| Row primary | 15px / 500 |
| Row secondary, badges | 12px / 400 |
| Quick-add amount field | 32px / 600 |

**Spacing** — 4px base. Row padding 8×12 (laptop), 12×16 (phone). Section gap 24. Touch targets ≥ 44px. Radius 6. Borders 1px hairline instead of shadows. Max content width 1100px.

**Palette**

| Role | Light | Dark |
|---|---|---|
| Background | `#FAFAF8` | `#141414` |
| Surface (rows, sheets) | `#FFFFFF` | `#1E1E1E` |
| Border | `#E4E4E0` | `#2E2E2E` |
| Text | `#1A1A1A` | `#EDEDED` |
| Muted text | `#6B6B6B` | `#9A9A9A` |
| Accent (buttons, links, selection) | `#1F4FD8` | `#7CA2FF` |
| Status grey — waiting | `#6B6B6B` on `#EEEEEC` | `#B0B0B0` on `#2A2A2A` |
| Status amber — needs me | `#8A5A00` on `#FFF1CC` | `#FFCF66` on `#3A2E0A` |
| Status red — overdue / duplicate | `#A8201A` on `#FDE3E1` | `#FF8A80` on `#3D1512` |
| Status green — ready / reimbursed | `#1B6B3A` on `#DDF3E4` | `#7DD99B` on `#12301C` |
| Status blue — claimed | `#1F4FD8` on `#E1E9FD` | `#7CA2FF` on `#14234A` |

Badges are text-on-tint pills; every badge has words, never colour alone. Light/dark follows `prefers-color-scheme`, with a manual toggle in the top bar for the mockup.

**Formats**

- Money: Indian grouping, always two decimals, `₹` prefix, no space: `₹1,896.20`, `₹1,23,456.00`. (`en-IN` locale formatting.)
- Dates: `18 Nov` in lists (add year only if not the current year: `29 Dec 2025`); `dd/mm/yy` only inside the batch form-row preview.
- Ages: `11 d`.

---

## 7. Sample data for the mockup

Compute all ages, subtotals and flags from the data and the fixed "today" (20 Nov 2026); the values quoted below are for checking.

### 7.1 Open items (13)

| # | Paid | What | Vendor | Kind | Order / Bill no | Via | Amount | Stage (since) | Docs | Expected flag |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 18 Nov | Solder wire 60/40 500 g ×2 | Robu.in | online | Order RB-482917 | Card | ₹1,180.00 | Awaiting delivery (18 Nov) | — | none (2 d) |
| 2 | 09 Nov | MDF sheets 12 mm ×4 | Amazon | online | Order 408-5512094-7731526 | Savings | ₹3,240.00 | Awaiting delivery (09 Nov) | — | `Not delivered · 11 d` |
| 3 | 05 Nov | PLA filament 1 kg ×3 | Robu.in | online | Order RB-481120 | Card | ₹2,697.00 | Refund pending (07 Nov) | — | `Refund pending · 13 d` |
| 4 | 11 Nov | Plywood 18 mm ×2 + flexible ply | New Era Plywood | shop | — | Savings | ₹6,450.00 | Needs invoice (11 Nov) | UPI screenshot (payment proof) | `No invoice · 9 d` |
| 5 | 14 Nov | Cab to hardware market (return) | City Cabs | service | — | Savings | ₹1,800.00 | Needs invoice (14 Nov) | — | `No invoice · 6 d` |
| 6 | 19 Nov | Spray paint matte black ×6 | Blinkit | online | Order BLK-90417733 | Card | ₹1,314.00 | Needs invoice (19 Nov) | — | none (1 d); hint `Invoice on site` |
| 7 | 17 Nov | Expo flyers A5 ×500 | QuickPrint Copy Centre | service | Bill 2291 | Savings | ₹2,360.00 | Ready | Expo Flyers Invoice.pdf | none |
| 8 | 03 Nov | AWS invoice — October | Amazon Web Services | service | Bill 2026-OCT-1193 | Card | ₹1,042.37 | Ready | AWS Invoice.pdf | none |
| 9 | 31 Oct | Basement spare keys ×2 | Corner Key Maker | shop | "-" | Savings | ₹300.00 | Ready | Scan (handwritten) | `Handwritten bill`; remark "Informal/raw bill attached" |
| 10 | 23 Oct | Metal fabrication — CNC table frame | Apex Steel Works | service | Bill 147 | Savings | ₹8,500.00 | Ready | Metal Fabrication Invoice.pdf | `Possible duplicate` (ledger row L3) |
| 11 | 20 Oct | Electronics components (ESP32 ×5, sensors, jumpers) | Robu.in | online | Order RB-478203 / Bill IN-20871 | Card | ₹4,286.50 | Ready | Electronics Components 1 Invoice.pdf | none |
| 12 | 28 Sep | O-week tent rental | Festive Tent House | service | Bill 612 | Other | ₹12,000.00 | Ready (entered from scanned invoice) | O-week Tent Invoice.pdf | `Payment not matched` (neutral) |
| 13 | 29 Dec 2025 | Spray paint | Rainbow Paints & Hardware | shop | Bill 7731045 | Savings | ₹250.00 | Ready (entered from scanned invoice) | Spray Paint Invoice.pdf | `Already filed in January1` (ledger row L1) |

Purposes to set: 4 → "Workbench build", 7 → "Expo", 10 → "CNC table", 12 → "O-week".

Checks: Out of pocket ₹45,419.87 (13). Needs attention holds items 2, 3, 4, 5, 13, 10 plus two alerts (below). Groups after removing flagged rows: Awaiting delivery 1 · Refund pending 0 · Needs invoice 1 · Ready 5. `Select all clean` selects items 7, 8, 9, 11, 12 = **₹19,988.87**, form total rounded up **₹19,989**.

Closed list (behind "Show closed & reimbursed"): Acrylic sheet 3 mm ×2 · Amazon · ₹1,150.00 · paid 21 Oct · cancelled 24 Oct · **Refunded 02 Nov → Closed**. Plus the Claimed/Reimbursed items via their batches.

### 7.2 Non-item attention entries

- `3 statement lines to sort · Nov` (rule 6)
- `Conference trip unpaid · 143 d` (rule 8)

### 7.3 Amazon candidates (6) — fetched 20 Nov, 10:14

| # | Item name | Qty | Order date | Grand total | Ship to | Payment method | State |
|---|---|---|---|---|---|---|---|
| A1 | HEPA H13 replacement filter for air purifier | 2 | 22 Jul 2026 | ₹1,896.20 | University Makerspace | BHIM UPI | Candidate |
| A2 | MDF board 12 mm, 2×4 ft | 4 | 09 Nov 2026 | ₹3,240.00 | University Makerspace | BHIM UPI | `Already tracked` → item 2 |
| A3 | Kapton tape + heat-shrink tubing kit | 1 | 02 Nov 2026 | ₹649.00 | University Makerspace | BHIM UPI | Candidate |
| A4 | Bosch jigsaw blades T101B (pack of 5) | 2 | 28 Oct 2026 | ₹1,098.00 | University Makerspace | Visa credit card ending 4417 | Card — not his |
| A5 | Safety goggles, anti-fog (pack of 10) | 1 | 15 Oct 2026 | ₹2,450.00 | University Makerspace | Mastercard credit card ending 9021 | Card — not his |
| A6 | Soldering iron tips T18 series ×3 | 1 | 12 Aug 2026 | ₹1,600.00 | University Makerspace | BHIM UPI | `Already filed in September1` (ledger row L2) |

Thumbnails: grey placeholder squares with the first letter. Default view shows A1, A2, A3, A6; ticking A1 + A3 gives footer `2 selected · ₹2,545.20`.

### 7.4 Statement lines (8) — Nov 2026

| # | Date | Account | Narration | Debit | Credit | Initial result |
|---|---|---|---|---|---|---|
| S1 | 09 Nov | Savings | `UPI/631344120987/AMAZON PAY/amazonpay@apl` | ₹3,240.00 | | Matched → item 2 |
| S2 | 11 Nov | Savings | `UPI/631567009812/NEW ERA PLY/paytmqr28…@paytm` | ₹6,450.00 | | Matched → item 4 |
| S3 | 12 Nov | Savings | `UPI/631690443310/SWIGGY/swiggy@upi` | ₹486.00 | | Unsorted (he marks Personal) |
| S4 | 14 Nov | Savings | `UPI/631877650021/CITY CABS/98xxxxxx00@ybl` | ₹1,800.00 | | Matched → item 5 |
| S5 | 16 Nov | Savings | `UPI/632045118876/METRO HARDWARE/bharatpe…@fbpe` | ₹740.00 | | Unsorted (forgotten lab payment → `Lab — new item`) |
| S6 | 17 Nov | Savings | `UPI/632190332254/QUICKPRINT/quickprint@okaxis` | ₹2,360.00 | | Matched → item 7 |
| S7 | 18 Nov | Card | `UPI-ROBU IN MACFOS LTD-PUNE` | ₹1,180.00 | | Matched → item 1 |
| S8 | 13 Nov | Card | `REFUND-ROBU IN MACFOS LTD` | | ₹2,697.00 | Suggested → item 3 refund (`Confirm` closes item 3) |

Header progress starts at `5 of 8 sorted`. "Items with no debit this month": item 6 (Blinkit, 19 Nov, Card) — statement excerpt ends 18 Nov.

### 7.5 Batches and ledger rows

| Batch | Status | Submitted | Items | Total | Note |
|---|---|---|---|---|---|
| November1 | Submitted | 12 Nov 2026 | 6 | ₹14,236.00 | 8 d |
| Conference trip | Submitted | 30 Jun 2026 | 11 | ₹58,250.00 | 143 d → attention |
| September1 | Reimbursed | 04 Sep 2026 (paid 29 Sep) | 14 | ₹31,420.00 | |
| January1 | Reimbursed | 03 Jan 2026 | 9 | ₹11,874.00 | |

Ledger rows the duplicate logic must hit (the mockup ledger needs only these plus ~6 filler rows for search):

| # | Date | Bill no | Description | Amount | Batch | Status | Matches |
|---|---|---|---|---|---|---|---|
| L1 | 29 Dec 2025 | 7731045 | Spray Paint | ₹250.00 | January1 | reimbursed | item 13 (hard: bill no + amount) |
| L2 | 12 Aug 2026 | IN-5120 | Soldering tips T18 ×3 (Amazon) | ₹1,600.00 | September1 | reimbursed | A6 (hard: order ref) |
| L3 | 21 Oct 2026 | - | Metal fabrication — CNC table frame advance | ₹8,500.00 | November1 | claimed | item 10 (soft: same amount, 2 days apart) |

Filler rows (all reimbursed): City Cabs 3 · 5207 · ₹2,400.00 · September1; Lamp Kit MDF Laser Cut · 41 · ₹4,500.00 · September1; O-Week Banner Stand PVC · 612 · ₹2,100.00 · September1; Badge Workshop Vinyl · 904 · ₹2,250.00 · September1; Robu Order (Workshop Prep) · 30418 · ₹12,000.00 · January1; Sensor Board PCB · 207731 · ₹1,800.00 · September1.

Note: filler row "O-Week Banner Stand PVC" shares bill no 612 with item 12 but a different amount — it must **not** flag (hard match needs bill no and amount).

---

## 8. Mockup build notes

- One HTML file, data as a JS object at the top, all transitions (stage changes, ticks, sorting statement lines, creating a batch) mutate that object and re-render. Nothing persists on reload.
- Must be clickable end to end for flows (a)–(h). Camera/file pickers can be a native file input; "upload to paperless" is instant and fake.
- Phone layout below 720px; everything reachable with a thumb, primary buttons in the bottom half.
- Keyboard on laptop: `n` opens Add, `/` focuses search, `Esc` closes panels.

## 9. Out of scope for v1

- OCR or auto-reading amounts from screenshots, bills or SMS.
- In-app parsing of statements or scraping of Amazon/Robu/Blinkit (Claude does these; the app only receives results).
- Building the form, PDF or email inside the app; sending email.
- Push notifications or reminders (the Needs-attention list is the reminder).
- Multiple users, logins, roles, or sharing with the other co-lead.
- Splitting one payment across several Items, or partial refunds.
- Budgets, category analytics, charts, exports.
- Offline mode / sync on the phone (private network assumed reachable).
- A document viewer or tagger (use paperless-ngx directly).
- Editing the historical ledger beyond marking batches reimbursed.
