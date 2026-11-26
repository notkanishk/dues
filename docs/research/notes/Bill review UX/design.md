# Bill review screen: four designs, a shared visual language, a recommendation

Status: design only, nothing built. Written so one static HTML prototype can be built from it without further questions. All vendors, addresses, GSTINs and numbers below are fictional.

Words follow `GLOSSARY.md`: Claimant, Bill, Invoice, Informal bill, Payment proof, Payment, Expense, Claim, Reading, Reference (B-431) versus Bill number (what the vendor prints).

## 1. The moment

A file has arrived and a vision model has produced a Reading (ADR 0006). Readings only propose. The Claimant must confirm the values before the Bill can go on a Claim. The screen has one job: let the Claimant agree with the invoice total in one glance and one key, and stop them only where Dues has a real reason to doubt.

Three facts shape everything:

1. The total is nearly always right (97-100%), but the whole set (date, bill number, total) is right only about 80% of the time. So the total needs a glance; the other fields need *targeted* stops, not a uniform form.
2. When a value is found in the paperless OCR text, Dues knows where it is on the page, and it was right in every measured case except ambiguous numeric dates and wrong-label bill numbers. A box is therefore strong evidence, and its absence is real information.
3. About a third of bills (handwritten, bad scans) have no box for the total. The screen must say so plainly and never draw a guess.

## 2. Shared model (all four variants use this)

### 2.1 Fields

| Field | Required to confirm the Bill | Notes |
|---|---|---|
| Invoice total | always | The hero. Exact paise as printed. |
| Bill date | always | |
| Bill number | for an Invoice | An Informal bill or Payment proof may have none. |
| Vendor | always | |
| Vendor GSTIN | never | Optional; never blocks. |
| Payment (amount, date, method) | read-only context | Already known to Dues; shown as the second witness, not edited here. |

### 2.2 Field states

Each field is in exactly one state. Every state has a shape, a two-or-three-word label and a colour, so colour is never the only cue.

| State | Meaning | Glyph (16px) | Label | Hue | Box on page | Stops the flow? |
|---|---|---|---|---|---|---|
| `located` | Value found in OCR text, checks pass | small rounded rectangle outline | On the page | accent | solid | no |
| `check` | Found on the page but doubtful: ambiguous numeric date, or bill number whose printed label is not an invoice label | diamond with `?` | Check this | amber | dashed, one per candidate | yes |
| `unlocated` | The reader gave a value, Dues could not find it on the page | dotted circle | Not found on page | neutral | none | yes |
| `missing` | The reader found nothing | short dash in a dotted pill | Nothing read | neutral | none | yes if required |
| `conflict` | Value disagrees with the Payment (amount differs, or date more than 10 days from the Payment) | `≠` | Differs from Payment | red | as located/unlocated underneath | yes |
| `confirmed` | The Claimant confirmed it | tick | Confirmed | neutral ink | solid hairline, no fill | no |

