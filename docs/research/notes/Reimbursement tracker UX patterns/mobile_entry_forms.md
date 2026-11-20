# Mobile quick-add forms for expense/payment entry (UPI QR payment on Android; Mac laptop edit form)

Coverage note: about 27 tool calls were used. Several target pages did not return usable content (Material 3 pages are JS-rendered and returned only titles; Apple HIG returned only a title; Expensify, Monarch and two NN/g URLs returned 404 or DNS failure). Those items are listed under Gaps rather than filled from memory.

## Amount-first entry: native keypad vs custom, formatting, large type

### Takeaway
Use a plain text input with `inputmode="decimal"` (not `type="number"`) as the default for the amount. GOV.UK and MDN both support this. Format Indian grouping with `Intl.NumberFormat("en-IN")`. I found no primary source on how Splitwise, Monarch, Copilot, YNAB, Spendee, Toshl or GPay/PhonePe handle amount entry, so the competitor comparison is a gap.

### Cited Findings
- `inputmode="decimal"` gives a "fractional numeric input keyboard containing the digits and decimal separator for the user's locale"; `numeric` is digits 0-9 only. Baseline widely available since Dec 2021. — [MDN inputmode](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_Attributes/inputmode)
- `inputmode` enforces no validity requirements. It only changes the keyboard, so validation must be done separately. — [MDN inputmode](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_Attributes/inputmode)
- Devices "may or may not show a minus key" on these keyboards. — [MDN inputmode](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_Attributes/inputmode)
- GOV.UK: "Do not use `<input type="number">` unless your user research shows that there's a need for it." Reasons given: users can accidentally change the value by scrolling, and there is no clear feedback when non-numeric text is entered. — [GOV.UK text input](https://design-system.service.gov.uk/components/text-input/)
- GOV.UK: use `inputmode="decimal"` for decimals. Omit `inputmode` if negative numbers may be needed, since some devices cannot type a minus on the numeric keypad. — [GOV.UK text input](https://design-system.service.gov.uk/components/text-input/)
- GOV.UK currency pattern: put the symbol as a prefix outside the input, but also say the unit in the label or hint, because screen readers may skip prefixes. Accept the user typing the symbol into the field without raising an error. — [GOV.UK text input](https://design-system.service.gov.uk/components/text-input/)
- GOV.UK error copy patterns: "Enter [x]" for empty; "[x] must be a number, like 30" for non-numeric. — [GOV.UK text input](https://design-system.service.gov.uk/components/text-input/)
- NN/g mobile input checklist: choose the right keyboard per field, let users enter data in any format and autoformat it, and support copy/paste. Place labels above the field, mark required/optional, and avoid placeholder text inside fields. — [NN/g mobile input checklist](https://www.nngroup.com/articles/mobile-input-checklist/)
- `Intl.NumberFormat("en-IN")` formats 123456.789 as `1,23,456.789` (lakh grouping). `formatToParts()` is available for custom rendering. The `Intl.NumberFormat` object has been Baseline widely available since Sept 2017. — [MDN Intl.NumberFormat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat)
- Cashew (open source) has a long-press on the add button that duplicates frequent transactions, and auto-assigns categories to repeated titles. This is secondary evidence from a search summary of Cashew's FAQ, README and release notes, not a fetched primary page. — [Cashew FAQ](https://cashewapp.web.app/faq.html), [Cashew GitHub](https://www.Github.com/Droyder7/Cashew)
- Splitwise's add-bill screen (older iPhone version) has two required fields, description and amount, with Save at top right. This comes from a third-party design critique. — [Pratt IxD critique](https://ixd.prattsi.org/?p=3982)

### Inferences
- A text input with `inputmode="decimal"` plus live `en-IN` grouping on the displayed value is the lowest-risk approach. Store the raw digits and format on display. A custom in-page keypad is not supported by anything I found. It would also forfeit paste, accessibility and the system keyboard.
- Since decimal keyboards vary by locale (MDN), set `lang="en-IN"` and test on the actual Android keyboard. I did not verify whether Gboard shows "." for en-IN.
- Because GOV.UK warns that prefix symbols may be skipped by screen readers, the label should read "Amount in rupees" with a visible ₹ prefix.

### Gaps
- How Splitwise, Monarch, Copilot, YNAB, Spendee, Toshl and GPay/PhonePe do amount entry: not found in primary sources (Monarch help domain failed to resolve; others not reached). Cashew's keypad could not be confirmed.
- No research-backed figure for amount font size. No primary source on "large display type" was reached.
- Whether a custom keypad is faster than the native keyboard: no study found.

## Receipt/screenshot-first capture and OCR

### Takeaway
UPI screenshots contain amount, payee name or UPI ID, date/time and a 12-digit reference, but labels differ by app and nothing official specifies the layout. Evidence is vendor marketing only. I found no information on CRED's own receipt layout.

### Cited Findings
- Typical extraction targets are sender/recipient name, amount, UPI ID, date, time and transaction ID. A UiPath forum thread suggests prompting for JSON output and correcting common OCR digit errors. — [UiPath forum](https://forum.uipath.com/t/extracting-data-from-payment-screenshot-like-gpay-phone-pay-yono-paytm-etc/5723617) (secondary, forum)
- The 12-digit reference is labelled differently by app: PhonePe "UPI Ref No", GPay "Transaction ID", Paytm "UTR Number". Matching on label, not position, is recommended. — [imagetotable.ai](https://imagetotable.ai/extract/upi-screenshot) (vendor, secondary)
- The vendor says the 12-digit NPCI-level reference (RRN/UTR) is the key for reconciliation and disputes, not the app's internal ID. — [imagetotable.ai PhonePe](https://imagetotable.ai/extract/phonepe-screenshot) (vendor, secondary)
- Indian grouping such as ₹1,50,000 can be misparsed by generic OCR and should be normalised. — [imagetotable.ai GPay](https://imagetotable.ai/extract/google-pay-india-screenshot) (vendor, secondary)
- Typical pipeline: preprocess, extract text, parse, structure, validate. — [Ready Tensor](https://app.readytensor.ai/publications/upi-transaction-extractor-ocrbased-data-parsing-tool-AWNZiVxCkqST) (secondary)
- NN/g recommends populating fields using phone features such as camera, GPS, voice or contacts, and computing values from other input. — [NN/g mobile input checklist](https://www.nngroup.com/articles/mobile-input-checklist/)
- No official NPCI or app-vendor layout specification was found. — [search summary of the sources above]

### Inferences
- Realistic auto-extract from a UPI screenshot: amount (high confidence), date/time (medium), payee name (medium), 12-digit ref (medium, digit-error prone). Treat all as suggestions in editable fields, not silent fills.
- OCR is an enhancement. The 15-second target is met by manual amount entry plus attaching the screenshot unprocessed, which also keeps the screenshot as the evidence file.
- Run OCR on the laptop edit form or lazily after save, so a slow or wrong parse never blocks the quick-add flow.

### Gaps
- Expensify SmartScan, Ramp and Google Lens flows: the Expensify help URL returned 404; no primary source on what SmartScan extracts.
- Accuracy rates of on-device or server OCR on UPI screenshots: no reliable benchmark found.
- CRED's payment-success screen contents and whether it exposes a share/receipt action: not researched.

## Android share target (Web Share Target API)

### Takeaway
A PWA can receive images and PDFs from the Android share sheet via manifest `share_target`, using POST with `multipart/form-data` and handling the body in a service worker. It only works once the PWA is installed. I could not retrieve a browser-support table.

### Cited Findings
- File sharing needs `method: "POST"`, `enctype: "multipart/form-data"` and `params.files` entries, each with `name` and `accept`. List both MIME types and extensions because operating systems differ. — [MDN share_target](https://developer.mozilla.org/en-US/docs/Web/Manifest/share_target); [Chrome for Developers](https://developer.chrome.com/docs/capabilities/web-apis/web-share-target)
- "Your PWA can only act as a web share target if it has been installed." — [MDN share_target](https://developer.mozilla.org/en-US/docs/Web/Manifest/share_target)
- The app must meet Chrome's installability criteria and be added to the home screen first. The article cites Chrome 76+ on Android and 89+ on desktop. — [Chrome for Developers](https://developer.chrome.com/docs/capabilities/web-apis/web-share-target)
- The foreground page cannot read the POST body. A service worker `fetch` handler reads `event.request.formData()`, stores or forwards the data, and replies with a 303 redirect. Files can be passed to the page via Cache or IndexedDB plus `postMessage()`. — [MDN share_target](https://developer.mozilla.org/en-US/docs/Web/Manifest/share_target); [Chrome for Developers](https://developer.chrome.com/docs/capabilities/web-apis/web-share-target)
- Only one `share_target` per manifest. On Android the `url` field is empty because Android's share system does not support it; URLs arrive in `text` or sometimes `title`. — [Chrome for Developers](https://developer.chrome.com/docs/capabilities/web-apis/web-share-target)
- Validate all incoming shared data as with any form submission. — [MDN share_target](https://developer.mozilla.org/en-US/docs/Web/Manifest/share_target)
- MDN labels the feature "Limited availability" and experimental; it is not Baseline. — [MDN share_target](https://developer.mozilla.org/en-US/docs/Web/Manifest/share_target)
- Chrome install criteria listed: HTTPS; manifest with `name` or `short_name`, 192px and 512px icons, `start_url`, `display` of standalone/fullscreen/minimal-ui/window-controls-overlay; `prefer_related_applications` absent or false; the page also lists engagement conditions (a tap and 30 seconds). It does not state whether a service worker is required. — [web.dev install criteria](https://web.dev/articles/install-criteria)

### Inferences
- The flow "pay in a UPI app, screenshot, share to tracker PWA, form opens with image attached" is feasible on Android Chrome, provided the PWA is installed, served over HTTPS and has a service worker handling the POST.
- Since the shared image arrives as a POST, the form page should be reached via the 303 redirect with the file held in IndexedDB or Cache. Build the form to read a "pending share" from there.
- Chrome's own share-target article says a service worker intercepts the request. That means a service worker is needed for this feature even if the install criteria page does not mention one.
- Whether the Gallery/Photos app share sheet lists the PWA for screenshots depends on the `accept` list. Include `image/*`, `.png`, `.jpg`, `.jpeg`, `application/pdf`, `.pdf`.

### Gaps
- Per-browser support table (Firefox, Safari, Samsung Internet): not retrieved.
- Alternatives (Android intent filters in a native or Trusted Web Activity wrapper, Tasker/automation, email-to-self): not researched.
- Whether current Chrome still requires a fetch handler for installability: the retrieved page did not say.

## Smart defaults, memory and field order

### Takeaway
NN/g explicitly recommends defaults from input history and frequent values, and computing values from other input. WCAG 3.3.7 adds that previously entered information should be selectable rather than re-typed within a process. No source gave an optimal number of recent-vendor chips.

### Cited Findings
- Ask whether each field is needed at all; set defaults using input history and frequently used values; compute values from other input; suggest or autocomplete from the first letters typed; accept typos and abbreviations. — [NN/g mobile input checklist](https://www.nngroup.com/articles/mobile-input-checklist/)
- Ordering fields to enable prefill saves typing (the ZIP-before-city example). — [NN/g via search summary](https://nngroup.com/articles/4-principles-reduce-cognitive-load) (secondary summary, not fetched in full)
- NN/g on defaults: pre-select a radio option when one choice is most common; check metrics or past orders to find it; avoid presumptuous defaults for sensitive data; if no default can be chosen confidently, consider a different control. — [NN/g radio buttons default](https://www.nngroup.com/articles/radio-buttons-default-selection/)
- WCAG 3.3.7 Redundant Entry (A): information previously entered in the same process must be auto-populated or "available for the user to select". Browser autocomplete alone does not satisfy it. — [WCAG 2.2 Understanding 3.3.7](https://www.w3.org/WAI/WCAG22/Understanding/redundant-entry.html)

### Inferences
- Default "paid from" to the last-used account, date to now, and type from the last entry for the same vendor. Show the defaults visibly so the user can confirm in one glance rather than hide them.
- NN/g warns against presumptuous defaults only for sensitive data. A last-used payment account is low-risk, but a wrong account in a reimbursement record matters, so show it in the collapsed summary.
- Vendor memory (vendor leads to remembered type) removes two taps on repeat purchases.

### Gaps
- Optimal number of "recent vendor" chips: no source found.
- Evidence on autocomplete accuracy or time saved for payee memory: not found.

## Chips, segmented controls, dropdowns, radios

### Takeaway
Research I could fetch supports defaulting a visible mutually exclusive control and laying options out vertically, but nothing retrieved gives an optimal option count or settles chips versus dropdown. The Material 3 chip and segmented-button guidance was not retrievable.

### Cited Findings
- Radio buttons are for exactly one choice; checkboxes for zero, one or many. Horizontal radio layouts can be hard to scan, vertical is safer. Make the label clickable because radio buttons are small targets. — [NN/g radio buttons default](https://www.nngroup.com/articles/radio-buttons-default-selection/)
- The NN/g radio article gives no maximum option count and does not compare radios to dropdowns. — [NN/g radio buttons default](https://www.nngroup.com/articles/radio-buttons-default-selection/)
- Conflicting views on dropdowns on mobile: the US Department of Labor mobile guidance recommends tap/select controls including dropdowns to reduce typing, while Smashing Magazine argues dropdowns are bad on mobile because they take two taps and hide options. — [DOL mobile form design](https://dol.gov/agencies/eta/ui-modernization/mobile-usability/mobile-form-design); [Smashing 2018](https://www.smashingmagazine.com/2018/08/best-practices-for-mobile-form-design) (both via search summary, secondary)

### Inferences
- Both "type" (3 options) and "paid from" (2 options) are small, mutually exclusive, always required sets. A visible segmented or chip row with one preselected option is a better fit than a dropdown (one tap, all options visible). This follows from the sources above but no source tests chips directly.
- Vendors and categories with unbounded options need autocomplete plus recent chips, not a dropdown.

### Gaps
- Material 3 chips and segmented button guidance, Apple HIG pickers/segmented controls: pages returned no body content.
- Baymard guidance on option counts: not reached.

## Progressive disclosure, layout, label placement, field order

### Takeaway
Show essentials first and keep optional details behind a "More" section, but heavy use can mislead users about form length. Labels go above fields.

### Cited Findings
- NN/g (search summary): progressive disclosure helps by presenting only what is needed at each step. — [NN/g cognitive load](https://nngroup.com/articles/4-principles-reduce-cognitive-load) (secondary summary)
- Queensland Government: heavy progressive disclosure can distort expectations of form size and time; an estimated completion time is recommended. — [Qld CUE checkpoint 21](https://www.qld.gov.au/web/cue/module4/checkpoints/checkpoint21/) (secondary, via search summary)
- Labels above fields, short, sentence case, no trailing colon; placeholders must not replace labels or hints. — [GOV.UK text input](https://design-system.service.gov.uk/components/text-input/); [NN/g mobile input checklist](https://www.nngroup.com/articles/mobile-input-checklist/)
- Make fields visible in both orientations when the keyboard is open, and size fields so most values are visible. — [NN/g mobile input checklist](https://www.nngroup.com/articles/mobile-input-checklist/)

### Inferences
- Phone quick-add: amount, what for, paid from, and an attachment button visible; vendor, order ref, type, notes under "More". A "saved as draft, finish on laptop" message addresses the Queensland caution.
- Because the user reaches the form after paying, the flow can be saved with just amount plus screenshot and completed later on the laptop.

### Gaps
- Direct NN/g article on progressive disclosure for forms: only a search snippet was seen.
- Wroblewski "Web Form Design" field-order or label-placement research: not retrieved.

## Inline validation and error prevention

### Takeaway
Validate on leaving a field, not while typing; clear errors as soon as input becomes valid; keep messages next to the field; and don't rely on a summary alone.

### Cited Findings
- "Ideally, all validation should be inline." Show an indicator as soon as the user finishes a field. — [NN/g errors in forms](https://www.nngroup.com/articles/errors-forms-design-guidelines/)
- Keep error messages next to the field. Don't validate before input is complete; wait until the user leaves the field. Don't use a summary as the only error indication. — [NN/g errors in forms](https://www.nngroup.com/articles/errors-forms-design-guidelines/)
- Baymard: validate most fields on blur; fixed-length fields (e.g. card numbers, postal codes) once the right length is reached; recheck on every keystroke and remove the error as soon as input is valid. Testers were frustrated by errors on empty fields before they had a chance to type. — [Baymard inline validation](https://baymard.com/blog/inline-form-validation)
- Baymard: positive confirmation (checkmarks) reassures users. Inline validation does not replace submit-time error handling. 31% of e-commerce sites in its benchmark have no inline validation (the video summary says 32%, a small inconsistency in Baymard's own page). — [Baymard inline validation](https://baymard.com/blog/inline-form-validation)
- WCAG 3.3.1 (A): the error item must be identified and described in text; colour alone is insufficient. Programmatic association can help (1.3.1, 4.1.2). — [WCAG 2.2 Understanding 3.3.1](https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html)
- GOV.UK avoids `maxlength` because it silently truncates pasted text. — [GOV.UK text input](https://design-system.service.gov.uk/components/text-input/)

### Inferences
- For a quick-add form, the only real hard requirement is amount > 0. Don't block saving for anything else; flag missing vendor/type as "incomplete" for the laptop review instead. This is a design choice that follows from error-prevention guidance, not a cited rule.
- Do not disable the Save button silently; show a text reason (3.3.1).

### Gaps
- Luke Wroblewski's inline validation research and GOV.UK error-summary component: not fetched.

## Touch targets, thumb zone, bottom sheets, keyboard avoidance, sticky save

### Takeaway
Use at least 1 cm touch targets (NN/g) and well above WCAG's 24 px floor. Be cautious with bottom sheets for form entry; if used, provide a visible close button and Back support.

### Cited Findings
- WCAG 2.2 SC 2.5.8 (AA): targets at least 24x24 CSS px, with exceptions for spacing, equivalent controls, inline links, user-agent controls and essential presentation. SC 2.5.5 (AAA) uses 44x44. — [WCAG 2.2 Understanding 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- NN/g: at least 1 cm x 1 cm physical size; larger for primary actions (Target's main buttons about 2 cm); about 2 mm gap between targets as a common minimum; spacing cannot compensate for too-small targets; thumb impact area about 2.5 cm. — [NN/g touch target size](https://www.nngroup.com/articles/touch-target-size/)
- NN/g found no thumb-zone placement guidance in that article. — [NN/g touch target size](https://www.nngroup.com/articles/touch-target-size/)
- NN/g bottom sheets: good for quick, contextual tasks; avoid lengthy or complex content; don't expect them to improve reachability (the middle of the screen is usually easiest to tap); don't stack; support Back; include a visible Close (X); be wary of swipe-down-only dismissal. — [NN/g bottom sheet](https://www.nngroup.com/articles/bottom-sheet/)
- Android: avoid putting touch targets under gesture-navigation insets; use `WindowInsets` so content is not obscured; the keyboard should animate in sync with the app. — [Android system bars](https://developer.android.com/design/ui/mobile/guides/foundations/system-bars)

### Inferences
- Make Save a full-width button about 56 px tall pinned above the keyboard, with safe-area bottom padding. On the web use `env(safe-area-inset-bottom)` and `visualViewport` handling; I did not verify these web APIs in this research.
- A full-screen page (the PWA's own screen, reached from the share sheet) is a safer choice than a bottom sheet, because the form is the whole task and a sheet would be obscured by the keyboard.

### Gaps
- Material 3 bottom sheet and text field specs, 48dp guidance, Apple HIG 44pt: not retrieved.
- Thumb-zone studies (e.g. Hoober): not retrieved.

## Save feedback, undo, offline drafts

### Takeaway
Prefer a snackbar with Undo over a confirmation dialog for a low-risk save, but I could not retrieve the official Material duration guidance.

### Cited Findings
- Material guidance (via search summary) recommends an "Undo" action so users can amend choices, and notes snackbars disappear on their own, so a dismiss action is unnecessary. — [material.io snackbars](https://material.io/components/snackbars)
- Jetpack Compose/Expo: duration is short without an action label and indefinite with one by default. Flutter changed action snackbars to no longer auto-dismiss, stating this aligns with the Material 3 spec. — [Flutter breaking change](https://docs.flutter.dev/release/breaking-changes/snackbar-with-action-behavior-update); [Expo Snackbar](https://docs.expo.dev/versions/latest/sdk/ui/jetpack-compose/snackbar)
- The "4 seconds" figure appears only in third-party libraries, not an official Material source. — [egui-material3](https://docs.rs/egui-material3/0.0.7/src/egui_material3/snackbar.rs.html) (secondary, not authoritative)
- The NN/g undo-vs-confirmation article URL returned 404, so no NN/g statement was obtained.

### Inferences
- Save then show "Saved, Undo" and clear the form, ready for the next entry. Undo can simply delete or restore the just-created record.
- For offline drafts, the share-target docs already point at IndexedDB for holding shared files (MDN). Keeping the draft record in IndexedDB too is consistent, but I did not find a source on offline-draft form UX.

### Gaps
- Official Material 3 snackbar duration and placement rules; NN/g undo guidance; offline-draft patterns and background sync: not found.

## Accessibility

### Takeaway
Visible labels, text errors tied to fields, 24 px minimum targets (aim larger), and not forcing re-entry are the WCAG 2.2 items most relevant here.

### Cited Findings
- 3.3.1 Error Identification (A), 2.5.8 Target Size (Minimum) (AA), and 3.3.7 Redundant Entry (A), as described in the sections above. — [3.3.1](https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html); [2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html); [3.3.7](https://www.w3.org/WAI/WCAG22/Understanding/redundant-entry.html)
- Native HTML validation messages have drawbacks: they can disappear, may not enlarge with zoom, are often generic, and only the first error is exposed at a time. — [WCAG 2.2 Understanding 3.3.1](https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html)
- Every text input needs a (usually visible) label; use `autocomplete` where an input purpose exists (WCAG 1.3.5 in production); set `spellcheck="false"` for reference numbers and names. — [GOV.UK text input](https://design-system.service.gov.uk/components/text-input/)
- A visible Close button supports screen-reader and keyboard users; swipe-only dismissal is error-prone for people with dexterity issues. — [NN/g bottom sheet](https://www.nngroup.com/articles/bottom-sheet/)

### Inferences
- Use custom inline error text (not browser bubbles), linked with `aria-describedby`; set `spellcheck="false"` and `autocapitalize` appropriately on the order ref field.
- This is an inference from the WCAG pages above. I did not fetch the WAI forms tutorials or WCAG 3.3.2/3.3.3 pages.

### Gaps
- WAI forms tutorial, 3.3.2 (Labels or Instructions), 3.3.3 (Error Suggestion), focus-order guidance, `aria-live` error announcement patterns: not retrieved.
