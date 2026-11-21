# Bill review, variant R: review and ranked fix list

Target: `prototypes/bill-review/index.html?variant=R` (laptop = `makeA({strip:true})`, phone = `makeB()`, shared store). Design: `design.md` in this folder. All data fictional.

This is refinement. **Do not change:** the layout (page left, rail right, proof strip over the 56px total), the stop-to-stop `Enter` flow and its button labels, the key map, the six field states and their glyphs, the camera, the leader line, Point to it, candidates on `1`/`2`, Undo, the tokens in design.md 4.3, the copy in design.md 4.7.

## How it was reviewed

- Rendered at 1440×900 and 390×844, light and dark. Walked all five bills on laptop: `Enter` on B-431, `2` then `Cmd+Z` then `Enter` on B-432's date, `L` and a dragged rectangle then `E` on B-433, `Enter` on B-434, `1` on B-435, the end screen, `Cmd+Z`, `K`, `?`. Phone: B-431, B-432, B-433, B-435 and the whole-bill overlay.
- impeccable detector, web-design-guidelines over R's code paths, contrast computed for every text/tint pair, tab order and target sizes measured in the page.
- Degraded run: single context (this agent cannot spawn the two isolated critique assessors).

## Verdict

The idea holds up on screen. A clean bill really is one glance (printed digits over read digits) and one key; a doubtful one stops exactly where it should; the handwritten bill shows an honest empty slot. Nothing blocks use (no P0). What separates it from "posh" is consistency: values tinted with the state colour, phone stops that lose their tint, labels that collide on the page, and three places where the screen says something it does not know or goes quiet about something it does.

Heuristic score 33/40: status 4, real-world match 4, control and undo 3, consistency 2, error prevention 3, recognition 4, efficiency 4, minimal design 3, error recovery 3, help 3.

Detector: `side-tab` (focused row bar, fix 12), `repeating-stripes-gradient` (the hatched "not found" slot: intentional, it is the picture of absence, keep), `overused-font` Inter (pinned by design.md 4.1, keep).

## Fix list

Line numbers refer to `prototypes/bill-review/index.html` as reviewed. Each item: where, change, why, check.

### P1

**1. Values wear the state colour.**
Where: CSS line 56 (`.s-located{color:var(--accent)}` and siblings). The classes sit on the containers (`.row`, `.A-hero`, `.B-cell`, `.B-hero`, `.B-ven`), so vendor, date, bill number and GSTIN render navy in light and lavender in dark, and `check` values render amber.
Change: scope line 56 to the glyph only: `.g.s-located{color:var(--accent)}.g.s-check{color:var(--warn)}.g.s-unlocated,.g.s-missing{color:var(--ink-3)}.g.s-conflict{color:var(--bad)}.g.s-confirmed{color:var(--ink)}`. Line 68 already colours `.st`.
Why: design.md 4.3 gives values `--ink`; accent is for the located glyph, focus and the primary button. With every value tinted, the rail has no quiet layer and the total is less alone.
Check: computed `color` of `.row .rv` and `.B-vendor` equals `--ink` in both themes; glyphs and state lines keep their colours.

**2. Stops lose their tint on phone.**
Where: `cellHTML` (line 911), B hero (914), `.B-ven` (918); CSS after line 209. No `stop` class is emitted and no `.B-*.stop` rule exists; a focused conflict total at 390px is blue, an unfocused stop has no tint at all.
Change: add `${stop?' stop':''}` to those three class lists. Add CSS: `.B-cell.stop.s-check,.B-hero.stop.s-check{background:var(--warn-bg)}` `.B-cell.stop.s-conflict,.B-hero.stop.s-conflict{background:var(--bad-bg)}` `.B-cell.stop.s-unlocated,.B-cell.stop.s-missing,.B-hero.stop.s-unlocated,.B-hero.stop.s-missing{background:var(--surface-2);box-shadow:inset 0 0 0 1px var(--line)}`, placed after the `.f` rule on line 209 so they win, as lines 93-94 do for rows.
Why: on laptop stops are the only tinted rows; on phone nothing draws the eye to them.
Check at 390: B-433 hero is red-tinted focused and unfocused; B-432 date cell is amber.

**3. "Differs from the document" is claimed where there is no document text.**
Where: `commitEdit` line 686 sets `f.differs=true` whenever `findOnPage` fails, including on B-433 (no text layer) and on a field the Claimant marked with a rectangle.
Change: `f.differs=!(b.noText||f.userBox)`.
Why: the screen must not state a disagreement it cannot know. design.md 6.5 expects "Confirmed · equals Payment" after the total is corrected.
Check: B-433, `E`, type `1180`, `Enter`: evidence reads "Confirmed · equals Payment" (with "placed by you" if a rectangle was drawn). B-431, edit total to `1.00`: still reads "differs from the document".

**4. A confirmed value that disagrees with the Payment goes quiet.**
Where: `stateText` (590-591), `evHTML` (847), `detail` (833), `rowHTML` (846), `primaryInfo` (670). After `Enter` on B-433's ₹1,150.00 the glyph is a tick, the difference is muted text, and the button reads "Confirm bill · ₹1,150.00". On B-432, taking candidate `2` (11 Jun, five months from the Payment) leaves only a tick.
Change:
- `stateText`: for the total, stop appending the `diff` text (keep "equals Payment"). For a confirmed date with `dayDiff(f.value,b.payment.date)>10`, append `` `${Math.round(dayDiff(...))} days from Payment` ``.
- `evHTML`: when the total is confirmed and `payRel(b).k==='diff'`, add a second `.ev` line: `glyph('conflict')` plus `<span class="st s-conflict" style="font-size:14px;line-height:20px">` with `payRel(b).t`.
- `detail`: use class `s-conflict` for the state line when `f.confirmed&&conflict(b,k)`. `rowHTML`: also render `.r2` when `f.confirmed&&conflict(b,k)`.
- `primaryInfo` last line: when `payRel(b).k==='diff'`, label `` `Confirm bill · ${inr(...)} · differs from Payment` ``.
Why: confirming is the Claimant's right, but the second witness still disagrees and the screen should keep saying so, in glyph and words, until the bill leaves. Not a new stop; no extra key.
Check: B-433 `Enter`, `Enter`: tick line, then a red `≠ Payment ₹1,180.00 · ₹30.00 less` line; button ends "differs from Payment". B-432 press `2`: date row keeps its second line "Confirmed · 148 days from Payment" in `--bad`.

**5. Tags on the page collide and cover printed text.**
Where: CSS 134-138; `boxesFor` line 610. On B-435 the tag "1 · Invoice #" sits on top of candidate 2's value, 2.4% above it. After `1`, the tick tag covers the Reference Number.
Change: candidate tag text becomes the number only (`x.n.join('/')`, matching keys `1`/`2`; the printed label is already on the page beside it). For `.bx.cd .tag,.bx.conf .tag,.bx.you .tag`: `left:calc(100% + 4px*var(--zi,1));bottom:auto;top:50%;transform:translateY(-50%) scale(var(--zi,1));transform-origin:0 50%`. `TOTAL` and focused field-name tags stay above-left.
Why: the candidates are the one place the Claimant must read two printed values; nothing may sit on them.
Check at 1440, B-435: both dashed boxes fully legible with `1` and `2` to their right; after `1` the tick sits right of the invoice number.

**6. Crops scale by width only, repeat tags, and show both candidates.**
Where: `layoutCrop` line 543; `Paper.slot` line 523; CSS 160-162. A short union (B-432 "Bill No. 1482", the dragged rectangle on B-433) is magnified until the box's top and bottom leave the frame: two stray vertical lines and a cut word ("otal"). Small crops clip the tag. Each candidate crop draws every candidate's box.
Change: in `layoutCrop`, `const T=y0*PH/100-pad*.6,B=y1*PH/100+pad*.6; const k=Math.min(fw/(R-L),fh/(B-T));`. In `Paper.slot`, when `o.cand!=null` keep only boxes whose `rect.join()===box.join()`. CSS: `.crop .bx:not(.total) .tag{display:none}`.
Why: the crop is the evidence; a broken frame reads as a rendering fault.
Check at 390: B-432 Bill No. crop shows 1482 inside a complete box; B-435 crops show one dashed box each, no orange fragments. At 1440: B-433 after a drag, the strip shows "Total 1180/-" whole.

**7. The phone candidate cell says the choice three times.**
Where: `cellHTML` line 909. Per-candidate crops with captions, then the value, the hint, then the candidate buttons. For the ambiguous date both crops are the same image.
Change: group candidates by `box.join()` (as `boxesFor` 609 does). One crop per distinct box; `.B-cs` gets `grid-template-columns:repeat(<groups>,1fr)`. Caption only when there are two or more groups: `<span class="kh">n</span>` plus the printed label `c.pl`.
Check at 390: B-432 date = one full-width crop then two buttons; B-435 = two crops captioned "1 Invoice #", "2 Reference Number".

**8. Candidate buttons break mid-token.**
Where: `.cand` lines 70-73. At 1440, B-435: "ORS-2611-/0419" and "printed as “Invoice/#”".
Change: `.cand{display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:10px;align-items:center}` `.cand .kh{grid-row:1/3}` `.cand b{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}` `.cand em{grid-column:2}`.
Check: value on line one, "printed as …" on line two, at rail widths 360 and 440 and at 390.

