---
name: Dues
description: Paper and ink for reimbursements. One accent, one large number, hairlines instead of boxes.
colors:
  bg: "#F6F4EF"
  surface: "#FFFFFF"
  surface-2: "#FBFAF7"
  line: "#E4E0D6"
  line-strong: "#8E897D"
  ink: "#1C1B19"
  ink-2: "#55524B"
  ink-3: "#6F6B62"
  accent: "#2B3A8C"
  accent-bg: "#E9ECF9"
  warn: "#7A4F00"
  warn-bg: "#FBF1D9"
  bad: "#A8321F"
  bad-bg: "#FBE9E5"
  on-accent: "#FFFFFF"
  bg-dark: "#141413"
  surface-dark: "#1C1C1A"
  surface-2-dark: "#232320"
  line-dark: "#33322E"
  line-strong-dark: "#77736A"
  ink-dark: "#ECEAE4"
  ink-2-dark: "#B5B1A7"
  ink-3-dark: "#8F8B81"
  accent-dark: "#A9B8FF"
  accent-bg-dark: "#232A4D"
  warn-dark: "#E3B341"
  warn-bg-dark: "#3A2E10"
  bad-dark: "#FF9A8A"
  bad-bg-dark: "#3F1D17"
  on-accent-dark: "#141413"
  box-accent: "#2B3A8C"
  box-warn: "#B26A00"
  box-warn-ink: "#8F5500"
  box-ink: "#1C1B19"
  box-bad: "#A8321F"
typography:
  hero:
    fontFamily: "Source Serif 4, ui-serif, Georgia, serif"
    fontSize: "56px"
    fontWeight: 500
    lineHeight: "60px"
    letterSpacing: "-0.01em"
    fontFeature: "lnum, tnum"
  hero-phone:
    fontFamily: "Source Serif 4, ui-serif, Georgia, serif"
    fontSize: "44px"
    fontWeight: 500
    lineHeight: "48px"
    letterSpacing: "-0.01em"
    fontFeature: "lnum, tnum"
  title:
    fontFamily: "Source Serif 4, ui-serif, Georgia, serif"
    fontSize: "20px"
    fontWeight: 500
    lineHeight: "26px"
  amount:
    fontFamily: "Source Serif 4, ui-serif, Georgia, serif"
    fontSize: "17px"
    fontWeight: 500
    lineHeight: "24px"
    fontFeature: "lnum, tnum"
  value:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: "22px"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "20px"
  micro:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "16px"
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: "16px"
    letterSpacing: "0.06em"
  action:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: "20px"
  tag:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 600
    lineHeight: "10px"
    letterSpacing: "0.05em"
rounded:
  tag: "2px"
  page-box: "3px"
  hint: "4px"
  control: "6px"
  toast: "8px"
  card: "10px"
  pill: "999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "6": "24px"
  "8": "32px"
  "12": "48px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.value}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.value}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  button-secondary-hover:
    backgroundColor: "{colors.surface-2}"
  field-row:
    textColor: "{colors.ink}"
    typography: "{typography.value}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
    height: "40px"
  field-row-focus:
    backgroundColor: "{colors.accent-bg}"
  field-row-check:
    backgroundColor: "{colors.warn-bg}"
  field-row-conflict:
    backgroundColor: "{colors.bad-bg}"
  field-row-absent:
    backgroundColor: "{colors.surface-2}"
  candidate:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 10px"
    height: "44px"
  candidate-tag:
    backgroundColor: "{colors.box-warn-ink}"
    textColor: "#FFFFFF"
    typography: "{typography.tag}"
    rounded: "{rounded.tag}"
    padding: "3px 5px"
  key-hint:
    textColor: "{colors.ink-2}"
    typography: "{typography.micro}"
    rounded: "{rounded.hint}"
    padding: "0 4px"
  toast:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.bg}"
    rounded: "{rounded.toast}"
    padding: "8px 8px 8px 16px"
  dialog:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "20px 24px"
    width: "460px"
---

# Design System: Dues

Captured from the bill review prototype, variant R (`prototypes/bill-review/index.html`), and `docs/research/notes/Bill review UX/design.md`. Status: approved by the owner on 21 Nov 2026 after Round 6. Refreshed the same day from the Round 4 to 6 builds, re-reviewed with real input at 1440, 1024, 760 and 390, light and dark. The decisions behind it are in `docs/research/notes/Bill review UX/design.md` ("Decisions"); history is in `review-R.md`. Where the prototype and this file disagree, this file states the intent.

## Overview

**Creative North Star: "The Annotated Ledger"**

