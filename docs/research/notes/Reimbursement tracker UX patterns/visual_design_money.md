# Visual design and money formatting for a calm reimbursement tracker (status colour, density, money typography, INR, dark mode, accessibility)

## Status colour systems and badges (never colour-only)

### Takeaway
Mature design systems keep status colour small, semantic and always paired with a text label (and ideally an icon or shape). Carbon explicitly says colour alone is insufficient. WCAG 1.4.1 requires a non-colour cue. Carbon suggests capping indicators at about five or six, so for 7 stages the stages should be grouped into few hues and the text label should carry the meaning.

### Cited Findings
- Carbon: "relying solely on color to convey status is insufficient"; pair colour with a shape, symbol or text label; non-text elements need at least 3:1 contrast against each other and the background. — [Carbon status indicators](https://carbondesignsystem.com/patterns/status-indicator-pattern/)
- Carbon: skip indicators when no action is needed or the status is insignificant (plain text is better); keep indicators to roughly five or six at most. — [Carbon](https://carbondesignsystem.com/patterns/status-indicator-pattern/)
- Carbon severity model: high attention = needs immediate action (errors); medium = feedback or progress needing no immediate response; low = ready to view or changed. When statuses are grouped, show the highest-attention colour. — [Carbon](https://carbondesignsystem.com/patterns/status-indicator-pattern/)
- Carbon colour meanings: red = danger/error, orange = serious warning, yellow = regular warning, green = success/normal, blue = passive notification or workflow progress, gray = draft/unstarted, purple = outlier/undefined. — [Carbon](https://carbondesignsystem.com/patterns/status-indicator-pattern/)
- Carbon icon indicators combine icon + shape + colour + descriptive label; suit tables and dashboards. Place the indicator before the label. Shape-only indicators must always carry a text label; add outlines for light orange/yellow in light themes; do not reuse one shape in different colours. — [Carbon](https://carbondesignsystem.com/patterns/status-indicator-pattern/)
- Carbon differential indicators (+/-, caret, arrow) with colour optional; positive green and negative red usually. — [Carbon](https://carbondesignsystem.com/patterns/status-indicator-pattern/)
- Atlassian lozenge: use semantic colours when colour carries shared meaning (workflow status, risk); do not use accent colours for semantic labels. Sentence case, not all caps. Short labels; default max width 200px, truncated text is not recoverable because lozenges cannot take focus. Do not rely on colour alone: pair with a clear text label and, where helpful, an icon. — [Atlassian lozenge usage](https://atlassian.design/components/lozenge/usage)
- GitHub Primer Label variants: default, primary, secondary, accent, success, attention, severe, danger, done, sponsors (sizes small default, large). The page does not specify colour-to-status mapping or accessibility rules (not covered in fetched content). — [Primer Label](https://primer.style/components/label)
- WCAG 1.4.1 (A): colour cannot be the only visual means of conveying information; add text, shape, icon or pattern. Colours differing in hue and lightness can serve as an extra distinction if they reach 3:1 against each other, but if meaning depends on telling specific colours apart, add another indicator. — [Understanding 1.4.1](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)
- WCAG 1.4.11 (AA): UI components and graphics needed to understand content need 3:1 against adjacent colours; not required where the information is also conveyed by visible text. — [Understanding 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)
- Material 3 colour roles and Polaris badge guidance: fetches returned no body text (Polaris redirects to shopify.dev/docs/api/polaris); not usable. Linear's status icons: not found.

### Inferences
- Suggested hue budget (my synthesis from Carbon's mapping): neutral gray (Closed, Awaiting delivery), blue (in-progress: Refund pending, Claimed), amber (Needs invoice, attention), green (Ready/Reimbursed), red reserved for overdue. That is about 5 hues, matching Carbon's five-six cap.
- Stage badge = small leading icon/dot shape + sentence-case text, tinted background plus text at 4.5:1; attention badges (overdue, possible duplicate, already filed) as a separate, outlined style so stage and attention are distinguishable by form not just hue.
- Progress stages can use a filled-fraction icon (empty, half, full) so order reads without colour.

### Gaps
- Linear status icon rationale, Material 3 role guidance and Polaris badge details could not be retrieved (blank or redirect pages).
- Primer accessibility subpage not retrieved.

## Density: tables vs cards vs lists

### Takeaway
Carbon's row sizes (24/32/40/48/64px) give a concrete density scale; NN/g recommends frozen headers, light borders/zebra, and for mobile keeps tables with scroll cues and sticky first column rather than a card transform. NN/g does not address numeric alignment or density in the fetched articles.

### Cited Findings
- Carbon data table row heights: xs 24px, sm 32px, md 40px, lg 48px, xl 64px; header row matches row size. Zebra rows use a `$layer-accent` token. — [Carbon data table style](https://carbondesignsystem.com/components/data-table/style/)
- NN/g: freeze header rows and header columns when the table exceeds the screen; a subtle drop shadow helps frozen areas look like they float; light borders and zebra striping help keep one's place across a row; hover highlight serves the same purpose. — [NN/g data tables](https://www.nngroup.com/articles/data-tables/)
- NN/g mobile tables: horizontal scroll is acceptable with visible cues (cut-off columns or arrows, not dots); lock the row-header column; lock column headers on tall tables; columns must be readable without zooming; rotation is a last resort; let users pick attributes; group attributes into accordions; design the large-screen table first then reassess which attributes matter. — [NN/g mobile tables](https://www.nngroup.com/articles/mobile-tables/)

### Inferences
- NN/g does not endorse cards for mobile; for 5-8 fields per item, a two-line list row (title + status badge; secondary meta + amount right-aligned) is my suggested compromise on a phone, with a real table on the Mac. This is an inference, not a cited rule.
- Use about 40px (md) rows on desktop default with 32px compact option; on phone use about 56-64px two-line rows (inference from Carbon scale and the 24/44px target sizes below).

### Gaps
- Polaris index table guidance and NN/g numeric-column alignment guidance not found in fetched content.
- No cited evidence comparing zebra vs dividers; NN/g treats them as complementary.

## Money typography

### Takeaway
Use fonts with real tabular figures and enable `font-variant-numeric: tabular-nums` on every amount; right-align amounts. Whether Stripe/Mercury etc. publish these rules was not verifiable from primary sources.

### Cited Findings
- `tabular-nums` makes all digits equal width (OpenType `tnum`) so numbers align in tables; `lining-nums` (`lnum`) puts figures on the baseline at cap height; `slashed-zero` (`zero`). Only works if the font has the feature. — [MDN font-variant-numeric](https://developer.mozilla.org/en-US/docs/Web/CSS/font-variant-numeric)
- Shopify's Number component applies tabular numerals automatically; it does not format currency, and currency symbols and letters keep normal widths (only digits are tabular). — [Shopify app-home Number](https://shopify.dev/docs/api/app-home/latest/web-components/typography-and-content/number)
- Linear uses Inter for body and Inter Display for headings. — [Linear redesign](https://linear.app/now/how-we-redesigned-the-linear-ui)
- Stripe tabular settings and Mercury font (reported as custom "Arcadia") appear only in third-party style guides, with conflicting weights; no official Stripe/Mercury source found. — [secondary: Mercury breakdown listing](https://www.925studios.co/blog/mercury-design-breakdown), [secondary: AdminLTE roundup](https://adminlte.io/blog/fintech-dashboard-design-examples/)
- Carbon differential indicators: signed values, with arrow/caret; colour optional. — [Carbon](https://carbondesignsystem.com/patterns/status-indicator-pattern/)

### Inferences
- Rules to apply: tabular-nums on all amounts; right-align; render paise in a smaller/lighter span (de-emphasise decimals) only in large totals, and keep fixed 2 decimals in lists so columns align; refunds/credits shown with an explicit sign or "Refund" label plus icon, not colour alone (Carbon differential pattern); Inter has `tnum`, so it satisfies the font requirement (Inter's feature support is not cited here; verify in the font file).
- Decimal alignment comes free if all rows use the same fixed fraction digits with tabular figures and right alignment.

### Gaps
- Official Stripe, Mercury, Ramp, Copilot typography sources not found; Geist/IBM Plex/SF Pro numeral support not verified.

## Indian rupee formatting

### Takeaway
`Intl.NumberFormat('en-IN', {style:'currency', currency:'INR'})` gives lakh/crore grouping with a leading ₹ natively, and compact notation yields ₹1.2L / ₹1.2Cr. Verified by running it, not just by docs.

### Cited Findings
- MDN confirms en-IN grouping: `new Intl.NumberFormat("en-IN").format(123456.789)` gives `1,23,456.789`. — [MDN Intl.NumberFormat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat)
- CLDR chart (hi_Latn, not en-IN) shows compact forms 1L (1,00,000) and 1Cr (1,00,00,000). — [CLDR hi_Latn verify chart](https://www.unicode.org/cldr/charts/49/verify/numbers/hi_Latn.html)
- Local test, Node v26.13.0 (own run; engine-dependent, re-test on Android Chrome and Safari):
  - en-IN currency INR 123456 -> `₹1,23,456.00`
  - maximumFractionDigits 0, 123456.5 -> `₹1,23,457`
  - -1234.5 -> `-₹1,234.50`; with `currencySign:'accounting'` -> `(₹1,234.50)`
  - `notation:'compact'`, 123456 -> `₹1.2L`; 12345678 -> `₹1.2Cr`; plain compact 1500 -> `1.5K`
  - `currencyDisplay:'code'` -> `INR 1,234.00`; `signDisplay:'always'` -> `+₹1,234.00`
  - formatToParts(1234567.5) yields currency, integer, group, decimal, fraction parts (so the fraction can be wrapped in a styled span).
  - Pitfall: locale en-US with INR gives Western grouping `₹1,234,567.50`, so the locale must be en-IN.

### Inferences
- Use formatToParts to render paise in a muted span; hide paise only when the value is whole rupees in compact dashboard tiles, otherwise show 2 decimals in rows (receipts are exact).
- Use compact (₹1.2L) only in dashboard summary tiles with the exact figure available on tap/hover; never in lists. Compact output is "K" for thousands in plain en-IN (1.5K), which mixes systems with L/Cr; consider a custom formatter below 1L if that looks odd.
- Rupee glyph: the ₹ is in Inter and system fonts on modern Android/macOS; I did not find a cited source on glyph coverage, so test rendering with the chosen font.

### Gaps
- No ECMA-402/CLDR en-IN primary spec text fetched; no cited guidance on when finance apps show paise; ₹ glyph font coverage not verified.

## Dark mode tokens

### Takeaway
Use dark grey rather than black for base surfaces and lighten surfaces as they elevate; Material moved from overlays to tone-based surface container roles. Specific Material 3 and Apple pages returned no body text, so details are secondary.

### Cited Findings
- Material 2 dark theme (via search snippet): use dark grey not black as the primary surface; #121212 recommended; dark grey expresses more elevation and depth because shadows show on grey. — [Material 2 dark theme](https://m2.material.io/design/color/dark-theme) (page itself did not load; claim from search summary)
- Material 3 replaced tint overlays with surface container roles: elevation +1 = Surface Container Low, +2 = Surface Container, +3 = Surface Container High (search summary of the M3 blog). — [M3 tone-based surfaces](https://material.io/blog/tone-based-surface-color-m3)
- Linear generates themes in LCH from three inputs (base, accent, contrast) instead of 98 variables; text and neutral icons are darker in light mode and lighter in dark mode; contrast is a setting. — [Linear redesign](https://linear.app/now/how-we-redesigned-the-linear-ui)
- Stripe: perceptually uniform colour space gives uniform contrast across hues; default text and icon colours pass WCAG 2.0 thresholds (from search snippets, page not opened). — [Stripe accessible color systems](https://stripe.com/blog/accessible-color-systems)
- WCAG contrast applies in both themes: 4.5:1 text, 3:1 large text (18pt or 14pt bold, about 24px / 18.5px). — [Understanding 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)

### Inferences
- Define tokens as semantic CSS custom properties on `:root`, overridden in `@media (prefers-color-scheme: dark)`; derive status tints per theme (light: pale bg + dark text; dark: low-alpha tinted bg + light desaturated text) and re-check each pair at 4.5:1.
- Surface ladder in dark: bg about #121212-ish, card one step lighter, popover two steps; avoid pure #000 and pure #fff text.

### Gaps
- Desaturation guidance for dark status colours and Apple HIG dark mode text: the pages did not load; the desaturation rule is from my background knowledge, uncited. MDN/prefers-color-scheme not fetched.

## Accessibility (WCAG 2.2)

### Takeaway
Targets: text 4.5:1, UI/status graphics 3:1, tap targets at least 24px (aim 44px), visible focus.

### Cited Findings
- 1.4.3: 4.5:1 normal text, 3:1 large; placeholder text is not exempt; disabled controls are. — [Understanding 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
- 1.4.11: 3:1 for UI component boundaries/states and focus indicators; a control with visible text needs no border unless nothing else identifies it. — [Understanding 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)
- 2.5.8 (AA): targets at least 24x24 CSS px, or spacing such that 24px circles do not overlap; 2.5.5 (AAA) 44x44 CSS px. — [Understanding 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- 2.4.7 requires a visible focus indicator; 2.4.13 (AAA) asks for indicator area at least a 2px perimeter and 3:1 change. — [Understanding 2.4.13](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html)

### Inferences
- Use a 2px focus ring at 3:1 against both surface and element; 44px row/tap targets on phone; wrap non-essential motion in `prefers-reduced-motion` (not cited here).

### Gaps
- Reduced-motion (2.3.3 / MDN) not fetched.

## Calm and beautiful finance UI references

### Takeaway
Primary design-team writing found is limited to Linear and Stripe; the "calm" qualities (restraint, neutral palette, uniform contrast) are attested, but Mercury/Copilot/Things 3 have only secondary or no sources.

### Cited Findings
- Linear: redesign aims to reduce visual noise, improve hierarchy and density; neutral timeless palette with limited brand accent; Inter/Inter Display. — [Linear](https://linear.app/now/how-we-redesigned-the-linear-ui)
- Stripe: perceptual colour for consistent contrast across hues. — [Stripe](https://stripe.com/blog/accessible-color-systems)
- Mercury (secondary, unverified): colour reserved so red/yellow signal errors and warnings only; custom Arcadia typeface. — [925studios](https://www.925studios.co/blog/mercury-design-breakdown)

### Inferences
- Calm recipe supported by the above: neutral surfaces, one accent, red used only for overdue, status as small low-chroma badges, generous row padding, type scale with few weights.

### Gaps
- No design-team writing found for Mercury, Copilot Money or Things 3; Stripe Dashboard-specific numeric typography unconfirmed.