**9. Help dialog, toast and status are not announced or contained.**
Where: `renderHelp` 1114, `renderToast` 1110, `footHTML` 853. With help open, `document.activeElement` is still the primary button; Tab walks the page under the scrim; there is no close control. The toast has no live role. `.stat[role=status]` is destroyed and rebuilt on every render.
Change: make `#help` a native `<dialog>` opened with `showModal()` and closed with `close()`; add a "Close" button with an `Esc` hint; on close call `syncDomFocus`. Add one persistent `<div id="live" class="sr" role="status" aria-live="polite">` in `<body>`; in `render()` write `S.status` or the toast text into it when it changes; remove `role="status"` from `.stat`. Add `.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}`.
Check: `?`, Tab stays inside the dialog, `Esc` returns focus to the primary. VoiceOver speaks "Confirmed B-431" and "2 to check first".

**10. Rows have names but no roles; boxes double the tab order.**
Where: lines 844, 877, 911, 914, 918 (`div`/`section` with `tabindex` and `aria-label`, no role); `syncBoxes` 618 (`tabIndex=0`). Measured order on B-432: 5 marks, `?`, 4 boxes, page button, vendor, hero, hero button, date, 2 candidates, 2 rows, primary: 20 stops.
Change: add `role="group"` to rows, cells and both heroes, with `aria-label` = name, value (or "nothing read"), state. Boxes: `tabIndex=-1` always (hover and click unchanged; rows are the keyboard path). `.A-main` becomes `<main>`; add a visually hidden `<h1>` in the bar: "Review bill B-431"; `‹ Bills` becomes a `<button class="lnk bk">`. Glyph SVGs inside a row: `aria-hidden="true"` (the row label already carries the state).
Check: Tab from `?` lands on the vendor row; the accessibility tree lists five named groups.

### P2

**11. The rail has two left edges.** `.seg`, `.tally` and the Payment line sit at 24px; vendor, hero and rows sit at 36px. Change: `.seg,.tally{padding:0 12px}`; replace the inline style in `payHTML` (821) with class `pay` and `.pay{margin-top:16px;padding:0 12px}`. Check at 1440: every text line in the rail starts at x=1037.

**12. Focus is drawn twice.** `.row.f`, `.A-hero.f` (lines 91-92, 177) add an inset 2px left bar; keyboard focus adds the ring as well. Change: delete the inset bars. Add `.row.f,.A-hero.f,.B-cell.f,.B-hero.f{outline:2px solid var(--accent);outline-offset:-2px}` so focus looks the same from mouse and keyboard; keep the tint. Check: one ring, no bar, in every state.