A sheet of paper on a desk, and beside it one column of ink in a careful hand. The document is the witness; the interface is the marginal note that points at it. Dues looks calm because it only speaks where it knows something: a box where a value was found, a hatched gap where it was not, a second line naming the Payment as the other witness.

The posh comes from restraint. One large serif number, generous space around it, hairlines instead of boxes, one accent used for evidence and the next action. Finished work goes quiet: confirmed is plain ink and a tick, never green. Density is low on the things that matter and tight on the rest: a 56px total over 40px rows.

**Key Characteristics:**
- One hero per screen: the invoice total, set large in serif, with its printed twin cropped from the page directly above it.
- State is a glyph plus two or three words. Colour only reinforces.
- Hairlines and tints, not cards. One shadow in the whole product, under the paper.
- The document is never restyled: light in both themes, never inverted.
- Keyboard first on laptop: the primary button's label always says what `Enter` will do.

## Colors

Warm paper neutrals, one deep ink-blue accent, amber for doubt, brick red only for disagreement with the Payment.

### Primary
- **Ledger Blue** (`accent`, dark: `accent-dark`): the located glyph, the focus ring, the primary button, links. Its tint `accent-bg` marks the focused row.

### Secondary
- **Doubt Amber** (`warn` on `warn-bg`): `check` state only: a value found on the page that could be read two ways.

### Tertiary
- **Brick** (`bad` on `bad-bg`): `conflict` only: a value that disagrees with the Payment.

### Neutral
- **Desk** (`bg`): canvas and the pane behind the paper.
- **Sheet** (`surface`) and **Sheet Shade** (`surface-2`): the rail, cards, hover and skeleton.
- **Hairline** (`line`): dividers. **Outline** (`line-strong`): control and key-hint outlines (3:1 or better).
- **Ink** (`ink`): values and the hero. **Ink 2** (`ink-2`): evidence lines, the rupee sign, paise. **Ink 3** (`ink-3`): labels and muted text on plain surfaces only.

### Paper-relative
`box-accent`, `box-warn`, `box-warn-ink`, `box-ink`, `box-bad` sit on the document, so they are the same in light and dark. `box-warn` draws the dashed candidate border; `box-warn-ink` is the darker fill behind a candidate's white number (6.1:1, where `box-warn` gave 4.2:1). Every box also carries a 1px white halo (`0 0 0 1px rgba(255,255,255,.75)`) to hold on dark photos.

### Named Rules
**The No Green Rule.** There is no success colour. Confirmed is `ink` and a tick; finished work recedes.
**The Value Is Ink Rule.** State colour belongs to the glyph and the state line. A value is always `ink`, whatever its state.
**The Red Means Payment Rule.** `bad` appears only when a value disagrees with the Payment. Never for validation, never for emphasis.
**The Tint Label Rule.** On a focused row or a stop (`accent-bg`, `warn-bg`, `bad-bg`, Sheet Shade) labels and muted placeholders ("Nothing read", "Choose 1 or 2") step up from `ink-3` to `ink-2` to hold 4.5:1.

## Typography

**Display Font:** Source Serif 4 (with ui-serif, Georgia)
**Body Font:** Inter (with ui-sans-serif, system-ui)

**Character:** A bookish serif for the few things that are money or a name; a plain sans for everything else. Two families, no mono. (The prototype also loads Caveat, only to imitate handwriting on the mock bill. It is not part of the interface.)

### Hierarchy
- **Hero** (500, 56/60, phone 44/48, lining tabular figures): the invoice total. The `₹` and the paise are 0.6em in `ink-2`; the rupee sign is top-aligned. It never wraps: a long amount scales down to fit its block (`min(56px, 175cqi / characters)`). The editor for the total is 44/48.
- **Title** (500, 20/26, serif): the vendor.
- **Amount** (500, 17/24, serif, tabular): totals in lists and the tally line.
- **Value** (500, 15/22, sans): field values and button text.
- **Body** (400, 14/20): evidence lines, captions.
- **Action** (500, 13/20): link actions ("Point to it", "Edit") and hint lines.
- **Micro** (400, 12/16): state lines, key hints.
- **Label** (500, 11/16, 0.06em, uppercase): field labels.
- **Tag** (600, 10px, 0.05em, uppercase, white): tags on the document.