Two sub-labels refine `confirmed`, shown as muted text after the tick: "placed by you" (the Claimant pointed to the value on the page, 2.5) and "differs from the document" (the Claimant typed a value that is not in the OCR text; this is the spec's existing rule in FUNCTIONAL §3.2).

`conflict` wins over the other unconfirmed states for the glyph, but the text always carries both facts, for example "Differs from Payment · not found on page".

Checks that make a located field clean:

- Total: parses as money; equals the Payment amount when the Expense has one Bill, or the Bills of the Expense sum to no more than the Payment.
- Date: unambiguous as printed (month in words, or day above 12, or four-digit year first) and within 10 days of the Payment date. `06/11/2026` is never clean.
- Bill number: the nearest printed label to its left or above is an invoice label ("Invoice No", "Bill No", "Inv #", "Tax Invoice No"), and no other identifier on the page has a better label.
- GSTIN: 15 characters, valid pattern and check digit. (The prototype checks the pattern only; the fictional GSTINs below are not check-digit valid on purpose.)
- Vendor: found in the OCR text.

### 2.3 Stops and the one-key accept

A **stop** is a field in `check`, `unlocated`, `conflict`, or a required field in `missing`. A bill with no stops is **clean**.

- On opening a bill, focus goes to the first stop in the order total, date, bill number, vendor, GSTIN. If the bill is clean, focus goes to the Confirm button.
- `Enter` always does the obvious next thing and the primary button's label always says what that is:
  - clean bill: "Confirm bill · ₹18,643.42" confirms every field and moves to the next bill. One key.
  - on a stop: confirms that field as shown, moves to the next stop. After the last stop the button becomes "Confirm bill".
- A bill can never be confirmed in one key while it has a stop. `Cmd/Ctrl+Enter` (confirm bill from anywhere) with stops left does not confirm; it moves focus to the first stop and the status line reads "2 to check first".
- An `unlocated` total always takes its own deliberate `Enter`, even when it equals the Payment. The agreement is shown ("equals Payment") because it is real evidence, but it is not treated as a box.
- Confirming is undoable (`Cmd/Ctrl+Z`, and a 6 second "Confirmed B-431 · Undo" toast) until the Bill is on a submitted Claim.

### 2.4 Boxes on the preview

Boxes are drawn only for `located`, `check` and `confirmed`-with-location fields. Never for `unlocated` or `missing`. No approximate regions, no "probably around here".

Coordinates are `x, y, w, h` as percentages of the page (origin top-left). The drawn box is the OCR word box grown by 3px on each side.

| Box | Style |
|---|---|
| Total, located | 2px solid `--box-accent`, radius 3px, fill `--box-accent` at 12% with `mix-blend-mode: multiply` (reads as a highlighter stroke, text stays crisp). A tag sits outside the top-left corner: `TOTAL`, 10px caps, white on `--box-accent`, radius 2px. |
| Other field, located | 1px solid `--box-accent`, no fill, 55% opacity at rest; tag hidden at rest. |
| Candidate (`check`) | 1.5px dashed `--box-warn` (dash 4, gap 3), no fill; tag shows the choice number and printed label: `1 · Invoice #`, `2 · Reference Number`. |
| Confirmed | 1px solid `--box-ink` at 45%, no fill; tag is a tick. Quiet on purpose: finished work recedes. |
| Placed by you | As confirmed, tag shows a pin and "you". |
| Focused / hovered | Outline 2px, opacity 100%, fill 16%, tag visible; every other box drops to 25% opacity; the page outside the box is not dimmed (except variant C). |

Every box also carries `box-shadow: 0 0 0 1px rgba(255,255,255,.75)` so it holds 3:1 on dark photos. Box colours are fixed across light and dark mode because the paper is light in both (4.4).

Link between field and region, both directions:

- Hover or focus a field: its box takes the focused style and the camera moves (below). Hover or focus a box: the field row takes the focused style. Click a box: focus moves to the field.
- Boxes are real focusable elements (`role="button"`, `aria-label="Total, ₹18,643.42, on the page"`), in the same tab order as the fields, so the page is usable without a mouse and announced by screen readers.

Camera:

- At rest the preview is fit-to-width of its pane.
- Focusing a located field pans and zooms so the box plus its nearest label sits centred, the box about 35% of the pane width, zoom capped at 3x and never below fit. 240ms, `cubic-bezier(.2,.8,.2,1)`. With `prefers-reduced-motion` it is an instant cut.
- Hover alone does not move the camera (only the highlight), so a passing mouse never causes motion sickness. Focus does.
- Focusing an `unlocated` or `missing` field returns the camera to fit-to-width: there is nothing to fly to, and the whole page is the honest place to look.
- `Z` toggles fit page and fit field. Pinch, scroll-wheel zoom and drag pan always work. `Esc` returns to fit.
- Multi-page files: a page strip (thumbnails) sits at the preview's edge; focusing a field jumps to its page first.

### 2.5 Point to it (fields with no box)

For `unlocated` and `missing` fields the row offers **Point to it** (`L`). The preview enters locate mode: crosshair cursor, a caption strip "Click the total on the bill · Esc to cancel", and the OCR words under the pointer get a faint underline so the Claimant can see what is clickable.

- Click a word (or drag across several): Dues reads that text from the OCR layer.
  - Same as the reader's value: the field becomes `confirmed`, "placed by you", and a box appears there.
  - Different: the row shows both, "Page says 1,180.00 · reader said 1,150.00", with keys `1` and `2`. Nothing is overwritten silently.
- No OCR words there (handwriting): drag a rectangle instead. Dues stores the region as evidence only, the value stays as typed or read, and the box is tagged "you". The caption says so: "No text layer here. Drag around the total to mark it."
- Pointing is always optional. The Claimant may simply read the page and press `Enter`; the field is then `confirmed` with no box.

### 2.6 Choosing between candidates (`check`)

A `check` field lists its candidates as numbered choices, each with the printed label and its own dashed box:

- Ambiguous date `06/11/2026`: `1` 6 Nov 2026 (day of the Payment) · `2` 11 Jun 2026. The interpretation nearest the Payment date is listed first.
- Bill number: `1` ORS-2611-0419 (printed as "Invoice #") · `2` 8830015527 (printed as "Reference Number", the reader's pick). The candidate with an invoice label is listed first; the reader's pick is named as such.

`Enter` takes choice 1. `1`/`2`/`3` take that choice. Either way the field becomes `confirmed` and the losing boxes disappear.

### 2.7 Editing

Values are shown as text, not as open inputs; a form of five boxed inputs is what makes review screens look heavy.

- `E`, `F2`, or click on a value: it becomes an input in place, text selected. `Enter` saves and confirms, `Esc` cancels. Single-letter shortcuts are off while an input has focus.
- Total input: `type="text" inputmode="decimal" lang="en-IN"`, live Indian grouping, paise kept exactly; a whole number gets `.00` on blur. Label for screen readers: "Total in rupees".
- Date input: native `<input type="date">`.
- After an edit Dues looks for the new value in the OCR text. Found: the box moves there. Not found: the box is removed and the field reads "Confirmed · differs from the document".
- `N` on a `missing` field: "Not on the bill" (confirms the absence; valid for bill number on Informal bills and for GSTIN).

### 2.8 Keys (laptop)

| Key | Action |
|---|---|
| `Enter` | Do the primary action (confirm this field / confirm bill) |
| `Cmd/Ctrl+Enter` | Confirm bill from anywhere, if clean |
| `↑` `↓` or `Tab` `Shift+Tab` | Move between fields |
| `1` `2` `3` | Take a candidate |
| `E` / `F2` | Edit the focused value |
| `L` | Point to it on the page |
| `N` | Not on the bill |
| `Z` | Fit page / fit field |
| `J` `K` | Next / previous bill |
| `S` | Skip for later (stays unconfirmed, moves on) |
| `Cmd/Ctrl+Z` | Undo last confirm |
| `?` | Show this list |
| `Esc` | Cancel edit, leave locate mode, or zoom out |

### 2.9 Files with several invoices

A file with two invoices becomes two Bills. They are reviewed one after another like any two bills, but tied together visibly:

- A segment control above the hero: `Invoice 1 of 2 · p.1` `Invoice 2 of 2 · p.2`. `J`/`K` walk them.
- The preview shows only the pages of the current invoice at full strength; other pages stay in the page strip, dimmed.
- A tally line under the hero: `₹6,490.00 + ₹3,186.00 = ₹9,676.00 · equals Payment`. If it does not add up, the line is a `conflict` on whichever invoice is open.
- "Split is wrong" (menu): merge into one Bill, or mark a page as the start of another invoice. Rare; menu only.

### 2.10 States of the screen itself

| Situation | What the Claimant sees |
|---|---|
| Still reading | Preview is shown at once. Field values are skeleton bars with "Reading the bill…". The total input is usable: the Claimant can type now; anything they confirm is kept and the Reading fills only unconfirmed fields (ADR 0006). |
| Couldn't read (all providers failed or refused) | All fields `missing`. Hero is an empty total input with focus and the line "Couldn't read this bill. Type the total; the page is on the left." If OCR text exists, Point to it still works. |
| No text layer (handwriting, bad scan) | A quiet chip on the preview: "No text layer · nothing can be boxed on this page". All fields `unlocated` or `missing`. |
| Preview failed to load | Fields are shown, a placeholder says "Preview unavailable · Open in paperless". Confirming is disabled with the reason in text: "You can't confirm a bill you can't see." |
| Not a bill / wrong file | Menu action "This isn't a bill" (returns the document to matching, W4). |
| Possible duplicate (Ledger match, §7) | A banner above the hero; confirming is still possible, claiming is blocked elsewhere. Not designed here. |
| Queue empty | "All bills reviewed." and one line: "4 bills are ready for a Claim" with a link to build one. |

Payment proof: when the Bill is a UPI screenshot, the Bill number row is replaced by "UPI reference", and the Payment line reads "This screenshot is the Payment".

## 3. The four variants

They differ in what the screen is *made of*: A is a page with notes in its margin, B is a stack of evidence crops with no page, C is a camera and one question, D is a table of bills.

### A. Margin Notes

**Idea:** the bill on the left, a quiet column of notes on the right, a thin line joining each note to its place on the paper.

**Laptop (≥ 1024px)**

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ‹ Bills   3 of 12  ◆ ● ● ○ ○ ○ ○ ○ ○ ○ ○ ○            B-431 · E-213   ? │  48px bar
├───────────────────────────────────────────┬──────────────────────────────┤
│                                           │ Tessaract Components Pvt Ltd │  vendor, serif 20
│   ┌───────────────────────────────┐       │                              │
│   │                               │       │ ₹18,643.42                   │  hero, serif 56
│   │        page, fit to width     │       │ ▭ On the page · equals       │
│   │                               │       │   Payment 14 Nov, UPI        │
│   │               TOTAL           │       │ ──────────────────────────── │
│   │              ┌──────────┐─────┼───────┤ DATE         14 Nov 2026  ▭  │  40px rows
│   │              │₹18,643.42│     │       │ BILL NO      TC/26-27/01847 ▭│
│   │              └──────────┘     │       │ GSTIN        29AAKCT4821M1Z7▭│
│   └───────────────────────────────┘       │                              │
│  [p.1]                                    │ [ Confirm bill · ₹18,643.42 ↵]│  pinned bottom
└───────────────────────────────────────────┴──────────────────────────────┘
        preview pane, 62%                        rail, 38% (min 360, max 440)
```

**Phone (< 720px):** preview on top at 42vh (pinch and pan), a sheet below holding the hero then the rows, the primary button pinned above the safe area (56px, full width). Focusing a row moves the camera in the preview above. No leader lines on phone; the focused box and the focused row share the same 2px accent edge instead.

**Total as hero:** it is the only large thing on the screen: 56px serif, alone, with a full line of evidence under it. Its box is the only filled box on the page.

**How the rest recede:** label-value rows at 15px, caps labels at 11px in `--ink-3`, state glyph only (label text appears on focus or when the state is a stop). Clean rows have no border and no background. A stop row gets a tinted background and its label text, so stops are the only rows that draw the eye.

**Boxes and link:** as 2.4, plus the variant's signature: for the focused field a 1px `--box-accent` leader line runs from the row's left edge across the gutter to the box's nearest edge (SVG overlay, drawn after the camera settles, 120ms fade). At rest only the total's leader is drawn, at 40% opacity.

**Not located:** the row shows the dotted-circle glyph, "Not found on page", and a `Point to it  L` link. No leader, no box, camera at fit.

**Field states:** glyph at the right end of each row; stops additionally get tint and text as above; `check` rows expand to show the numbered candidates (2.6).

**Confirm and edit:** as 2.3 and 2.7. The rail is the tab order.

**Batch:** the top bar carries the count and one small mark per bill (hollow circle to review, diamond has stops, filled circle confirmed); `J`/`K` move; marks are clickable.

**Motion:** camera 240ms; leader fade 120ms; on confirm the fill drains from the total's box (180ms) and the tag becomes a tick; bill change is a 200ms crossfade with the new page rising 12px.

**Empty and error:** as 2.10; the rail keeps its shape with skeleton bars so the layout never jumps.

**Strengths:** everything visible at once; familiar; the leader line removes hunting. **Weakness:** the eye still travels the width of the screen between the box and the value; the rail is a form, however quiet.

### B. Proof Strips

**Idea:** do not show the bill; show the *evidence*. Each value sits directly under a crop of the page where it was found, so comparing is a vertical glance of a few millimetres.

**Laptop**

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ‹ Bills   3 of 12  ◆ ● ● ○ ○ ○ …                      B-431 · E-213   ? │
├──────────────────────────────────────────────────────────────────────────┤
│                    Tessaract Components Pvt Ltd                          │
│        ┌───────────────────────────────────────────────────┐             │
│        │  …   Grand Total                   ┌──────────┐   │  crop of    │
│        │                                    │₹18,643.42│   │  the page   │
│        └────────────────────────────────────└──────────┘───┘  (hero)     │
│                                              ₹18,643.42      read value, │
│                              ▭ On the page · equals Payment  right-aligned
│                                                              under crop  │
│        ┌──────────────────────┐  ┌──────────────────────┐                │
│        │Invoice Date 14-Nov-26│  │Invoice No. TC/26-27/…│   small crops  │
│        └──────────────────────┘  └──────────────────────┘                │
│         14 Nov 2026         ▭     TC/26-27/01847       ▭                 │
│        ┌──────────────────────┐                                          │
│        │GSTIN: 29AAKCT4821M1Z7│          View whole bill  Space          │
│        └──────────────────────┘                                          │
│         29AAKCT4821M1Z7     ▭       [ Confirm bill · ₹18,643.42  ↵ ]     │
└──────────────────────────────────────────────────────────────────────────┘
                     single column, max 680px, centred
```

**Phone:** the same column at full width; small crops stack one per row. This is the variant that needs no adaptation for the phone.

**Crops:** a crop is the union of the value's box and its nearest printed label, padded by 1.5 times the box height, rendered from the page image at 2x zoom. Including the label is not decoration: it is what makes a wrong-label bill number visible ("Reference Number 8830015527"). The value's box is drawn inside the crop in the 2.4 style. The hero crop spans the full column and is 96px tall; small crops are 44px tall in a two-column grid.

**Total as hero:** the widest crop and the largest type, stacked, with the read value right-aligned so its digits sit under the printed digits.

**How the rest recede:** half-width crops, 15px values, no labels at all (the printed label inside the crop is the label; an `aria-label` names the field).

**Link, zoom:** there is no camera at rest; the crop is the zoom. `Space` or "View whole bill" opens the page in a full-height overlay with all boxes (2.4), focused on the current field. Click a crop does the same.

**Not located:** the crop slot is a hatched placeholder the same size, holding a 44px page thumbnail and the words "Not found on the page · Point to it". `L` or a click opens the overlay in locate mode (2.5). The empty slot is deliberately conspicuous: the absence of evidence is shown as an absence.

**Field states:** glyph and label under each crop; `check` shows one crop per candidate, side by side, numbered.

**Confirm and edit:** as 2.3 and 2.7; the value under the crop becomes the input.

**Batch:** as A. Because the column is short, the next bill's hero crop peeks in at the bottom at 30% opacity, and confirming scrolls it up into place.

**Motion:** on confirm the column slides up by one bill (240ms); crops fade in 120ms as images decode.

**Empty and error:** on a bill with no text layer every slot is hatched, which looks bleak. In that case B gives up its own idea and shows the whole page above the values (A's phone layout) with the chip "No text layer". Honest, but it means B is two layouts.

**Strengths:** shortest eye travel of the four; superb on a phone; honest about absence. **Weakness:** context is lost (a decoy "Taxable value" line just outside the crop cannot be seen); about a third of bills fall back to another layout.

### C. Spotlight

**Idea:** the bill fills the screen and a camera takes the Claimant to each thing worth asking about, one question at a time. Nothing clean is asked.

**Laptop**

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ‹ 3 of 12   ▭ 14 Nov 2026   ▭ TC/26-27/01847   ▭ Tessaract…   ▭ GSTIN   │  ribbon of chips
├──────────────────────────────────────────────────────────────────────────┤
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│ ░░░░░░  page, zoomed to the total; everything outside the box   ░░░░░░░ │
│ ░░░░░░  is dimmed by a 35% scrim                                 ░░░░░░░ │
│ ░░░░░░░░░░░░░░░░░░░░   Grand Total   ┌────────────┐ ░░░░░░░░░░░░░░░░░░░░ │
│ ░░░░░░░░░░░░░░░░░░░░                 │ ₹18,643.42 │ ░░░░░░░░░░░░░░░░░░░░ │
│ ░░░░░░░░░░░░░░░░░░░░                 └────────────┘ ░░░░░░░░░░░░░░░░░░░░ │
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│              ┌──────────────────────────────────────────┐                │
│              │ TOTAL                                    │  caption card  │
│              │ ₹18,643.42          [ Yes, confirm  ↵ ]  │  520px, bottom │
│              │ equals Payment · 4 other values found    │  centre        │
│              └──────────────────────────────────────────┘                │
└──────────────────────────────────────────────────────────────────────────┘
```

**Phone:** page fills the top; the caption card is a fixed bottom sheet with two 56px buttons, "Yes" and "Edit". The ribbon collapses to "4 found · 1 to check".

**Total as hero:** it is the first and, on a clean bill, the only question. The scrim leaves the printed total as the brightest thing on screen, and the card repeats it in 44px serif.

**How the rest recede:** they are chips in the ribbon: glyph plus value at 13px. Clean chips are never asked about. Clicking a chip visits it (camera flies, card changes).

**Boxes and link:** only the box of the current question is drawn; the scrim (page colour multiplied by 65%) does the highlighting. Hovering a chip previews its box without moving the camera.

**Sequence:** total first, always (a clean bill is one `Enter` on this card); then each stop in order; then the bill confirms itself after the last answer.

**Not located:** no scrim, camera at fit page, and the card says what is true: "The reader says ₹1,150.00 but it wasn't found on the page. Click it on the bill, or check by eye." Buttons: "It's right ↵", "Edit E", "Point to it L".

**Field states:** chip glyphs; the card's top line carries the state label of the current question.

**Confirm and edit:** `Enter` = yes; `E` turns the card's value into the input; `1`/`2` for candidates, both boxes lit, scrim cut around both.

**Batch:** after the last answer the page slides out left and the next slides in already zoomed to its total, so a run of clean bills is `Enter`, `Enter`, `Enter` with the total always in the same place on screen.

**Motion:** the most of any variant: camera flights between questions (280ms), scrim fade (160ms). Reduced motion: cuts, and the scrim appears without fading.

**Empty and error:** "Couldn't read" becomes a card with the total input and the page undimmed.

**Strengths:** total fixation point never moves, so batches of clean bills are the fastest of the four; it is impossible to confirm the total without having looked at the printed total. **Weakness:** no overview while answering; a bill with four stops is four camera flights; the modal card hides part of the page; constant motion tires in a long batch.

### D. Tally Sheet

**Idea:** review is a column of totals. Show every bill as one row with a crop of its printed total beside the read total, and open a bill only when it has a stop.

**Laptop**

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Bills to review · 12              7 clean · 5 to check      [Confirm 7 clean]│
├───┬──────────────────────┬────────────┬───────────────┬────────────┬────────┤
│   │ Vendor               │ Date       │ As printed    │      Total │ Payment│
├───┼──────────────────────┼────────────┼───────────────┼────────────┼────────┤
│ ▭ │ Tessaract Components │ 14 Nov     │ [₹18,643.42]  │ ₹18,643.42 │ equals │ ← focused row
│   │  TC/26-27/01847  [Invoice Date 14-Nov-2026] [Invoice No. TC/26-27/01847] │   grows: crops
│ ◆ │ Marigold Hardware    │ 6 Nov ?    │ [ 2,360.00 ]  │  ₹2,360.00 │ equals │
│ ≠ │ Peepal Tree Station… │ 13 Nov     │ no crop ◌     │  ₹1,150.00 │ ₹1,180 │
│ ▭ │ Orbitline · 1 of 2   │ 17 Nov     │ [₹6,490.00]   │  ₹6,490.00 │ part   │
│ ◆ │ Orbitline · 2 of 2   │ 19 Nov     │ [₹3,186.00]   │  ₹3,186.00 │ part   │
└───┴──────────────────────┴────────────┴───────────────┴────────────┴────────┘
```

**Phone:** two-line rows (vendor and state on line one; crop and total on line two), 64px tall; tapping a row opens that bill full-screen in A's phone layout.

**Total as hero:** the two right-hand columns: the crop ("As printed", 160×28px) and the read total (serif 17px, right-aligned, tabular). Reading down the pair of columns is the whole review for a clean batch.

**How the rest recede:** vendor and date are plain 14px cells; bill number and GSTIN are not columns at all. They appear, with their crops, on the second line that the focused row grows.

**Boxes and link:** crops carry the box. A row with stops opens with `Enter` or `→` into an inline panel (page left, fields right: variant A at half height) with full boxes, camera and Point to it.

**Not located:** the crop cell shows the dotted circle and "no crop"; such a row is never clean and cannot be bulk-confirmed.

**Field states:** the row glyph is the worst state among its fields; the date cell gets `?` for an ambiguous date; the Payment cell says "equals", "part" (one of several Bills) or the differing amount in red with `≠`.

**Confirm and edit:** `Enter` on a clean row confirms it and moves down. `X` selects rows; "Confirm 7 clean" (`Cmd/Ctrl+Enter`) confirms all clean rows after a dialog that states the count and the sum ("Confirm 7 bills, ₹41,220.50 in all?"), capped at 25 rows.

**Batch:** it *is* the batch. `↑`/`↓` move rows.

**Motion:** row confirm: the row's text dims to `--ink-3` and a tick draws (160ms); panel open/close 200ms height.

**Empty and error:** empty table text as 2.10; a bill that couldn't be read is a row reading "Couldn't read · open to type the total".

**Strengths:** the fastest for twenty clean bills; shows the Payment agreement as a column. **Weakness:** it invites confirming dates and bill numbers nobody looked at (the 80% problem); the document is absent by default; bulk confirm is the opposite of the honesty goal; it is a second screen to build on top of a detail view that is still needed.

## 4. Shared visual language

Calm, paper-and-ink, one accent. The posh comes from restraint: generous space, a fine serif for the few things that matter, hairlines instead of boxes.

### 4.1 Type

Two families.

- **Source Serif 4** (variable, optical sizes) for money in hero and total positions and for the vendor name. `font-variant-numeric: lining-nums tabular-nums`.
- **Inter** for everything else, with `font-feature-settings: "tnum", "zero", "ss02"` on identifiers (bill number, GSTIN, References) so `0/O` and `1/I/l` cannot be confused. No third (mono) family.
- Stacks: `"Source Serif 4", ui-serif, Georgia, serif` and `Inter, ui-sans-serif, system-ui, sans-serif`. Check that `₹` renders from both fonts, not a fallback, on Android Chrome and macOS before committing.

| Token | Family | Size / line | Weight | Use |
|---|---|---|---|---|
| `hero` | serif | 56 / 60 (phone 44 / 48) | 500 | The invoice total |
| `amount` | serif | 17 / 24 | 500 | Totals in lists, tally line |
| `title` | serif | 20 / 26 | 500 | Vendor |
| `value` | sans | 15 / 22 | 500 | Field values |
| `body` | sans | 14 / 20 | 400 | Evidence lines, captions |
| `label` | sans | 11 / 16, caps, tracking 0.06em | 500 | Field labels, box tags (10px) |
| `micro` | sans | 12 / 16 | 400 | State labels, key hints |

Key hints are `micro` in a 1px `--line-strong` rounded outline (radius 4), never filled.

### 4.2 Money

- `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 })` and `formatToParts`: `₹18,643.42`, `₹1,23,456.00`. Always two decimals. A Bill is never rounded; only a Claim total is.
- In `hero` only: the `₹` is 0.6em, `--ink-2`, top-aligned to the cap height; the paise (`.42`) are 0.6em, `--ink-2`, baseline-aligned. Integer part in `--ink`. Elsewhere everything is one size.
- Amounts are right-aligned in any column; left-aligned only when alone (the hero).
- A difference is written out with its sign and a word, never colour alone: `≠ Payment ₹1,180.00 · ₹30.00 less`.
- Stored as integer paise. "As printed" text from the Reading (for example `1180/-`) is kept and shown in the evidence line when it differs in form from the formatted value.

### 4.3 Colour tokens

Contrast was computed for every text pair below; all text is ≥ 4.8:1 on `--bg` and `--surface`, and `--line-strong` is ≥ 3:1 for control outlines.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#F6F4EF` | `#141413` | Canvas, preview pane backdrop |
| `--surface` | `#FFFFFF` | `#1C1C1A` | Rail, cards, sheets |
| `--surface-2` | `#FBFAF7` | `#232320` | Hover, skeleton |
| `--line` | `#E4E0D6` | `#33322E` | Hairlines, dividers |
| `--line-strong` | `#8E897D` | `#77736A` | Control and key-hint outlines |
| `--ink` | `#1C1B19` | `#ECEAE4` | Values, hero |
| `--ink-2` | `#55524B` | `#B5B1A7` | Evidence lines, `₹`, paise |
| `--ink-3` | `#6F6B62` | `#8F8B81` | Labels, muted |
| `--accent` | `#2B3A8C` | `#A9B8FF` | Located glyph, focus ring, primary button |
| `--accent-bg` | `#E9ECF9` | `#232A4D` | Focused row tint |
| `--warn` | `#7A4F00` | `#E3B341` | `check` glyph and text |
| `--warn-bg` | `#FBF1D9` | `#3A2E10` | `check` row tint |
| `--bad` | `#A8321F` | `#FF9A8A` | `conflict` glyph and text |
| `--bad-bg` | `#FBE9E5` | `#3F1D17` | `conflict` row tint |
| `--on-accent` | `#FFFFFF` | `#141413` | Text on primary button |

Paper-relative tokens, the same in both themes because they sit on the document, not on the UI:

| Token | Value | Use |
|---|---|---|
| `--box-accent` | `#2B3A8C` | Located boxes, total fill at 12%, leader line |
| `--box-warn` | `#B26A00` | Candidate boxes (dashed) |
| `--box-ink` | `#1C1B19` | Confirmed boxes at 45% |
| `--box-bad` | `#A8321F` | Outline of a located value that conflicts with the Payment |
| `--scrim` | `rgba(20,20,19,.35)` | Variant C dimming |

Hue budget: neutral, one accent, amber, red. There is no green. Confirmed is quiet ink with a tick, because finished work should not shout. Red appears only for a conflict with the Payment.

Tokens are CSS custom properties on `:root`, overridden under `@media (prefers-color-scheme: dark)` guarded by `:root:not([data-theme="light"])` and under `:root[data-theme="dark"]`, with a theme toggle in the prototype.

### 4.4 The page in dark mode

The document is never inverted. In dark mode the page keeps its own colours with `filter: brightness(.92)` and sits on `--bg` with a 1px `--line` edge and a soft shadow, so it reads as a sheet of paper on a dark desk.

### 4.5 Space, shape, depth

- Spacing scale: 4, 8, 12, 16, 24, 32, 48. Rail padding 24 (phone 16). 32 between the hero block and the field rows.
- Rows: 40px on laptop, 56px on phone. Tap targets ≥ 44px. Primary button 44px on laptop, 56px full-width on phone, with `env(safe-area-inset-bottom)`.
- Radius: 3 (boxes on the page), 6 (controls), 10 (cards, sheets).
- Borders are hairlines (`--line`). One shadow in the whole UI: under the page, `0 1px 2px rgba(0,0,0,.06), 0 8px 24px rgba(0,0,0,.08)`.
- Focus: 2px `--accent` ring with a 2px offset on every focusable thing, including boxes on the page (there the ring is `--box-accent` plus the white halo).

### 4.6 Motion

| What | Duration | Easing |
|---|---|---|
| Hover, tint, glyph change | 120ms | ease-out |
| Camera pan/zoom | 240ms | `cubic-bezier(.2,.8,.2,1)` |
| Confirm (fill drains, tick draws) | 180ms | ease-out |
| Bill change | 200ms crossfade, new page rises 12px | ease-out |

Nothing loops, nothing bounces. Under `prefers-reduced-motion: reduce` every transform is an instant cut and only opacity changes remain (≤ 120ms).

### 4.7 Words

Sentence case, plain, short. "On the page", "Check this", "Not found on page", "Nothing read", "Differs from Payment", "Confirmed". Dues never says "confidence", "AI", a percentage, or "verified". It states what it knows: where a value is, and what it agrees with.

## 5. Recommendation

**Build A (Margin Notes) as the structure, put B's proof strip in the hero, drive it with C's stop-to-stop keyboard flow, and leave D out of v1.**

Concretely, the recommended screen is variant A with three changes:

1. **Hero proof strip (from B).** Directly above the 56px total in the rail sits a crop of the printed total with its label (rail width, 72px tall, box drawn inside). Printed digits and read digits are then stacked a few millimetres apart; the glance that matters most needs no eye travel and no camera. For an `unlocated` total the slot is the hatched placeholder with "Not found on the page · Point to it": the absence is as visible as the evidence would have been. Only the total gets a strip; other fields rely on the box, leader and camera.
2. **Stops as the flow (from C), without the modal.** `Enter` walks total-if-doubtful, then each stop, with the camera flying to each; clean fields are never visited; a clean bill is one `Enter`. The whole rail stays visible throughout, so there is always an overview. No scrim: other boxes drop to 25% instead.
3. **Phone uses B's column** for bills with a text layer (crops stacked, full-page overlay on tap) and A's phone layout (page on top) for bills without one. The same components, arranged for the thumb.

Why, against the two tests:

- **Efficiency.** A clean bill costs one glance (crop over value) and one key; that is the same cost as C and one key more per bill than D's bulk confirm. A bill with one stop costs two keys. For the measured mix (roughly 60-70% of bills located and clean on total; about 20% with a date or bill number doubt) a batch of twenty is around thirty keypresses with the eyes resting in one place. D would save perhaps fifteen keypresses per batch and C would add camera flights for no gain.
- **Honesty.** A box, a crop and a leader line appear only where Dues knows the location. Where it does not, the hero shows an empty hatched slot and the words "Not found on page", the camera stays on the whole page, and the bill cannot be confirmed in one key. Doubt about a located value (ambiguous date, wrong label) is shown as rival dashed candidates with their printed labels rather than as a vaguer shade of the same box. The Payment is shown as a separate witness in words, never folded into a score. D fails this test: bulk confirm puts a tick on dates and bill numbers that are wrong one time in five. B alone fails softly: it hides the context that reveals a decoy, and it changes layout for a third of bills.
- **Elegance.** One page, one column of ink, one filled highlight, one large number. A alone already has this; the proof strip adds the single most useful image to it.

Left out, and when to add it: D's table and bulk confirm, when a Claimant regularly faces more than about thirty bills at once *and* the measured full-set accuracy on located-clean bills is known to be near 100%. C's scrim, if user testing shows people confirm totals without looking. A split/merge editor for multi-invoice files beyond the menu action, when a mis-split is actually seen.

Open questions for the build, not blocking the prototype: whether paperless OCR word boxes are available per page through its API or need the hOCR/PDF text layer; whether the crop is cut server-side or drawn client-side from the page image (the prototype does it client-side with CSS).

## 6. Prototype specification

One static HTML file, no build step, no dependencies beyond the two Google Fonts (plus `Caveat` for the fake handwriting). All four variants plus the recommended combination, switched by a segmented control in a prototype-only toolbar at the very top ("A · B · C · D · Recommended", and a light/dark toggle). The same data and the same state logic drive every variant.

### 6.1 Rendering the fake bills

Each page is a `div` with a fixed aspect ratio and `container-type: inline-size`, white (or as stated) background. Every text item is absolutely positioned at `left: x%; top: y%` with `font-size` in `cqw` (percent of page width), `white-space: nowrap`, `line-height: 1.2`, Inter unless marked `hand` (Caveat) or `serif`.

Located field values are positioned by their **box**: `left/top/width/height` = the box's `x/y/w/h` percentages, `display: flex; align-items: center`, text at the listed size. The overlay uses the same numbers, so text and box agree by construction. If a value overflows its box in the chosen font, reduce that value's font size; do not change the box.

Every non-handwritten text item is also an OCR word for Point to it (use the element's own rendered rectangle). Handwritten items are not OCR words.

A crop is the same page element rendered again inside an `overflow: hidden` frame, scaled and translated to the crop rectangle (union of the value box and its label item, padded by 1.5 × box height).

### 6.2 Data shape

```js
// one Bill to review
{
  ref: "B-431", expense: "E-213", kind: "invoice" | "informal" | "payment_proof",
  file: "…pdf", pages: [{ aspect: "210 / 297", bg: "#fff", items: [...] }],
  invoiceOf: null | { index: 1, count: 2, sumPaise: 967600 },
  payment: { amountPaise: 1864342, date: "2026-11-14", method: "UPI · Savings account" },
  fields: {
    total:  { state, valuePaise, printed, page, box: [x, y, w, h] | null, label: "itemId" | null },
    date:   { state, value: "2026-11-14", printed, page, box, candidates?: [...] },
    billNo: { state, value, printed, page, box, candidates?: [{ value, printedLabel, box, readerPick }] },
    vendor: { state, value, page, box },
    gstin:  { state, value, page, box }
  }
}
```

### 6.3 Sample bill 1: clean GST PDF invoice

`B-431` · Expense `E-213` ("Stepper drivers and power supply for the CNC router") · kind Invoice · file `tessaract-inv-01847.pdf` · 1 page, aspect `210 / 297`, white.
Payment: ₹18,643.42 · 14 Nov 2026 · UPI, Savings account.
Expected behaviour: clean. One `Enter` confirms.

Page items (x, y in % of page; size in cqw):

| id | Text | x | y | Size | Style |
|---|---|---|---|---|---|
| vendor | TESSARACT COMPONENTS PVT LTD | box | box | 2.6 | bold |
| addr | Plot 41, 3rd Cross, Example Industrial Layout, Bengaluru 560000 | 8 | 9.4 | 1.4 | |
| gstinL | GSTIN: | 8 | 11.4 | 1.4 | |
| gstin | 29AAKCT4821M1Z7 | box | box | 1.4 | |
| doc | TAX INVOICE | 70 | 6 | 2.2 | bold |
| noL | Invoice No. | 62 | 11 | 1.4 | |
| no | TC/26-27/01847 | box | box | 1.4 | bold |
| dateL | Invoice Date | 62 | 13.4 | 1.4 | |
| date | 14-Nov-2026 | box | box | 1.4 | |
| poL | Order Ref. | 62 | 15.8 | 1.4 | |
| po | PO-7731 | 76 | 15.8 | 1.4 | |
| billto | Bill to: Makerspace, Northfield University, Bengaluru | 8 | 19 | 1.4 | |
| th | # · Description · HSN · Qty · Rate · Amount (columns at x = 8, 12, 52, 62, 70, 82) | | 25 | 1.3 | bold, 1px rule under at y 27 |
| r1 | 1 · TB6600 stepper driver · 8504 · 4 · 1,249.50 · 4,998.00 | cols | 28.5 | 1.4 | |
| r2 | 2 · 24V 15A switching power supply · 8504 · 1 · 3,450.00 · 3,450.00 | cols | 31.5 | 1.4 | |
| r3 | 3 · NEMA 23 stepper motor 19 kg-cm · 8501 · 3 · 2,450.50 · 7,351.50 | cols | 34.5 | 1.4 | |
| taxL / tax | Taxable value / 15,799.50 | 58 / 82 | 46 | 1.4 | 1px rule above at y 44.5 |
| cgL / cg | CGST 9% / 1,421.96 | 58 / 82 | 48.6 | 1.4 | |
| sgL / sg | SGST 9% / 1,421.96 | 58 / 82 | 51.2 | 1.4 | |
| totL | Grand Total | 58 | 56 | 1.9 | bold |
| total | ₹18,643.42 | box | box | 1.9 | bold |
| words | Rupees Eighteen Thousand Six Hundred Forty-Three and Forty-Two Paise Only | 8 | 61 | 1.3 | italic |
| sign | Authorised signatory | 70 | 84 | 1.3 | |
| foot | This is a computer-generated invoice. | 8 | 93 | 1.2 | `#777` |

Fields:

| Field | Value shown | Printed | State | Box x, y, w, h | Label item |
|---|---|---|---|---|---|
| Total | ₹18,643.42 | ₹18,643.42 | located | 79.5, 55.7, 12.5, 2.2 | totL |
| Date | 14 Nov 2026 | 14-Nov-2026 | located | 76, 13.3, 9.2, 1.6 | dateL |
| Bill number | TC/26-27/01847 | same | located | 76, 10.9, 12, 1.6 | noL |
| Vendor | Tessaract Components Pvt Ltd | caps | located | 8, 6, 42, 2.6 | none |
| GSTIN | 29AAKCT4821M1Z7 | same | located | 15, 11.3, 13, 1.6 | gstinL |

The "Taxable value 15,799.50" line is a deliberate decoy near the total.

### 6.4 Sample bill 2: phone photo of a shop bill

`B-432` · Expense `E-214` ("Fasteners and hand tools") · kind Invoice · file `IMG_20261106_1842.jpg` · 1 page, aspect `3 / 4`.
The page is the whole photo: background `#3B3833` (a desk). The paper is a child rectangle at x 9, y 6, w 82, h 88, background `#F1ECDD`, with a soft diagonal gradient for uneven light. Rotate the *whole page element including its overlay* by `-1.2deg` for a hand-held look; coordinates stay those of the unrotated photo.
Payment: ₹2,360.00 · 6 Nov 2026 · UPI, Savings account.
Expected behaviour: one stop (ambiguous date). `Enter` takes 6 Nov 2026, second `Enter` confirms the bill. GSTIN is missing and does not block.

| id | Text | x | y | Size | Style |
|---|---|---|---|---|---|
| vendor | MARIGOLD HARDWARE & TOOLS | box | box | 3.4 | bold, `#7A1F1F` |
| addr | Shop 7, Old Market Road, Example Nagar, Bengaluru 560000 | 18 | 14.6 | 1.7 | |
| doc | CASH / CREDIT BILL | 36 | 19 | 2 | bold, underlined |
| noL | Bill No. | 14 | 25 | 2 | |
| no | 1482 | box | box | 2.4 | bold, `#B3261E` (numbering stamp) |
| dateL | Date | 62 | 25 | 2 | |
| date | 06/11/2026 | box | box | 2 | |
| th | Particulars · Qty · Rate · Amount (columns at x = 14, 52, 60, 72) | | 32 | 1.8 | bold, rule under at y 35 |
| r1 | M6 x 30 Allen bolts SS · 50 · 6.00 · 300.00 | cols | 37 | 1.8 | |
| r2 | Hacksaw frame 12 in · 2 · 280.00 · 560.00 | cols | 41 | 1.8 | |
| r3 | Epoxy adhesive 450 g · 3 · 345.00 · 1,035.00 | cols | 45 | 1.8 | |
| r4 | Cable ties 200 mm (pkt) · 3 · 155.00 · 465.00 | cols | 49 | 1.8 | |
| totL | TOTAL | 52 | 62 | 2.6 | bold, rule above at y 60 |
| total | 2,360.00 | box | box | 2.6 | bold |
| note | Goods once sold will not be taken back. | 14 | 80 | 1.5 | |
| for | For Marigold Hardware & Tools | 52 | 87 | 1.6 | |

| Field | Value shown | Printed | State | Box x, y, w, h | Label item |
|---|---|---|---|---|---|
| Total | ₹2,360.00 | 2,360.00 | located | 69.5, 61.6, 13.5, 3.2 | totL |
| Date | 6 Nov 2026 | 06/11/2026 | check | 70, 24.8, 12, 2.4 | dateL |
| Bill number | 1482 | 1482 | located | 26, 24.7, 6.5, 2.8 | noL |
| Vendor | Marigold Hardware & Tools | caps | located | 18, 9.8, 54, 3.8 | none |
| GSTIN | none | none | missing | none | none |

Date candidates (both use the same box): `1` 6 Nov 2026, "day of the Payment"; `2` 11 Jun 2026. Row text: "Printed 06/11/2026 · could be 6 Nov or 11 Jun".

### 6.5 Sample bill 3: handwritten bill, no boxes for handwriting

`B-433` · Expense `E-215` ("Poster printing for open day") · kind Informal bill · file `scan-0031.pdf` · 1 page, aspect `148 / 210`, background `#FAF7EE`, faint ruled lines every 4% from y 26 to y 66 (`#D9D3C3`).
Payment: ₹1,180.00 · 13 Nov 2026 · Cash.
Preview chip: "No text layer for handwriting · only the printed heading could be boxed".
Expected behaviour: the reader misread the total. Stops: total (conflict, not found on page), date (not found on page). Bill number missing is allowed on an Informal bill (`N`, or left as "Not on the bill"). The Claimant corrects the total to 1,180.00 (edit, or drag a rectangle with Point to it and then edit); it then reads "Confirmed · equals Payment".

| id | Text | x | y | Size | Style |
|---|---|---|---|---|---|
| vendor | PEEPAL TREE STATIONERS & XEROX | box | box | 3.2 | bold, `#1F3A7A`, printed |
| addr | Near Gate 2, College Road, Example Nagar, Bengaluru 560000 | 12 | 11.5 | 1.7 | printed, `#1F3A7A` |
| noL | No. | 12 | 18 | 2 | printed (nothing written after it) |
| dateL | Date | 58 | 18 | 2 | printed |
| date | 13/11/26 | 68 | 16.8 | 4 | hand, `#1B2A6B` |
| h1 | A3 sheets 300gsm x 40 | 14 | 27 | 3.6 | hand |
| a1 | 600 | 78 | 27 | 3.6 | hand |
| h2 | Lamination A3 x 10 | 14 | 35 | 3.6 | hand |
| a2 | 350 | 78 | 35 | 3.6 | hand |
| h3 | Spiral binding x 2 | 14 | 43 | 3.6 | hand |
| a3 | 80 | 80 | 43 | 3.6 | hand |
| h4 | Marker set | 14 | 51 | 3.6 | hand |
| a4 | 150 | 78 | 51 | 3.6 | hand |
| totL | Total | 56 | 70 | 4 | hand, rule above at y 68 |
| total | 1180/- | 72 | 70 | 4.4 | hand, the `8` drawn loosely (letter-spacing -0.02em) |
| sign | (signature squiggle) | 62 | 86 | 4 | hand; use the text "~~~" |

| Field | Value shown | Printed | State | Box x, y, w, h |
|---|---|---|---|---|
| Total | ₹1,150.00 | reader said `1150/-` | conflict (and not found on page) | none |
| Date | 13 Nov 2026 | reader said `13/11/26` | unlocated | none |
| Bill number | none | none | missing (not required) | none |
| Vendor | Peepal Tree Stationers & Xerox | caps | located | 12, 6.8, 59, 3.4 |
| GSTIN | none | none | missing | none |

Hero evidence line: "≠ Payment ₹1,180.00 · ₹30.00 less · not found on page". For the prototype's drag-to-mark, accept any rectangle.

### 6.6 Sample bill 4: one PDF, two invoices

File `orbitline-invoices-nov.pdf` · 2 pages, each aspect `210 / 297`, white · Expense `E-216` ("Microcontrollers and servos for the robotics workshop") · one Payment: ₹9,676.00 · 17 Nov 2026 · Credit card.
It yields two Bills: `B-434` (page 1) and `B-435` (page 2). Tally line on both: `₹6,490.00 + ₹3,186.00 = ₹9,676.00 · equals Payment`.
Expected behaviour: `B-434` is clean (one `Enter`). `B-435` has one stop: the reader picked the Reference Number as the bill number.

Both pages share this template; values differ as listed.

| id | Text (page 1 / page 2) | x | y | Size | Style |
|---|---|---|---|---|---|
| vendor | ORBITLINE ROBOTICS SUPPLY LLP | box | box | 2.4 | bold |
| addr | Unit 12, Example Tech Park, Bengaluru 560000 | 8 | 9 | 1.4 | |
| gstinL | GSTIN | 8 | 11.2 | 1.4 | |
| gstin | 29AAGFO7350Q1Z3 | box | box | 1.4 | |
| doc | Tax Invoice | 74 | 6 | 2.2 | bold |
| refL | (page 2 only) Reference Number | 62 | 10.6 | 1.4 | |
| ref | (page 2 only) 8830015527 | box | box | 1.4 | bold |
| noL | Invoice # | 62 | 13 | 1.4 | |
| no | ORS-2611-0412 / ORS-2611-0419 | box | box | 1.4 | |
| dateL | Dated | 62 | 15.4 | 1.4 | |
| date | 17 November 2026 / 19 November 2026 | box | box | 1.4 | |
| billto | Bill to: Makerspace, Northfield University, Bengaluru | 8 | 19 | 1.4 | |
| th | Item · Qty · Rate · Amount (columns at x = 8, 60, 70, 82) | | 25 | 1.3 | bold, rule under at y 27 |
| r1 | Pico W microcontroller board · 10 · 550.00 · 5,500.00 / MG996R servo motor · 6 · 450.00 · 2,700.00 | cols | 28.5 | 1.4 | |
| cgL / cg | CGST 9% / 495.00 (page 2: 243.00) | 58 / 82 | 42 | 1.4 | rule above at y 40.5 |
| sgL / sg | SGST 9% / 495.00 (page 2: 243.00) | 58 / 82 | 44.6 | 1.4 | |
| totL | Total payable | 58 | 50 | 1.9 | bold |
| total | ₹6,490.00 / ₹3,186.00 | box | box | 1.9 | bold |
| foot | Page 1 of 2 / Page 2 of 2 | 8 | 93 | 1.2 | `#777` |

`B-434` (page 1):

| Field | Value shown | State | Box x, y, w, h | Label item |
|---|---|---|---|---|
| Total | ₹6,490.00 | located | 80.5, 49.7, 11.5, 2.2 | totL |
| Date | 17 Nov 2026 | located | 78, 15.3, 12.4, 1.6 | dateL |
| Bill number | ORS-2611-0412 | located | 78, 12.9, 11.2, 1.6 | noL |
| Vendor | Orbitline Robotics Supply LLP | located | 8, 5.9, 44, 2.5 | none |
| GSTIN | 29AAGFO7350Q1Z3 | located | 15, 11.1, 13, 1.6 | gstinL |

`B-435` (page 2): total, date (19 Nov 2026), vendor and GSTIN as `B-434` with the same boxes and total ₹3,186.00. Bill number:

| Candidate | Value | Printed label | Box x, y, w, h | Note |
|---|---|---|---|---|
| 1 | ORS-2611-0419 | Invoice # | 78, 12.9, 11.2, 1.6 | listed first: invoice label |
| 2 | 8830015527 | Reference Number | 78, 10.5, 8.6, 1.6 | the reader's pick |

State `check`. Row text: "The reader chose the Reference Number. The page also has an Invoice #."

### 6.7 What the prototype must demonstrate

1. All six field states, each with glyph, label and (where it applies) box, in light and dark.
2. Clean bill: one `Enter` (bill 1, `B-434`).
3. Candidate choice with `1`/`2` and two dashed boxes (bill 2 date, `B-435` bill number).
4. No-box honesty: bill 3 shows no box and no crop for the total, the hatched slot, and refuses the one-key confirm.
5. Point to it: click a word on bills 1, 2, 4; drag a rectangle on bill 3.
6. Edit the total with live Indian grouping; "differs from the document" when the new value is not on the page.
7. Camera: focus a field, the page pans and zooms to it; `Z`, `Esc`; reduced-motion cut.
8. Two-invoice tally line and `J`/`K` across the five Bills; the progress marks; the "All bills reviewed" end state; Undo.
9. Phone width (≤ 420px) for each variant.
10. A prototype-only "simulate" menu for: still reading, couldn't read, preview failed.

One self-check to leave in the prototype (`console.assert` on load): for every sample bill, line items plus tax equal the printed total, the two Orbitline totals sum to the Payment, and every `located` field has a box while every `unlocated`/`missing` field has none.

## 7. Decisions

Variant R approved by the owner on 21 Nov 2026: "variant R looks good". Standing rules went to `DESIGN.md` and `PRODUCT.md`; ADRs 0008 and 0009 record the two that are hard to reverse. Decisions below are local to this screen.

**Layout (variant R).** Page on the left, rail on the right; the proof strip sits over the 56px total; `Enter` goes from stop to stop; on phone one column; a bill with no text layer shows the page on top and rows below.

**Typed total not on the page.** The printed total stays in the strip with an ink box and no `TOTAL` tag; the line reads "differs from the document". Owner, 21 Nov 2026: "yes to all three" (R3-Q1 to Q3).

**Keys while pointing.** Tab, Shift+Tab and the arrows walk the printed words in one reading order; `Esc` ends pointing; two taps or clicks mark a region. Owner, 21 Nov 2026: "yes to all three" (R3-Q2); arrows, "yes" (D4). Marking a region by keyboard alone is a recorded exception (ADR 0008).

**Undo.** One "Undo confirm" on the status line above the primary; a single value is corrected by editing it; Cmd+Z steps back one entry and names it. Owner, 21 Nov 2026: "yes to all three" (R3-Q3); asked "wouldnt an undo per entry item make more sense than one global undo for the invoice?", then accepted one undo per bill: "1. yes" (D3). Editing a confirmed bill: "reconfirm" (ADR 0009).

**D1.** The strip and the total share right edges. **D6.** The thumbnail stays. **D8.** The end screen is bare, with an inert "Build a Claim →". Designer's calls, 21 Nov 2026, built in Round 4; covered by the owner's approval of R.