**13. Leader line invisible in dark.** `.A-lead path,circle` (184-186) use `--box-accent` (#2B3A8C on #141413 = 1.8:1). Change: `stroke:var(--accent)`, `fill:var(--accent)`. Light is unchanged (same hex). Check dark 1440: line visible from rail to paper.

**14. Contrast on tints.** Dark `--ink-3` labels on `--accent-bg`, `--warn-bg`, `--bad-bg` measure 4.1, 3.9, 4.4:1 (light 4.5, borderline at 11px). Candidate tag: white on #B26A00 = 4.2:1. Change: `.row.f .rl,.row.h .rl,.row.stop .rl{color:var(--ink-2)}`; new paper token `--box-warn-ink:#8F5500` and `.bx.cd .tag{background:var(--box-warn-ink)}` (6.1:1; the dashed border stays `--box-warn`). Check: all pairs ≥ 4.5:1.

**15. The hero cannot hold a large amount.** ₹1,18,00,01,180.00 ran off a 440px rail; ₹12,34,567.00 will at 360px. Change: `.A-hero,.B-hero{container-type:inline-size}`; `heroValHTML` sets `style="--n:${inr(f.value).length}"` on the button; `.hero{font-size:min(56px,calc(175cqi/var(--n,8)))}`, phone `min(44px,…)`; same on `input.ed.big`. Check: set B-431's total to `123456700` paise in the console: one line at rail 360 and at 390.

**16. A `check` row's headline contradicts `Enter`.** B-435's row shows the reader's pick `8830015527` while the button says "Take 1 · ORS-2611-0419". Change in `valHTML` (826): when `f.candidates&&!f.confirmed`, return `<span class="none">Choose 1 or 2</span>` (list the numbers for three). Check: B-432 date and B-435 bill number rows read "Choose 1 or 2"; hint and buttons unchanged.

**17. Touch targets under 44px on phone.** From the CSS (not device-tested): `.mk` 26×36, `.q` 28×28, `.seg button` 28 high, `.lnk` 20 high, `.pages button` 22 high, toast Undo 30 high. Change inside `@media (max-width:719px)`: `.mk{width:36px;height:44px}`; `.q{position:relative}` `.q::after{content:"";position:absolute;inset:-8px}`; `.seg button,.pages button,#toast button{min-height:44px}`; `.lnk{min-height:44px}`; `.acts{gap:0 24px;margin-top:0}`. Check: hit areas ≥ 44×44.

**18. The "No text layer" chip covers the page on phone.** It wraps to two lines inside a pill and hides the printed heading and its box. Change `.vw-chip` to a caption strip: `left:0;right:0;top:auto;bottom:0;max-width:none;border:0;border-top:1px solid var(--line);border-radius:0;padding:6px 12px;text-align:center`. In `Viewer.layout` (741) subtract 32 from `hh` when the chip is shown; `.pages{bottom:44px}` in that case. Check at 390 and 1440, B-433: whole page visible, caption under it; locate caption still replaces it.

**19. The page can be dragged out of the pane.** `Viewer.move` (775) adds to `tx/ty` unbounded. Change in `apply()`: clamp `tx` to `[hw*.25-pw*s, hw*.75]` and `ty` to `[hh*.25-ph_*s, hh*.75]`. Check: drag hard in any direction; a quarter of the page always remains; `Esc` still fits.

**20. Bill change blanks the paper.** `@keyframes rise` (151) starts at `opacity:0`, so every `Enter` removes the document for a moment. Change: `from{opacity:.4;transform:translateY(8px)}`, 160ms. Check: paging with `J` never shows an empty pane.

### P3

**21.** Key hints on touch devices: `@media (hover:none) and (pointer:coarse){.kh{display:none}.cand .kh,.B-cn .kh{display:inline-block}}`.
**22.** Phone order and alignment: left-align the vendor (`.B-ven{text-align:left}` `.B-ven .vv{justify-content:flex-start}`); in `colHTML` (925) move `tallyHTML(b)` to directly after the hero, as on laptop.
**23.** `text-wrap:pretty` on `.ev`, `.st`, `.hint` (orphan "page" on B-433).
**24.** Help list: hide rows for other variants ("Whole bill (B)" on laptop, "Select a row (D)", "Prototype") when `vkey==='R'`.
**25.** Editors: add `name` and `spellcheck="false"` to the bill number, vendor and GSTIN inputs (825); `autocapitalize="characters"` on GSTIN.
**26.** `overscroll-behavior:contain` on `.A-scroll`, `.B-scroll`, `#help .card`. Add `<meta name="theme-color">` for both schemes (#F6F4EF, #141413).
**27.** The URL keeps the variant but not the bill: write `?bill=B-433` in `openBill` with `history.replaceState` and read it at boot.
**28.** Boot shows an empty screen until fonts load (up to 2.5s; `calibrate` waits on `requestAnimationFrame`, which never fires in a background tab). Prototype scaffolding only; in the real build render the rail from data at once and never gate first paint on fonts.

## Carry into the real build

- Field colour belongs to glyphs and state lines, never to values (fix 1).
- A field that is confirmed can still disagree with the Payment; "confirmed" and "differs" are two facts, shown as two (fix 4).
- "Differs from the document" needs a text layer under the field (fix 3).
- The crop needs both a width and a height fit (fix 6).

---

# Round 2 (re-review after the builder's pass, 2026-11-21)

Reviewed as built: 1440×900 and 390×844, light and dark, plus 1024 and 760 wide; all five bills by keyboard (`Enter`, `2`, `Cmd+Z`, `L` + drag, `E`, `1`, `Cmd+Enter`, `J`/`K`, `?`, `Tab`, `Esc`) and by tap on phone. Positions, colours, contrast, tab order and target sizes were measured in the page. The preview pane was in the background, so animations were judged from the code and from settled states, not watched.

## Round 1 fixes

All 28 are in. 27 pass their checks; 28 (font gate) is hardened and stays as prototype scaffolding. Four fixes carry a side effect, listed below: 3 (R2-9), 4 (R2-6, R2-7), 5 (R2-4), 13 (R2-5).

Deviations, all accepted:
- `--box-warn-ink #8F5500`: white on it is 6.1:1. Now in DESIGN.md.
- `‹ Bills` disabled: right for a prototype with no list. In the build it is a link to the bill list.
- Focus returns to the current stop when help closes: right for a keyboard-first screen.
- `p.N` buttons out of tab order: the "Invoice 1 of 2" segments are the keyboard path. A lone `p.1` does nothing; make it a `<span>` (P3).
- Phone marks 36×44: meets WCAG 2.2 AA (24px minimum).

Heuristic score 35/40 (consistency 2 to 3, minimal design 3 to 4). Contrast: every token pair is 4.5:1 or better in both themes; values are `--ink` everywhere.

## Round 2 fix list

Line numbers refer to `prototypes/bill-review/index.html` as it stands now.

### P1

**R2-1. The toast covers the primary button.**
Where: CSS 321; `renderToast` 1143. At 390 the toast (x 98 to 293, y 712 to 772) sits on the pinned button (y 716 to 772) for six seconds after every confirm: the label that says what the next tap does is hidden, and "Undo" lies where the thumb lands. At 760 wide it covers the button's left 66px. The text wraps as "Confirmed B- / 431 ·".
Change:
- CSS, replacing the `left` and `max-width` in 321: `#toast{left:calc((100vw - clamp(360px,38vw,440px))/2);max-width:calc(100vw - clamp(360px,38vw,440px) - 24px)}` `#toast span{white-space:nowrap}` `@media (max-width:719px){#toast{left:50%;max-width:calc(100% - 24px);bottom:calc(168px + env(safe-area-inset-bottom))}}` (168 = 64 switcher + 96 pinned footer + 8 gap).
- 1143: `<span>${esc(t.text)}</span>` (drop the trailing " · "; the flex gap separates).
Why: nothing may sit on the one control that moves the work forward.
Check: at 390, `toast.bottom <= primary.top - 8` and the text is one line; at 760 and 1024, `toast.right < rail.left`; 1440 looks as before.

**R2-2. `Enter` on "Point to it" confirms the total instead.**
Where: `Paper.hatch` 551-556 (`div role="button" tabindex="0"`); global keys 1198. On B-433, `Tab` from the total lands on "Not found on the page · Point to it". `Enter` there confirms ₹1,150.00, which differs from the Payment; `Space` does nothing.
Change:
- 552: `const fr=document.createElement(noLoc?'div':'button');` and for the button `fr.type='button';fr.setAttribute('aria-label','Point to the '+NAMEL[k]+' on the page')`. Delete the `role` and `tabIndex` assignments in 553. 554: `th.setAttribute('aria-hidden','true')`.
- CSS 171: add `width:100%;font-family:inherit`.
- 1198: both `closest('button,a')` become `closest('button,a,[role="button"]')`.
Why: a control must do what its name says, and this one sits next to a one-key confirm of a mismatch.
Check: B-433, `Tab` to the slot, `Enter`: the caption "Drag around the total…" appears and the total is still unconfirmed; `Space` does the same; click unchanged; phone cells unchanged.

**R2-3. The leader misses its box when a bill opens.**
Where: `@keyframes rise` 158, `slidein` 160; `draw` 914. The leader is drawn 30ms after a bill opens, while the page is still rising, and is not drawn again. Measured after `J`: 8px low on B-434, 18px low on B-435 (below the candidate box), 33px low and 11px right on B-432. The keyframes also replace the page's own `rotate()`, so B-432 arrives straight and snaps crooked.
Change:
- 158: `@keyframes rise{from{opacity:.4;translate:0 8px}to{opacity:1;translate:0 0}}`. 160: `@keyframes slidein{from{opacity:0;translate:48px 0}to{opacity:1;translate:0 0}}`.
- First line of `draw()`: `if(vw.page&&vw.page.getAnimations().some(a=>a.playState==='running')){tm=setTimeout(draw,50);return}`.
Why: the leader is the signature; it must land where the evidence is, most of all on the bills that stop.
Check: open each bill with `J`, wait a second: the dot is on the focused box's right-centre within 1px (B-432 date, B-435 bill number, B-434 total). B-432 does not jolt.

### P2

**R2-4. The leader runs through the tag (from fix 5).** Tags now sit right of the box, where the leader arrives. In `draw()` after `br`: `const tg=be.matches('.cd,.conf,.you')&&be.querySelector('.tag'),tr=tg&&tg.getBoundingClientRect();` and use `(tr?tr.right:br.right)` for `bx`. Check: B-432 date, the dot sits right of "1/2"; B-435 after `1`, right of the tick.

**R2-5. The leader is faint over the paper in dark (from fix 13).** Lavender on cream is about 1.7:1. Line 918: emit the path twice, `<path class="case" d="…"/>` first. CSS: `.A-lead path.case{stroke:var(--bg);stroke-width:3px}`. Check dark 1440, B-432 date: the line reads across paper and desk; light is unchanged to the eye.

**R2-6. The primary label wraps inside a 44px button (from fix 4).** At rail widths under about 420px "Confirm bill · ₹1,150.00 · differs from Payment" takes two lines with 2px to spare. `primaryInfo` 697: `' · ≠ Payment'`. CSS: `.btn.wide{height:auto;min-height:44px;padding-block:6px}` `.btn.wide>span:first-child{text-wrap:balance}`; on phone `.btn.pri.wide{height:auto;min-height:56px}`. Check at 760 wide, B-433 confirmed as read: one line. With a total of 12,34,56,789.50: two even lines, the button grows.

**R2-7. The disagreement is missing from the accessible name (from fix 4).** After confirm the group reads "Total, ₹1,150.00, Confirmed". `groupLabel` 871: append `` (f.confirmed&&k==='total'&&conflict(b,k)?', '+payRel(b).t.replace('≠','differs from'):'') ``. Check: B-433 `Enter`: label ends "differs from Payment ₹1,180.00 · ₹30.00 less".

**R2-8. Every crop reads the whole page to a screen reader.** The crop is a clone of the page, so the total group contains the full invoice text, and each phone cell repeats it. `Paper.slot` 545: `cin.setAttribute('aria-hidden','true');fr.setAttribute('role','img');fr.setAttribute('aria-label',NAMES[k]+' as printed on the page')`. Check: the accessibility tree under the total group holds the crop name, the total and its evidence line, nothing else.

**R2-9. A typed total can be "found" on a quantity or a row number (limits fix 3).** B-431, total edited to 1.00: the row number "1" gets a confirmed box and the line reads "Confirmed" with no "differs from the document". `findOnPage` 703: `if(k==='total')ok=/[.₹]|\/-|Rs/.test(it.t)&&parseMoney(it.t)===v;`. Check: 1.00 gives "Confirmed · differs from the document" and no box; 18,643.42 is still found.

**R2-10. "Not found on page" stays after the Claimant marks the place.** B-433, `L`, drag: a "you" box is drawn and the line still ends "not found on page". In `stateText` 619 and `evText` 625 use `f.userBox?'marked by you':` before the `unlocated` wording; in `stateText`, `if(ds==='unlocated'&&f.userBox)return 'Marked by you'`. Check: the hero line ends "· marked by you"; a marked date row reads "Marked by you".

**R2-11. The phone's whole-bill overlay does not hold focus.** Focus stays on the cell underneath and `Tab` walks 18 hidden controls. In `makeB.update`, before `Fx.after(root)`: `scroll.inert=$('.bar',root).inert=$('.B-pin',root).inert=!!S.viewOpen;` and after 975: `if(S.viewOpen&&!ovl.contains(document.activeElement))$('.B-ovl-top .btn',root).focus()`. Phone CSS: `.B-ovl-top .btn{height:44px}`. Check: open the overlay, `Tab` stays on Close; closing returns focus to the cell.

### P3

- `doUndo` 660 sets "Undone" after the render, so it shows only on the next one: `emit('change')` after setting it.
- Tally wraps as "… · / equals Payment": `.tally small{display:inline-block}`.
- A lone `p.1` (825) is a button that does nothing: render a `<span>` when the file has one page.
- Total and date editors (850-851) have no `name`.
- "Next · B-434" on phone is at 30% opacity (228): keep the crop faint, set the label to `--ink-2` at full opacity.
- On phone, B-433's total is right-aligned with nothing printed above it: left-align `.B-read` when the bill has no text layer.
- `touch-action:manipulation` on `.btn,.cand,.mk,.lnk`.

## Carry into the real build (added)

- A toast is placed relative to the document pane or the pinned footer, never the viewport (R2-1).
- Every control that looks like a button is a `<button>`; `Enter` as "next obvious thing" applies only when focus is on a row or the primary (R2-2).
- Draw the leader after the page has stopped moving, and animate the page with properties that do not replace its rotation (R2-3).
- A typed amount is searched only among tokens the reader classed as amounts (R2-9).
- A crop is an image with a name, not a copy of the page text (R2-8).

---

# Round 3 (re-review after the builder's Round 2 pass, 2026-11-21)

## How it was reviewed

- Capture (sonnet agent): the folder served on 127.0.0.1, headless Chrome with real key, mouse and touch input (no calls into the page's own functions), page visible with `requestAnimationFrame` at about 62 per second. All five bills at 1440, 1024, 760 and 390 wide, light and dark; 122 state captures; a full `Tab` walk and key walk per bill; per-frame series for every bill arrival; accessibility trees; Lighthouse; contrast for 186 rendered pairs; target sizes. Evidence: `.impeccable/review/` (`MANIFEST.md` lists each file; not committed).
- Review (opus agents, each in isolation): critique Assessment A, audit with the detector output, web-design-guidelines over R's code paths, an accessibility check against WCAG 2.2 AA, and the motion reviewer over the frame series. The accessibility check worked from trees, walks and source: no live screen reader was run.
- Every item below was then confirmed in a named capture or at the quoted line. Items no capture or line could confirm are listed at the end as unverified.

## What the builder could not check

- **Leader arrival at real timing:** correct. On every arrival that draws a leader (light and dark at 1440, light at 1024, `J` and `K`) the dot lands on its target with the code's own 2px offset and does not move afterwards; the page stops 140 to 235ms after the key, the leader is visible from 206 to 280ms. B-433 draws none, as it should. B-432 keeps its tilt from the first frame. One fault found: R3-6.
- **Leader casing in light (R2-5):** accepted. Over cream or white paper it is 1.1:1, invisible without magnification. Over the dark desk in B-432's photo it is what makes the navy line readable. It cuts a pale edge through printed text in one place only (B-435, GSTIN focused).
- **Toast at 1024:** clear of the rail and the primary at 1440, 1024, 800, 760 and 720; one line. On phone it has a new fault: R3-5.
- **Point to it by a real drag (R2-10):** the line ends "· marked by you", the strip shows the marked place, the status reads "Marked on the page. The value stays as read." After the total is then edited the line says "placed by you": R3-20.

## Round 2 fixes

R2-1 and R2-3 to R2-11 are present and pass their checks. R2-2 is half done: the slot is a real button and `Enter` on it starts Point to it, but it has no focus ring (R3-2). The P3 follow-ups are in; the phone left-alignment on B-433 reached the value but not its evidence line (P3 below).

Heuristic score 29/40 (status 3, real-world match 3, control 3, consistency 2, error prevention 2, recognition 3, efficiency 4, minimal design 3, error recovery 3, help 3). The drop from 35 is not regression in the look: this round used a real pointer and widths the earlier rounds did not, and the faults sit there. The keyboard path at 1440 remains the best thing in the product. Audit 13/20 (accessibility 2, performance 3, theming 3, responsive 2, anti-patterns 3). Detector: one real finding (10px labels on phone, P3); the rest are the mock handwriting font, the paper's own colours, the hatched slot and Inter, all intentional.

## Round 3 fix list

Line numbers refer to `prototypes/bill-review/index.html` as it stands now. This is still refinement: nothing below changes the layout, the flow, the key map, the states, the tokens or the copy rules.

### P0

**R3-1. A click or tap on the primary button does nothing while a field holds focus.**
Where: the `focusin` handler 1198; `update` 935 and the phone `update` (bar, rail and footer are rebuilt with `innerHTML` on every focus change); `footHTML` 892 (the primary is `.ft[data-key="confirm"]`).
Seen: `states/notes_primaryclick.json`, `states/B-433_clickPrimary1_390_light.png`. Mouse down focuses the button, `focusin` sets the focus to `confirm`, the footer is rebuilt under the pointer, and no click event fires. The label changes from "Confirm total · ₹1,150.00" to "Check total"; a second click sends focus back to the field. Same by touch at 390, where the primary is the main control: B-433's total cannot be confirmed by tapping. Same by `Tab` then `Enter` (`a11y/taborder_B-433.txt`, stop 14). Same cause: the first click on "Edit", "Point to it" or a candidate inside a row that is not focused, and the first tap on a phone crop, are lost.
Change:
- Before 1198: `let viaPtr=false;addEventListener('pointerdown',()=>{viaPtr=true},true);addEventListener('keydown',()=>{viaPtr=false},true);`
- 1198: `document.addEventListener('focusin',e=>{if(viaPtr)return;const ft=e.target.closest?.('.ft[data-key]');if(ft&&ft.dataset.key!=='confirm'&&ft.dataset.key!==S.focus&&!e.target.closest('.proto'))setFocus(ft.dataset.key)});` The click handler already moves the focus for a click on a row (1196) and each action resolves its own field (1181).
- One ring: `#vroot:has(.btn.pri:focus-visible) .ft.f{outline-color:transparent}` (the tint stays on the field the button will act on).
Why: the button's label is the promise the whole flow rests on. It must do what it says from mouse, touch and `Tab`, not only from `Enter` on a row.
Check with real input, not `el.click()`: B-433 at 1440, click the primary: the total reads "Confirmed" with the `≠ Payment` line and the button reads "Confirm date · 13 Nov 2026". B-432: one click takes 6 Nov. Same by tap at 390. `Tab` to the primary on B-433: the label stays "Confirm total · ₹1,150.00" and `Enter` confirms. On B-433 with the total focused, one click on "Edit" in the date row opens its editor. First tap on a phone crop opens the whole bill.

### P1

**R3-2. The "Point to it" slot: no focus ring, a name that is not its words, and on phone no field name (finishes R2-2).**
Where: CSS 174 (`.crop.hatch{…outline:0…}`); `Paper.hatch` 560-562.
Seen: `states/focus_hatched-slot_B-433.png` (computed `outline: none` while `:focus-visible`): focus on the slot looks exactly like focus on the total, where `Enter` confirms a mismatch. Lighthouse flags the name ("Point to the total on the page" against the visible "Not found on the page · Point to it"). `base/B-432_390_light_b.png`: a hatched "Nothing read" over the value "Nothing read", with nothing saying it is the GSTIN, and the 44px slot drops "Point to it" although tapping it starts pointing.
Change:
- 174: delete `outline:0`; add `.crop.hatch:focus-visible{outline:2px solid var(--accent);outline-offset:2px}` and add `.crop.hatch:focus-visible` to the `:has()` list in R3-1.
- 561: delete the `aria-label`. 562: `sp.innerHTML=noLoc?html.replace(/ · .*/,''):h>=60?html+'<span class="sr"> ('+NAMEL[k]+')</span>':'<b>'+NAMES[k]+'</b> · <u>Point to it</u>';`
Check: B-433 at 1440, `Tab` from the total: a ring on the slot, none on the hero. Name: "Not found on the page · Point to it (total)". At 390, B-432: the slot reads "GSTIN · Point to it" above "Nothing read"; B-433 date: "Date · Point to it" above "13 Nov 2026". The next-bill peek shows no "Point to it".

**R3-3. `Enter` while pointing confirms the total.**
Where: `doPrimary` 686; `primaryInfo` 694; `setFocus` 673.
Seen: `states/B-433_locate_1440_light.png`, `a11y/keys_walk.txt`: with the caption "Drag around the total to mark it" up, the primary still reads "Confirm total · ₹1,150.00 ↵"; `Enter` confirms the value that differs from the Payment, moves to the date and leaves pointing mode on for the total.
Change: first line of `primaryInfo`: `if(S.locating)return{label:'Cancel pointing'};`. First line of `doPrimary`: `if(S.locating){endLocate();return}`. In `setFocus`, after the guard: `S.locating=null;`.
Why: a mode with its own caption must not keep a one-key confirm of a mismatch underneath it.
Check: B-433, `L`: the button reads "Cancel pointing". `Enter`: the caption goes, nothing is confirmed, focus is on the total. `L`, then `↓`: pointing mode ends.

**R3-4. The stop Dues asks about can sit under the pinned footer.**
Where: `syncDomFocus` 905 (`focus({preventScroll:true})`); CSS 185, 208.
Seen: `base/B-435_1024_light.png`, `base/B-435_760_light.png`: the bill number stop is focused, "Take 1 · ORS-2611-0419" is on the button, and both candidate buttons are below the fold with the hint cut through by the footer's hairline. At 1440×900 the GSTIN and Payment line are cut the same way.
Change: 905, after `t.focus({preventScroll:true})`: `t.scrollIntoView({block:'nearest'});`. CSS: `.A-scroll{scroll-padding-block:16px}` `.B-scroll{scroll-padding:16px 0 24px}`.
Check: 1024×768 and 760×900, reach B-435 with `J`: the whole stop, both candidates included, is above the footer. `↓` to GSTIN at 1440×900: the row is fully visible.

### P2

**R3-5. Toast: covers a candidate on small phones, times out under the pointer, and its ring cannot be seen.**
Where: CSS 327-330; `renderToast` 1153-1156.
Seen: `states/toast_360.png` (360×800: the toast lies on candidate 2, "11 Jun 2026", for six seconds, Undo where the thumb would tap); `states/toast_390.png` (Undo wraps to two lines when the key hint shows); the Undo ring is `accent` on `ink`, 1.7:1; the timer hides the toast while Undo holds focus and focus falls to `<body>`.
Change:
- `renderToast`: `document.body.classList.toggle('toast-on',!!t&&!S.done)` and treat `S.done` as no toast (the end screen has its own Undo). Replace the anonymous timeout with `const hide=()=>{if(el.matches(':hover')||el.contains(document.activeElement)){toastT=setTimeout(hide,2000);return}S.toast=null;el.hidden=true;document.body.classList.remove('toast-on')};clearTimeout(toastT);toastT=setTimeout(hide,6000)`. Hint: `/Mac|iP/.test(navigator.platform)?'⌘Z':'Ctrl Z'`.
- CSS: `#toast button{white-space:nowrap}` `#toast button:focus-visible{outline-color:var(--bg)}` and inside the phone block `body.toast-on .B-pin{padding-top:70px}`, so the toast sits in space the footer makes for it instead of over the column. This keeps R2-1's assumption of a 96px footer; if the footer is taller (a two-line primary), set the toast's `bottom` from the footer's measured top. In the build the toast is a row of the pinned footer.
Check: 360×800 and 390×844, confirm B-431: `toast.top >= pin.top`, nothing in the column is covered, Undo is one line. `Tab` to Undo and wait ten seconds: still there, ring visible.

**R3-6. The old leader fades out where it was, over the new page.**
Where: CSS 193-194; `draw` 923, 928.
Seen: `motion/billchange/normal/report.json` (old dot at 729, 493 with opacity 1.0, 0.58, 0.26 at 12, 43, 76ms while B-432 is already shown), `motion/camera/normal/frame-02.png` (a line ending in empty space during the pan), `motion/leader_B-433_light.json` (B-432's leader drawn over a bill that has no box, for up to 180ms).
Change: 193: `transition:none`. 194: `.A-lead.on{opacity:1;transition:opacity 120ms ease-out}`. 928: replace `requestAnimationFrame(()=>svg.classList.add('on'))` with `svg.getBoundingClientRect();svg.classList.add('on')`.
Why: the leader may only ever point at where the evidence is. It leaves at once and arrives with a fade.
Check: sample the leader's opacity each frame after `J` and after `↓`: 0 on the first frame after the key; no line in any frame while the page or camera moves.

**R3-7. Reduced motion paints the first frame of each entrance.**
Where: CSS 358-360; 208.
Seen: `motion/phone-billchange/reduced/frame-01.png` (the column 40px low at 30% opacity for a frame), `motion/billchange/reduced/report.json` (8px, 40% at 17ms).
Change: 359: `*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}`.
Check: with reduced motion on, no sampled frame after `J`, `Enter` or a tap has a translate or an opacity under 1.

**R3-8. The status line goes stale and the live region stays silent.**
Where: `renderLive` 1163; `pick` 727, `notOnBill` 725, `commitEdit` 715, `confirmField` 676, `cancelEdit`, `openBill` 671.
Seen: `a11y/keys_walk.txt`, `a11y/live_region.json`: after `Cmd+Z` then `2` the visible status and the live region still say "Undone"; a second "Undone" is not announced (same text is skipped); nothing is announced after a pick, `N`, a saved edit or a bill change; "Marked on the page…" survives a cancelled edit.
Change: set `S.status=''` at the top of `pick`, `notOnBill`, `commitEdit`, `confirmField` and `cancelEdit`. Count messages: `S.statusN=(S.statusN||0)+1` wherever `S.status` is set to a non-empty string, and in `renderLive` compare `m+'|'+S.statusN` instead of `m`. In `openBill` set `` S.arrive=`Bill ${b.ref}, ${stops(b).length?stops(b).length+' to check':'ready to confirm'}` `` and clear it wherever `S.status` is cleared; `renderLive` speaks `[S.status||(S.toast&&S.toast.text),S.arrive].filter(Boolean).join('. ')`. `S.arrive` is never shown in `.stat`.
Check: undo, `2`, undo: "Undone" is spoken twice and never shown after the pick. `J`: "Bill B-432, 1 to check". `Enter` on B-431: "Confirmed B-431. Bill B-432, 1 to check".

**R3-9. The end screen: focus is lost, the filled button throws the work away, and it is quiet about what was accepted.**
Where: `endHTML` 893; the `S.done` branch near 1148.
Seen: `states/all_end_1440_light.png`: `document.activeElement` is `<body>`; "Start over" is the primary; "5 bills are ready for a Claim" although B-433 was confirmed ₹30.00 under its Payment.
Change: `<h1 tabindex="-1">` and focus it after render; write the heading and line to the live region. Buttons: `<button class="btn" data-act="undo">Undo the last change</button>` and `<button class="lnk" data-act="reset">Start over (prototype)</button>`; no filled button until "Build a Claim" exists. When `d=S.bills.filter(b=>b.confirmed&&payRel(b).k==='diff')` is not empty, a second line: `glyph('conflict')` and, in `.st.s-conflict` at 14/20, `` `${d.length} ${d.length===1?'differs from its Payment':'differ from their Payments'}: ${d.map(b=>b.ref+' '+payRel(b).t.split(' · ')[1]).join(', ')}` ``. "1 bill is ready", "5 bills are ready".
Check: walk all five with B-433 confirmed as read: focus on the heading; the line "1 differs from its Payment: B-433 ₹30.00 less" in Brick with its glyph; no filled button.

**R3-10. Crops show blank white beyond the page, and the phone's two candidate crops are too small to compare.**
Where: `layoutCrop` 566-576; `cellHTML` 949; CSS 230.
Seen: `states/B-433_locateTotalDrag_1440_light.png` (a third of the strip is white), `base/B-432_390_light.png` and `_dark` (a white block beside the photo, glaring in dark), `base/B-435_390_light_b.png` (two side-by-side crops, printed digits about 7px tall, each showing both numbers).
Change: in `layoutCrop`, never zoom out past the page's width unless the box needs it, then keep the frame on the page: rename the computed scale `k0`, then `const k=Math.max(k0,Math.min(fw/PW,fh*.9/bh));let tx=fw/2-cx*k,ty=fh/2-cy*k;if(!b.rot){if(PW*k>=fw)tx=clamp(tx,fw-PW*k,0);if(PH*k>=fh)ty=clamp(ty,fh-PH*k,0)}` and use `tx,ty` in the transform. CSS 170: `.crop{background:var(--surface-2)}` (where a tilted photo leaves the frame it shows Sheet Shade, not white). 949: `grid-template-columns:1fr` (one crop per row, its caption under it).
Check: B-433 after a drag at 1440: the strip is page from edge to edge with the whole box in it. B-432 at 390 dark: no white block. B-435 at 390: two stacked crops, one dashed box each, digits at least 11px tall.

**R3-11. A pasted amount is mangled.**
Where: `liveGroup` 894.
Seen in code and by running it: "Rs. 1,180.00" becomes `.1180.00` and then "0.11". The mismatch line would show it, but the Claimant pasted the right number.
Change: `let v=inp.value.replace(/rs\.?|inr|₹|\/-\s*$/gi,'').replace(/[^\d.]/g,'');`
Check: paste "Rs. 1,180.00", "₹1,180/-", "1180": the field shows 1,180.00, 1,180, 1,180.

**R3-12. Point to it: a mark cannot be undone on its own, and on phone the page cannot be zoomed while pointing.**
Where: `finishLocate` 733; `startLocate` 729; `Viewer.move` 806 and `down` 802.
Seen in code: the `text==null` branch sets `f.userBox` without `pushUndo`, so `Cmd+Z` after a mark undoes the previous confirm, possibly on another bill. `move` returns in the `S.locating` branch before the two-pointer branch, and `startLocate` resets the camera to fit, so on a phone the Claimant drags around handwriting about 5px tall.
Change: 733: `pushUndo([b])` before `f.userBox=true`. 729: keep `S.zoomMode` as it is when the camera scale is above 1. In `move`, test `this.ptrs.size===2` first and remove any draft box there; in `down`, when a second pointer lands, set `this.drag.pinch=true` instead of replacing `this.drag`, and in `release` do not finish a locate when `d.pinch`.
Check: confirm B-431, on B-433 mark the total, `Cmd+Z`: the mark goes and B-431 stays confirmed. At 390 in the whole-bill overlay, pinch while pointing: the page zooms and no rectangle is committed.

**R3-13. On phone the handwritten bill's page traps the scroll.**
Where: CSS 151 (`.vw{touch-action:none}`), 212; `Viewer.down` 800.
Seen in code and `base/B-433_390_light.png`: the inline page takes about 390 of the 635px scroll area and a one-finger swipe that starts on it pans the page instead of scrolling the column.
Change: `.B-page.vw:not(.locating){touch-action:pan-y pinch-zoom}`; in `down`: `if(e.pointerType==='touch'&&this.c.s===1&&!S.locating&&this.el.classList.contains('B-page'))return;` (use the viewer's own root reference).
Check on a touch device or with touch emulation: swipe up from the page on B-433: the column scrolls; pinch still zooms.

**R3-14. Small targets off the phone layout.**
Where: CSS 57, 350-356; `detail` 877.
Seen: `measurements.json` C7: "Point to it" and "Edit" are 20px tall on laptop; a field that is not a stop can be edited by pointer only through its 19px value text; the 44px rules apply by width, so a tablet or a phone on its side gets laptop sizes.
Change: `.lnk{min-height:24px}`. 877: `(isStop(b,k)||S.focus===k)&&f.value!=null&&!f.candidates`. Repeat the block at 350-356 under `@media (pointer:coarse)`.
Check: no pointer target under 24px at 1440; on B-431 at 390, tap the date: an "Edit" action appears.

**R3-15. Dimmed text on the page falls under 4.5:1.**
Where: CSS 141, 166.
Seen: C6: the `TOTAL` tag on a dimmed box is 2.0:1 (2.3:1 at 390); the dimmed `p.2` button is 3.3:1 in light.
Change: `.bx.dim .tag{visibility:hidden}` (a tag is readable or absent). `.pages button.dim{opacity:1;color:var(--ink-2);border-color:var(--line)}`.
Check: focus the date on B-431: no tag on the total's box; every text pair in C6 at 4.5:1 or better.

**R3-16. Single-key shortcuts cannot be switched off (WCAG 2.1.4).**
Where: global keys 1202-1224; `renderHelp` 1160.
Change: in the Keys dialog, under the list: `<label class="sk"><input type="checkbox" id="sk" checked> Single-key shortcuts</label>` bound to `S.singleKeys` (default true; the build stores it per Claimant). In the key handler, after the `Enter` and arrow branches: `if(S.singleKeys===false&&k.length===1)return;`. `Enter`, arrows, `Esc`, `Tab` and the `Cmd/Ctrl` keys stay.
Check: untick it: `E`, `L`, `J`, `1` do nothing; `Enter`, `↓`, `Cmd+Z` work; the `?` button still opens the dialog.

**R3-17. The top bar does not fit under 380px or with more bills.**
Where: CSS 105-112.
Seen: `states/toast_360.png`: the `?` button is cut in half at 360. Five marks are all the bar can hold; a sitting is a handful to a few dozen bills.
Change: `.marks{min-width:0;overflow-x:auto;scrollbar-width:none;flex:0 1 auto}` `.bar .ids,.bar .q{flex:none}` `@media (max-width:379px){.bar .ids{display:none}}`; scroll the current mark into view in `barHTML`'s caller (`$('.mk.cur')?.scrollIntoView({block:'nearest',inline:'nearest'})`).
Check: 360 and 320 wide: `?` whole and tappable. With 30 bills in the store: marks scroll, "12 of 30" and `?` stay.

**R3-18. The tally can print a sum it does not have.**
Where: `tallyHTML` 855-856.
Seen in code: `m.fields.total.value||0` and `inr(m.fields.total.value)`: an invoice with no total shows "₹0.00" and a false total. No mock bill triggers it.
Change: `const vs=ms.map(m=>fld(m,'total').value)`; print "—" for a null; print `= sum` and the Payment relation only when every value is present; otherwise end with `<small>one total missing</small>`.
Check: set B-434's total to null in the console: "— + ₹3,186.00", no sum, no "equals Payment".

**R3-19. Names and structure for a screen reader.**
Where and change, each one line:
- 891: `aria-label="Edit total, ${inr(f.value)}"` (it opens the editor).
- 880 `groupLabel`: for an unconfirmed total in `conflict`, append `', '+payRel(b).t.replace('≠','differs from')` so the amount and the difference are in the name before the one-key confirm.
- 872 and the pending buttons: `<span class="sr">, </span>` after the key hint and before `<em>` ("1, 6 Nov 2026, day of the Payment").
- 553 `Paper.slot`: name candidate crops `` `${NAMES[k]}, candidate ${n}, as printed` ``.
- 965 `.B-peek`: `aria-hidden="true"` (it reads "Total as printed on the page" just before the primary).
- 853-854: `aria-current="true"` on the current mark and the current invoice segment.
- 968: `role="dialog" aria-modal="true" aria-label="Whole bill"` on `.B-ovl`.
- 930, 967: the rail is `<section aria-label="Fields">`, not `aside`; `.B-scroll` is `<main>`.
- `.kh` inside `.btn`, `.lnk` and `#toast`: `aria-hidden="true"`.
Check: `a11y` trees: "Total, ₹1,150.00, Differs from Payment · not found on page, differs from Payment ₹1,180.00 · ₹30.00 less"; no stray image before the phone primary; one `main` on phone.

**R3-20. One fact, two wordings.**
Where: `stateText` 624; `renderHelp` 1159; `endHTML` 893.
Change: 624: `if(f.userBox)p.push('marked by you');else if(f.placed)p.push('placed by you');`. Keys dialog: "Undo the last change" (it also undoes a pick, an edit and a mark). Locate caption: "No text layer here. Drag around the total to mark it · Esc to cancel" (one separator).
Check: B-433, mark, `E`, 1180, `Enter`: "Confirmed · marked by you · equals Payment".

### P3

- `draw` 923: wait on `Promise.all(vw.page.getAnimations().map(a=>a.finished))` with a generation counter instead of the 50ms poll; saves up to 65ms before the leader appears.
- `rise` 160: `translate:0 calc(8px*var(--zi,1))` so the page rises 8px on screen at any zoom (it is 24px at zoom 3).
- `colup` 211: `from{opacity:.5;transform:translateY(16px)}`, 200ms. 40px from 30% is heavy for something repeated a few dozen times.
- Toast exit: `#toast{transition:opacity 160ms ease-in}#toast.out{opacity:0}`, then hide. The entrance stays instant.
- Leader dot in dark is 1.6:1 on paper: `.A-lead circle{stroke:var(--bg);stroke-width:1px}`. The leader also needs redrawing when the rail scrolls (`scroll.addEventListener('scroll',()=>lead(0),{passive:true})`) and should sit under the Keys dialog's scrim.
- `.cand{grid-template-columns:20px minmax(0,1fr)}`: "11 Jun" starts 2px right of "6 Nov".
- Dates never break: non-breaking spaces in `fmtD` and in "6 Nov, UPI". `.ev{text-wrap:balance}` (B-433: "on page" alone on a line).
- Tally: `.tally small{display:block}` and no leading "· " (it wraps as "· equals Payment" at 1024, 760 and 390).
- `.seg button.on{background:var(--accent-bg);color:var(--accent);border-color:var(--accent)}`: the solid ink pill outweighs the primary.
- `.stat` starts at 24px; give `.A-foot .stat` `padding:0 12px` to share the rail's 36px edge.
- Phone, B-433: `.B-ev` and the detail line are still right-aligned under a left-aligned total; phone `.row .rl{font-size:10px}` (102) breaks the 11px Label token: delete it.
- At 760 a two-line vendor has its glyph centred between the lines: `align-items:flex-start` with a 5px top margin on the glyph.
- `ArrowLeft/Right` still switch variant in R: skip when `vkey==='R'`. `J` on the last bill and `K` on the first replay the entrance: return early in `go` when the index does not change.
- Keys dialog on touch lists keys nobody can press: under `(hover:none) and (pointer:coarse)` hide the `?` button.
- `button{touch-action:manipulation;-webkit-tap-highlight-color:transparent}` instead of the four-class list at 51; hover fill on `.mk`, `.q`, `.seg button`, `.pages button`.
- Editors: keep what was typed when validation fails (`aria-invalid`, described by `.stat`); reject a bill date before 2000.
- `.mk.cur` tint is 1.07:1 against the bar: add `box-shadow:inset 0 -2px var(--accent)`.

### Not verified; check when built

- Whether a screen reader in browse mode announces a focused field group with its contents, and whether "Confirmed B-431" is cut off by the next bill's focus announcement. Needs VoiceOver and NVDA.
- Reflow at 320px and 200% zoom, and WCAG text spacing on the hero and candidate values: computed from CSS, not rendered. All type is in px, so the browser's default font size has no effect; use rem in the build.
- Hover, undo and a second key press during an animation were not captured in the motion series.
- A total that itself has candidates (no mock bill): the hero would show the reader's pick while `Enter` takes 1. Apply the "Choose 1 or 2" rule to the hero in the build.

### Open, for the owner

1. After the Claimant types a total that is not on the page (B-431 edited to 1.00), the strip turns into "Not found on the page · Point to it" and the printed ₹18,643.42 leaves the screen while the line says "differs from the document" (`states/B-431_edit1_1440_light.png`). Keep the strip showing the printed total the reader found?
   Recommended: yes. The strip keeps the crop with its box in `box-ink` at 45% and no `TOTAL` tag, "Point to it" leaves the strip, and the line stays "Confirmed · differs from the document". The rule becomes: a crop shows what is printed; it is never drawn for a value nobody found.
2. Point to it without a pointer, and without a drag (WCAG 2.1.1, 2.5.7): which paths does v1 owe?
   Recommended: on a bill with a text layer, `Tab` and the arrows walk the printed words while pointing and `Enter` takes one. On a bill without one, two taps or clicks (one corner, then the opposite) stand in for the drag. Marking a region from the keyboard is not built; typing the value (`E`) is the keyboard path, recorded as a known exception in PRODUCT.md.
3. Undo on phone ends with the toast. Should a confirmed bill, reopened from its mark, offer "Undo confirm"?
   Recommended: yes, as a link action beside "Next bill", until the bill is on a submitted Claim. The toast stays as the fast path.

## Carry into the real build (added)

- Never rebuild the element under the pointer between press and release: change focus state by toggling classes, as the hover path already does (R3-1). It also removes the double announcements a full rebuild causes.
- The primary's action is fixed by the field it names, not by where DOM focus happens to be (R3-1).
- A mode with a caption owns `Enter` (R3-3).
- Focus always scrolls its row into view; the rail's fold is part of the layout (R3-4).
- The leader leaves instantly and arrives with a fade; it is never on screen while the page or camera moves (R3-6).
- Reduced motion removes animations; it does not shorten them (R3-7).
- A toast lives in the pinned footer on phone and waits while it is hovered or focused (R3-5).
- A crop stays on the page; where it cannot, the gap is Sheet Shade, never white (R3-10).
- A status message is cleared by the next action and announced every time, even when the words repeat (R3-8).

## Round 3 applied

Builder pass on `prototypes/bill-review/index.html` (variant R; shared code also serves A to D). Verified in headless Chrome with Playwright driving real mouse, touch (CDP touch events, including a two-finger pinch) and keyboard, at 1440×900, 1024×768, 760×900, 390×844 and 360×800 (320 for the bar), light and dark, with and without reduced motion. No console errors or failed assertions in any run, variants A to D included.

- **R3-1 done.** Pointer-press guard on `focusin`; the primary never takes the field focus. Click (1440, 1024, 760) and tap (390, 360) on B-433's primary confirm the total and the label becomes "Confirm date · 13 Nov 2026"; B-432 takes 6 Nov in one click; Shift+Tab onto the primary keeps its label and `Enter` acts; one click on "Edit" in an unfocused row opens its editor; the first tap on a phone crop opens the whole bill. One ring: the field keeps its tint, its outline goes while the primary or the slot has the ring. The same test failed on the round 2 file.
- **R3-2 done.** Slot ring 2px accent; name "Not found on the page · Point to it (total)"; at 390 B-432 reads "GSTIN · Point to it" over "Nothing read"; the next-bill peek shows "Not found on the page" and is not a button. Not matching the fix list: B-433's date has no slot on phone (a bill with no text layer shows rows, not crops), so the "Date · Point to it" check does not apply.
- **R3-3 done.** `L` shows "Cancel pointing"; `Enter` leaves pointing, confirms nothing, focus on the total; `L` then `↓` ends pointing.
- **R3-4 done.** B-435 by `J` at 1024×768 and 760×900: the stop and both candidates end above the footer; GSTIN at 1440×900 fully visible; `#app` never scrolls.
- **R3-5 done.** Toast is a row of the pinned footer on phone; its `bottom` is set from the footer's measured top (so a two-line primary still fits). 360 and 390: toast inside the footer, column ends above it, Undo one line, still there after 10 s with focus, ring in `bg` on `ink`; hidden on the end screen.
- **R3-6 done.** Opacity sampled each frame after `J`, `K`, `↓` (light, dark, reduced): 0 on the first frame after the key, 0 in every frame while the page or camera moves; fades in about 230 to 290 ms after the key. `draw` now also waits for the camera's transition.
- **R3-7 done.** Reduced motion: every sampled frame after `J` and a tap is opacity 1, no translate, at every width.
- **R3-8 done.** One setter counts status messages and clears the arrival line. Heard: "Confirmed B-431. Bill B-432, 1 to check", then "Undone…" twice (repeat forced with a trailing no-break space), "Bill B-433, 2 to check"; the status is blank after the pick; hover never re-announces.
- **R3-9 done.** Focus on the heading, spoken once; "5 bills are ready for a Claim"; "1 differs from its Payment: B-433 ₹30.00 less" in Brick with its glyph; "Undo the last change" (secondary) and "Start over (prototype)" (link); no filled button.
- **R3-10 done, one deviation.** Strip after a drag on B-433 is page edge to edge with the whole box; crops sit on Sheet Shade (B-432 dark: no white); B-435 at 390 shows two stacked crops, one dashed box each. With one column alone the digits were 9.7px (the crop is height-limited), so candidate crops are 56px tall instead of 44: 12.4px digits.
- **R3-11 done.** "Rs. 1,180.00", "₹1,180/-", "1180" give 1,180.00, 1,180, 1,180.
- **R3-12 done.** Marking pushes undo: Cmd+Z after a mark on B-433 removes it and B-431 stays confirmed. A second finger turns the gesture into a pinch: the page zooms (scale 3.75), no draft, nothing committed. Pointing keeps a zoomed-in camera (guard in `Viewer.go`; keeping `zoomMode` alone would still refit).
- **R3-13 done.** Touch swipe that starts on B-433's page at scale 1 scrolls the column (51 to 365 px); camera unchanged.
- **R3-14 done.** `.lnk` 24px minimum; the phone target block also applies under `pointer:coarse`; tapping B-431's date at 390 shows "Edit" (44px). Remaining under 24px at 1440: the inline value text (19px), covered by the inline exception and now backed by "Edit".
- **R3-15 done.** Tags on dimmed boxes are hidden; `p.2` is `ink-2` on Sheet at full opacity.
- **R3-16 done.** Checkbox in Keys; off: `E`, `L`, `J`, `1` do nothing; `Enter`, `↓`, Cmd+Z and the `?` button work. Kept in memory only (prototype).
- **R3-17 done.** At 360 and 320 the `?` is whole; with 30 bills the marks scroll, the current mark is in view, "12 of 30" and `?` stay.
- **R3-18 done.** B-434 total null: "— + ₹3,186.00 one total missing", no sum, no Payment relation.
- **R3-19 done.** Hero group name as in the check; hero button "Edit total, ₹1,150.00"; candidates read "1, 6 Nov 2026, day of the Payment"; candidate crops named by number; peek `aria-hidden`; `aria-current` on mark and segment; overlay is a modal dialog "Whole bill"; rail is a section "Fields", one `main` on phone; key hints in buttons and the toast are `aria-hidden`. No screen reader was run.
- **R3-20 done.** B-433 mark, `E`, 1180, `Enter`: "Confirmed · marked by you · equals Payment"; Keys reads "Undo the last change"; caption has one separator.
- **P3 done:** `rise` scaled by zoom; `colup` 16px from 50% in 200 ms; leader dot stroke in `bg`; leader redraws on rail scroll (waits for the camera); `.cand` 20px key column; `.ev` balanced; tally "equals Payment" on its own line without "· "; segment "on" in accent tint; `.A-foot .stat` on the rail's 36px edge; phone 10px label removed; arrows do not switch variant in R; `J` on the last bill and `K` on the first do nothing; `touch-action` on all buttons; current mark underlined. **P3 skipped:** `draw` on `finished` promises (the poll works), toast exit fade, non-breaking dates, 760 vendor glyph alignment, hiding `?` on touch (conflicts with the R3-17 check), hover fills, keeping typed text after a failed edit.

### Owner answers built (21 Nov 2026)

- **R3-Q1 done.** A typed value that is not on the page keeps the printed box (`printedBox`): B-431 edited to 1.00 keeps the ₹18,643.42 crop with an ink box at 45% and no tag, no "Point to it"; the line reads "Confirmed · differs from the document".
- **R3-Q2 done (a, b); c recorded.** (a) While pointing on a bill with a text layer, focus moves to the page; Tab and Shift+Tab walk the printed words, each with a 2px accent ring, and `Enter` or `Space` takes one (B-432: seven Tabs to "06/11/2026", `Enter` confirms 6 Nov as placed). (b) Any bill: a first click or tap sets a corner and the caption changes to "Click (Tap) the opposite corner of the total · Esc to cancel"; the second marks the region (B-433 by mouse, B-431 by touch on a pinched page, B-432 region over printed words takes the words); `Esc` cancels. A tap that finishes pointing now completes after its own click, so it cannot land on what the closing overlay uncovers. (c) Known exception: marking a region by keyboard alone is not built. Typing the value (`E`) is the keyboard path for a bill with no text layer. This is an exception against WCAG 2.1.1 (Keyboard) for region marking; the two-click path satisfies WCAG 2.5.7 (Dragging Movements).
- **R3-Q3 done.** A confirmed bill reopened from its mark shows "Undo confirm" as a link beside "Next bill" (1440 and 390). It restores the fields as they were before the bill was confirmed and puts the bill back to review; Cmd+Z re-confirms. The prototype has no Claim state, so "until submitted" is not shown.

## Round 4 applied

Builder pass on `prototypes/bill-review/index.html` against `.impeccable/review/round3/DIGEST.md` and the designer's and owner's decisions of 21 Nov 2026. Verified in headless Chrome with Playwright driving real mouse, touch and keyboard (on macOS: `Meta+a` to select, `Meta+ArrowLeft` for line start) at 1440×900, 1024×768, 390×844 and 360×740, light and dark, with reduced motion. No console errors, warnings or failed assertions in any run, variants A to D included.

### BUILD

- **B1 done.** `liveGroup` counts the digits and points before the caret, regroups, and puts the caret back after the same count; the value is set only when it changes. B-431, caret after the "1", `0` then `5`: "10,58,643.42", caret after the 5; two Backspaces return "18,643.42" with the caret at 1. Pasted "Rs. 1,180.00": 1,180.00. Select all, "1.00", `Enter`: ₹1.00.
- **B2 done.** Word focus ring is `--box-accent` (#2B3A8C) with the white halo in both themes.
- **B3 done.** While pointing the pane is `role="group"` named by the caption; the caption is written to `#live` when pointing starts and when it changes, not to `.stat`. B-433: `#live` holds the caption; after one click (tap at 390, 360) `#live` and the pane name read "Click (Tap) the opposite corner of the total · Esc to cancel".
- **B4 done.** An arrival is spoken once; trailing full stops are stripped before joining. "Confirm undone"; "Marked on the page. The value stays as read"; `J` still gives "Confirmed B-431. Bill B-432, 1 to check".
- **B5 done.** While pointing the hero keeps its tint and loses its outline; one ring, on the word.
- **B6 done.** No leader for a value with a `printedBox` and no `box`. B-431 edited to 1.00: no leader path, ink box on the page and in the strip, "Confirmed · differs from the document".
- **B7 done.** Shift+Tab then Tab onto the primary of B-431: focus `confirm`, nothing tinted, camera at fit, `Enter` confirms. B-433 keeps the total tinted.
- **B8 done, by a different means.** A `::after` on `.B-cell .crop` fades 8px at top and bottom to the crop's own background. A mask on `.cin` as written would sit in the page's coordinates (it is scaled), not the crop's; the overlay shows exactly what such a mask would. Boxed value and label untouched at 390 and 360.
- **B9 done.** A crop inside a ringed group has no outline (B-431 total at 1440, B-432 date at 360); the hatch keeps its dashed edge.
- **B10 done.** "Click the total on the bill, or click two corners around it · Esc to cancel"; "No text layer here. Drag around the total, or click two corners, to mark it · Esc to cancel"; "Tap" on coarse pointers. Two lines at 390 and 360, one at 1440.
- **B11 done.** No "Point to it" anywhere while pointing (detail links, the hatched slot, and C's card); they return after.
- **B12 done.** B-433 at 390 and 360: value, evidence and "Point to it" share the left edge (x 28).
- **B13 done.** No underline while pointing until the pointer is over a word, then that word only.
- **B14 skipped.** It edits `PRODUCT.md:77` and `DESIGN.md:304`, outside this pass's files. Done by the Capture write-up, 21 Nov 2026 (`PRODUCT.md`, `DESIGN.md`).

### Decisions

- **D1 done (a).** Hero crops (laptop strip and phone hero) set `tx` so the printed box ends 12px inside the frame's right edge, rotation included; the `k0` fit and clamp are kept. The read total and evidence line are right-aligned with 12px padding on laptop too; left only when the strip is hatched (`:has`) or on a bill with no text layer. Printed box right edge versus read total: 3px apart on B-431 and B-432 at 1440, 1024, 390 and 360.
- **D2 done (b), one deviation.** Focus no longer opens a row's, the hero's or a cell's detail line when it has a value. Clicking total, Date, Bill number, GSTIN in turn on B-431 moves no row at 1440 or 390. Laptop: value hover is `--surface-2`, 6px radius, text cursor. Phone: a focused clean cell shows "Edit" (24px tall, 44px hit area) on its value line before the glyph. Deviation: a focused row with no value (for example B-432's GSTIN) still opens its line, because "Point to it" and "Not on the bill" have no other pointer path there.
- **D3 done (owner, 21 Nov).** (Q1) The primary is full width in every state; `.stat` is a 24px flex row with the status left and "Undo confirm" right, before the primary in the DOM (one Shift+Tab from "Next bill"); 44px tall at 390 while the link shows. (Q2) Editing a value on a confirmed bill reopens it: the edited field shows as entered by you, the mark goes back to unconfirmed, "Undo confirm" goes, the primary reads "Confirm again · ₹…" and the status "Edited after confirming · confirm again" (this wording is not yet checked against the copy guide). A total that differs from the Payment keeps its line. Confirm, edit date, reconfirm, Undo confirm keeps the date edit. Primary rect identical across rest, confirm/reopen and edit at 1440 and 390. (4) The toast stores its bill; its Undo reopens that bill with `undoConfirm`: confirm B-431, take 6 Nov on B-432, toast Undo reopens B-431 and leaves B-432's date. (5) Each undo step has a label: Cmd+Z says "Undone: date edit, B-431".
- **D4 done (owner, 21 Nov).** Pointing starts on the field's printed label word, else the first word. `←`/`→` walk words in reading order, `↑`/`↓` a line, Home/End the ends; Tab and Shift+Tab still walk; `Esc` ends pointing and `↓` no longer does. R3-3's check is now "`L`, then `Esc`: pointing ends". B-431: `L` (focus "Grand Total"), `→`, `Enter` takes ₹18,643.42.
- **D5 done (b).** The primary's ring shows only under `html.kbd` (first non-modifier key; removed on pointer press). R3-1's "hide the field ring while the primary is ringed" now applies only under `html.kbd`, so a mouse user keeps the row ring. B-431 loads with no ring at 1440 and 390; a key then shows it.
- **D6, D7 no change.**
- **D8 done.** The end screen adds an inert "Build a Claim" link under the count line (no wording existed in design.md or DESIGN.md).

Open: the toast's "Undo ⌘Z" hint now differs from what Cmd+Z does once a later step exists (the toast undoes its bill, Cmd+Z the latest step).

## Round 5 applied

Builder pass on `prototypes/bill-review/index.html` against the collated Opus audit and finish review (16 items) and the owner's standing decisions. Each item was reproduced first on the Round 4 file (`r4/a1.mjs`, `r4/a3.mjs`), then checked in headless Chrome with Playwright driving real keys, mouse and touch (on macOS `Meta+a` selects all) at 1440×900, 1024×768, 390×844 and 360×740, light and dark; reduced motion at 1440 and 390 for pointing, the toast and undo. Variants A to D: Enter, J, K, L, Esc, E, Cmd+Z at 1440 and 390. No console errors, warnings or failed assertions.

### P1

- **R5-1 done.** `finishLocate` (text and region), `confirmField`'s page-value choice and `commitEdit` all go through `reopen(b,k)`. Repro before: confirm B-431, `K`, `L`, Enter on "1,249.50", `1` left the bill confirmed with "Next bill". After: not confirmed, `reopened`, primary "Confirm again · ₹1,249.50 · ≠ Payment", no "Undo confirm"; at every size and theme, and with reduced motion. A region mark on a confirmed bill reopens it too (it changes the evidence). "Keep the reader's value" sets nothing and does not reopen.
- **R5-2 done.** `.r2` also renders at rest when a confirmed field is `differs`, `placed` or `userBox` (rows and phone cells, including the vendor). B-431 confirmed, date edited to 15 Nov: with focus on the primary the date row reads "Confirmed · differs from the document"; still there after confirming again. Clicking total, Date, Bill number, GSTIN in turn changes no row's top or height at 1440. At 390 no cell changes height; tapping GSTIN scrolls the column 33px as one block, because focus scrolls the cell into view (R3-4).

### P2

- **R5-3 done.** Fields the bill confirm ticked carry `byBill`. While `b.reopened` they show as unconfirmed (`shownConf` in `disp`, `valueText` and the page boxes); a field that is typed, pointed to or chosen counts as confirmed again. B-431 confirmed, date edited: the hero reads "On the page · equals Payment 14 Nov, UPI" with the box glyph; vendor, bill number and GSTIN show the box glyph and the date shows ✓.
- **R5-4 done.** `snapshot()` stores `reopened` and `doUndo()` restores it. Confirm, `K`, edit date, Cmd+Z: confirmed, not reopened, "Next bill". Cmd+Z again: "Confirm bill · ₹18,643.42", not "again".
- **R5-5 done, in `openBill`.** `reopen()` already cleared its bill's toast. The two Undos came from opening the confirmed bill from its mark, so `openBill` now drops a toast for the bill it opens. Confirm B-431, `K`: one visible Undo (the status line's).
- **R5-6 done.** A keydown on the total editor: Delete at a comma removes the next digit, Backspace after one removes the previous digit, then it regroups. "18,643.42", caret at 2, Delete gives "1,843.42" with the caret at 3; caret at 3, Backspace gives "1,643.42" with the caret at 1.
- **R5-7 done.** Under `html.kbd`, on a bill with a text layer, the caption, the pane name and `#live` add "arrows to move, Enter to take". The caption updates when `kbd` turns on or off. At 390 and 360 (coarse) "· Esc to cancel" is gone from all three captions. B-432 GSTIN at 1440: started by mouse, no hint; `→` adds it.
- **R5-8 done.** `#end h1:focus-visible{outline:0}`. On the end screen reached by Enter (`kbd` on), the heading has focus and no outline.
- **R5-9 done.** Order: heading, count, the ≠ line, "Build a Claim →" (inert, ink, 15px, full opacity), then "Undo the last change" and "Start over (prototype)" as quiet `ink-2` links. No `.btn` on the screen.
- **R5-10 done.** One `readingLines()` (lines top to bottom, words left to right) orders the word elements in the DOM when pointing starts and drives the arrows. B-431: the 47 Tab stops equal the 47 `→` stops at every size. B-432: two Tabs from "Date" to "06/11/2026", and Enter still takes 6 Nov as placed.
- **R5-11 done.** A `focusout` on the pane: when focus leaves by key, pointing ends, "Pointing ended" goes to `#live`, and Tab keeps its destination. End then Tab: focus on the vendor row. Home then Shift+Tab: focus on `?` at 1440 (at 390 the overlay closes). Pointer focus changes are left as they were. Also fixed: the phone overlay's viewer kept `locating` after closing, so a second `L` did not focus a word.

### P3

- **R5-12 done.** `.stat .lnk{flex:none;white-space:nowrap}`. With "Page and reader disagree. Nothing was overwritten.", "Undo confirm" fits on one line at every size, 360 included.
- **R5-13 done.** The step is labelled `reopen, B-431`. "Undo confirm", then Cmd+Z: "Undone: reopen, B-431".
- **R5-14 done.** Rows and cells pass `noState` when `valueText` is null. B-432 GSTIN focused: the row says "Nothing read" once. Not matching: on phone the hatched crop above the value also reads "Nothing read", so the cell still shows the words twice. That placeholder was not in scope.
- **R5-15 done.** The phone crop fade is 14px at top and bottom (computed `::after` gradient).
- **R5-16 done.** The toast's button reads "Undo" with no key hint. Closes the Round 4 open item.

### Found while verifying

- After "Use the page value" (or pointing at the same value elsewhere), the field kept its old label, so the strip cropped "Grand Total" together with the new box and showed the wrong part of the page. `f.label` is now cleared; the B-431 strip shows the 1,249.50 box.

## Round 6 applied

- **R6-1 done (P1).** `isStop` returns true for a field with an open choice (`f.pending`) before the `confirmed` check. `primaryInfo` and `doPrimary` take the `b.confirmed` shortcut only when the bill has no stops. B-431, total focused, `L`, 15,799.50: the button reads "Use page value · ₹15,799.50" and Enter takes choice 1 (₹15,799.50, not confirmed). Confirm, `K`, `L`, 1,249.50: the button reads "Use page value · ₹1,249.50". With focus on the primary it reads "Check total". Enter goes to the total, and a second Enter reopens the bill ("Confirm again · ₹1,249.50"). `doPrimary` no longer clears the status after a choice, so "Edited after confirming · confirm again" shows and is announced. `confirmBill` and bulk confirm can't pass an open choice now, because it is a stop. `openBill` drops an untaken choice from a confirmed bill when you leave it, so `J` leaves no confirmed bill with a choice.
- **R6-2 done (P2).** When the phone overlay closes and focus has already fallen to `body`, `syncDomFocus` runs. 390, B-431, `L`, `→`, Enter: focus is on `.ft[data-key=S.focus]` and focus-visible. Here that is the primary, because the take resolved the total and the Enter flow moves on, the same as at 1440. When a field stays open (a rejection or a choice) it is the field's cell.
- **R6-3 done (P3).** A take sets the status to "Total set from the page: ₹18,643.42". On a confirmed bill it adds "· confirm again". `#live` speaks it for mouse, tap and keys.
- **R6-4 done (P3).** Pointing checks the GSTIN against `^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]$`, with spaces removed and letters uppercased. A rejection behaves like the total and date: "That isn’t a GSTIN", nothing is written and pointing ends. On B-432, "1482" is rejected. On B-431 the printed 29AAKCT4821M1Z7 is accepted.
- Suite `r5/v.mjs` has R6 checks at 1440, 1024, 390 and 360, light and dark. Everything passes except the known R3-4 GSTIN scroll at 390. No console errors.