### Named Rules
**The One Big Number Rule.** Only the total is set in Hero. Nothing else on the screen exceeds Title.
**The Identifier Rule.** Bill numbers, GSTINs and References use Inter with `"tnum","zero","ss02"` so 0/O and 1/I/l cannot be confused.
**The Exact Money Rule.** `Intl.NumberFormat('en-IN', {style:'currency', currency:'INR', minimumFractionDigits:2})`. Always two decimals, Indian grouping, never rounded. A difference is written with amount and direction: "≠ Payment ₹1,180.00 · ₹30.00 less".

## Layout

- **Laptop (720px and up):** a 48px top bar; below it two columns: the document pane (fluid) and the rail (`clamp(360px, 38%, 440px)`), separated by a hairline. The rail scrolls; its footer with the primary button is pinned. Rail padding 24px; rows inset a further 12px, and every line of text in the rail shares that 36px edge. A focused row is always scrolled fully into view above the pinned footer, candidates included (R3-4).
- **Rail order:** invoice-of-file segments (when a file holds several), vendor, hero block (proof strip 72px, total, evidence line), tally line, date, bill number, GSTIN, Payment line.
- **Structure:** the two columns are `<main>`; the bar carries a visually hidden `<h1>` ("Review bill B-431"). Each field is a named group ("Date, 14 Nov 2026, On the page"). `Tab` walks bill marks, `?`, the field groups and their actions, then the primary. Boxes and page buttons on the document are pointer targets; while pointing, the printed words join the walk (see Pointing).
- **Phone (under 720px):** one column, 16px gutters, everything left-aligned except the total, which sits right under its printed twin. Order: vendor, segments, hero crop (96px) over the total, tally, then one 44px crop per field over its value; tapping a crop opens the whole bill in a full-screen overlay. A field with candidates shows one crop per distinct place on the page, stacked (one for an ambiguous date, two captioned "1 Invoice #", "2 Reference Number"). A field with nothing located shows a hatched slot that names it, "GSTIN · Point to it", so no cell is anonymous (R3-2). Without a text layer: the page on top (46vh), rows below. The primary button is pinned above the safe area, 56px, full width.
- **Rhythm:** spacing scale 4, 8, 12, 16, 24, 32, 48. 24 above the hero, 16 below. Rows 40px on laptop, 56px on phone. Touch targets at least 44px.
- **Camera:** the document rests at fit. Focusing a located field pans and zooms to it (box about 35% of the pane, zoom 1 to 3, 240ms `cubic-bezier(.2,.8,.2,1)`); focusing a field with no box returns to fit. Hover highlights but never moves the camera. Wheel and pinch zoom from 1 to 6; dragging pans, and at least a quarter of the pane always shows the page.

## Elevation & Depth

Flat. Depth is tonal: Desk behind Sheet, hairlines between regions, tints for state.

### Shadow Vocabulary
- **Paper** (`0 1px 2px rgba(0,0,0,.06), 0 8px 24px rgba(0,0,0,.08)`): under the document page, and under the transient layers that float over it (toast, dialog).

### Named Rules
**The One Shadow Rule.** Only paper and things floating above the whole screen cast a shadow. Rows, cards and buttons never do.
**The Paper Stays Paper Rule.** In dark mode the page keeps its own colours at `brightness(.92)` with a hairline edge. It is never inverted.

## Shapes

Small radii, stepped by role: 3px for boxes on the page, 6px for controls and rows, 10px for cards, sheets and dialogs, a full pill only for floating chips. Borders are 1px hairlines; controls use the stronger outline. Dashes mean "one of several candidates"; a diagonal hatch means "nothing was found here". Neither is used decoratively.

## Components

### Buttons
- **Shape:** 6px radius, 44px tall (primary 56px full-width on phone).
- **Primary:** Ledger Blue fill, `on-accent` text, label states the exact action and value ("Confirm bill · ₹18,643.42", "Take 1 · 6 Nov 2026"), with the `↵` key hint outlined in the text colour. When the total disagrees with the Payment the label ends "· ≠ Payment" ("Confirm bill · ₹1,150.00 · ≠ Payment"); a long label grows the button rather than squeezing two lines into 44px. The action is fixed by the field the label names and is the same from `Enter`, a click, a tap and `Tab` While pointing, the label is "Cancel pointing" (R3-3). An open choice is a stop: the primary resolves it ("Use page value · ₹15,799.50") before it can confirm the bill. A reopened bill reads "Confirm again · ₹…".
- **Secondary:** Sheet fill, Outline border; hover Sheet Shade.
- **Link action:** Action type in Ledger Blue with its key hint ("Point to it L", "Edit E"); 44px tall on phone.
- **Focus:** 2px Ledger Blue ring, 2px offset, on everything focusable. For controls the app focuses on arrival (the primary after a confirm, the end-screen heading) the ring shows only after a key press, never after a pointer press; elements the user focuses keep their ring. One ring at a time, on every screen. Disabled: 45% opacity with the reason in text beside it.

### Field rows
- **Style:** label (84px column, Label type) · value (Value type, Ink) · state glyph at the right end. No border, no background at rest.
- **Focused:** `accent-bg` tint and one 2px Ledger Blue ring drawn inside the row (offset -2px), the same from mouse and keyboard. No side bar. A row with no value opens its second line (state in words, "Point to it", "Not on the bill"); a row with a value never changes height.
- **Stop:** tinted by state (`warn-bg`, `bad-bg`, or Sheet Shade with a hairline for "not found" and "nothing read") and always shows its second line; a focused stop keeps its own tint under the ring. Stops are the only rows that draw the eye, on laptop and on phone.
- **Check row:** the value reads "Choose 1 or 2" until one is taken, so the row never shows a pick that `Enter` would not take.
- **Confirmed but disagreeing:** a confirmed date more than 10 days from the Payment keeps its second line in Brick: "Confirmed · 148 days from Payment".
- **Click to edit:** values are click-to-edit (hover tint `surface-2`, text cursor on laptop; "Edit" beside the value on phone). Rows never change height; the only exception is a row with no value, which opens its detail line.
- **Editing:** the value becomes an input in place (36px, 6px radius, Ledger Blue border); `Enter` saves, `Esc` cancels.

### State glyphs (16px, 1.5px stroke)
Rounded rectangle outline = On the page · diamond with `?` = Check this · dotted circle = Not found on page · dash in a dotted pill = Nothing read · circled `≠` = Differs from Payment · tick = Confirmed. Each always travels with its words on a stop.

### Hero proof strip (signature)
A 72px crop of the document around the printed total and its printed label, with the total's box drawn inside, sitting directly above the 56px read total. Printed digits and read digits are a few millimetres apart. The crop is scaled to fit both the width and the height of its frame, so the box is always whole; it shows only its own box, and only the `TOTAL` tag. A crop stays on the page; where it cannot, the gap is Sheet Shade, never white. The strip and the read total share their right edges (the printed box ends 12px inside the frame's right edge); both are left-aligned only when the slot is hatched or the bill has no text layer. After the Claimant types a total that is not on the page, the strip keeps the printed total with a `box-ink` box at 45% and no `TOTAL` tag, with no "Point to it" and no leader; the line reads "Confirmed · differs from the document". When the total was not located, the slot is a dashed, hatched placeholder with a page thumbnail and "Not found on the page · Point to it". The absence is as visible as the evidence would have been. The placeholder is a button whose only action is Point to it, with its own focus ring and a name that starts with its visible words (R3-2).

**Evidence line.** Under the total: glyph and words ("On the page · equals Payment 14 Nov, UPI"). A confirmed total that still disagrees with the Payment shows two lines: tick "Confirmed", then the circled `≠` and "≠ Payment ₹1,180.00 · ₹30.00 less" in Brick. A place the Claimant marked reads "marked by you", before and after confirming (R3-20). "Differs from the document" is said only when the page has a text layer and the Claimant did not mark the place.

### Boxes on the document
- **Total, located:** 2px `box-accent`, 12% fill with multiply blend (a highlighter stroke), tag `TOTAL` above-left.
- **Other located:** 1px `box-accent` at 55% opacity; tag only when focused.
- **Candidate:** 1.5px dashed `box-warn`; its tag is the number only (`1`, `2`, or `1/2` when both readings share one place), white on `box-warn-ink`.
- **Confirmed / placed by you:** 1px `box-ink` at 45%, no fill, tick or pin on `box-ink` at 75%.
- **Tag position:** `TOTAL` and a focused field's name sit above the box's left corner. Candidate numbers, the tick and "you" sit to the right of the box at mid-height, so no tag covers a neighbouring printed value.
- **Focused:** 2px, 16% fill; all other boxes drop to 25% and hide their tags: a tag is readable or absent (R3-15).
- Drawn only where the value was located. No approximate regions, ever.

### Leader line
A 1px curve in the theme's Ledger Blue (`accent`, so it holds on the dark desk) from the focused row to its box, ending in a 2.5px dot; at rest the total's leader shows at 40%. It ends at the box, or at the right edge of a right-hand tag, and carries a 3px `bg` casing so it reads over the paper in dark and over a dark photograph in light. It fades in 120ms after the camera and the page have settled, and it leaves at once: it is never on screen while the page or the camera moves. Laptop only.

### Candidates
Full-width outlined buttons (44px min, 6px radius), a two-column grid: the key hint spans both lines; the value in Value type stays on one line (ellipsis if it must); the printed label sits beneath in Micro and may wrap. `Enter` takes 1.

### Key hints
Micro text in a 1px Outline rounded rectangle (4px radius), never filled. Hidden on touch devices, except the numbers on candidates, which also label the crops.

### Toast
Ink fill, Desk text, 8px radius, 6 seconds: "Confirmed B-431" and an outlined "Undo" button with no key hint (44px tall on phone). Its Undo is bound to its own bill: it reopens that bill and leaves the current one alone. On laptop it sits at the bottom centre of the document pane; on phone in space the pinned footer makes for it, above the primary. It never covers the primary button or a candidate. It appears at once, waits while hovered or focused, and its Undo ring is drawn in `bg`. Its text is also sent to the live region.

### Top bar
48px, hairline below: back (a link to the bill list; disabled in the prototype, hidden on phone), "1 of 5", one mark per bill (hollow circle to review, diamond has stops, filled circle confirmed; current on `accent-bg`; 26×36, 36×44 on phone), References right-aligned, `?` for keys (28px circle with a 44px hit area on phone).

### Keys dialog
A native modal dialog: Sheet fill, hairline, 10px radius, Paper shadow, 460px, scrim `rgba(20,20,19,.45)`. Title in Title type, a small "Close Esc" button, then key hints against plain descriptions. Focus is held inside; on close it returns to the current stop. Under the list, a "Single-key shortcuts" switch (R3-16).

### No-text caption
When a page has no text layer, a full-width strip under the page (Sheet, hairline above, Micro, centred): "No text layer for handwriting · only the printed heading could be boxed". The page is fitted above it; in Point to it mode an Ink strip replaces it with the instruction.

### Status
One line of Micro above the primary button ("2 to check first", "Marked on the page. The value stays as read."). On a confirmed bill it carries "Undo confirm" at its right; one undo per bill until the bill is on a submitted Claim. A single value is corrected by editing it; `Cmd+Z` steps back one named entry ("Undone: date edit, B-431"). **Standing for every confirm screen** (matches, merges and any later one): one "Undo <action>" on the status line above the primary, and `Cmd+Z` steps back one named entry. Owner, 21 Nov 2026: "yes to both". The same text and each toast go to a single polite live region that is never rebuilt. A status is cleared by the next action and is announced every time, even when its words repeat; opening a bill announces "Bill B-432, 1 to check" (R3-8).

### Motion
Hover, tint and glyph changes 120ms ease-out. Camera 240ms `cubic-bezier(.2,.8,.2,1)`. Confirm 180ms ease-out. Bill change: the new page rises 8px from 40% opacity in 160ms ease-out, so the pane is never blank; the phone column rises 40px in 240ms. The entry does not disturb the page's own rotation. Nothing loops or bounces. Under `prefers-reduced-motion` animations and transitions are removed, not shortened, so no first frame of an entrance is ever painted (R3-7).

## Do's and Don'ts

### Do:
- **Do** give every state a glyph and two or three plain words: "On the page", "Check this", "Not found on page", "Nothing read", "Differs from Payment", "Confirmed".
- **Do** show absence as an absence: the hatched slot, the camera at fit, no box.
- **Do** keep a total's disagreement with the Payment visible in glyph and words after the value is confirmed: on the evidence line, on the primary button, in the field's accessible name and on the end screen (R3-9). A confirmed date far from the Payment keeps its Brick line on the row.
- **Do** make every control do what its label says from key, click and tap alike.
- **Do** keep every tag beside the value it names, and every floating layer off the primary button.
- **Do** make the primary button's label the literal next action with its value.
- **Do** keep the document light in both themes and the box colours fixed.
- **Do** right-align amounts in columns and the read total with the strip above it; left-align the hero only when the slot is hatched or the bill has no text layer.

### Don't:
- **Don't** say "confidence", "AI", "verified" or show a percentage.
- **Don't** draw a box, crop or leader for a value that was not located, or shade a box to mean "less sure".
- **Don't** add green, a second accent, a second shadow, or a filled key hint.
- **Don't** colour a value by its state, or carry any state by colour alone.
- **Don't** set anything but the total in Hero type.
- **Don't** let a tag or label sit on top of printed text the Claimant has to read.
- **Don't** say "differs from the document" where there is no text layer under the field, or box a typed amount on a number that is not an amount.
- **Don't** draw focus twice: one ring, no side bar.
- **Don't** leave a leader, a status or a toast on screen after the thing it speaks of has changed.
