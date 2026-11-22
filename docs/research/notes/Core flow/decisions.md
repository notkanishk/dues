# Core flow: behaviour decisions (owner, 22 Nov 2026)

Capture, matching, Purposes, the Advance, home and filing. Visuals are not decided here; the designer shapes the home screen and the filing flow. Written into `docs/spec/FUNCTIONAL.md`, `GLOSSARY.md` and `openspec/changes/dues-core-architecture/`.

## Capture: payment first

1. Sharing a payment screenshot logs an Expense at once with whatever Dues can read. Dues asks only "What for?". An order-confirmation screenshot, if shared, fills `order_ref`.
2. Optional "Ordered by" on the same step: Me (default) or a recent Person. Stored in the existing `orderer` field.
3. The first time a payee that is a person (not a shop) appears, Dues asks one question: Shop / Online order / Paying someone back. The answer is remembered for that payee.
4. While waiting for a Bill, the Expense sits in "Waiting for invoice". When the Orderer is someone else the line reads "Invoice with <name>".
5. One reminder after 14 days waiting. When the Orderer is someone else it reads "Ask <name> for the <vendor> invoice".

## Matching an arriving invoice (amount leads, vendor is a soft signal)

6. UPI payee names are often a gateway or a person, so matching leans on amount and date. Auto-attach only when: amount exact, date within the window, AND (vendor or order number matches, OR there is exactly one candidate). (Refined for invoices smaller than the open amount by 28.)
7. Anything else attaches to the best candidate with a visible "Check: could also be <Expense ID>" and a one-tap move.
8. No candidate: an invoice-only Expense. If the vendor can't be read it shows "Unknown"; review asks for the vendor once.
9. Every match the Claimant confirms or moves teaches Dues a payee-to-vendor alias (for example a gateway name = a shop), used for later matches.
10. Payback (W9): a payment to a person marked "Paying someone back" expects a Bill of that amount from any vendor; the vendor check is skipped; it matches on amount and date. If that colleague is a Dues Claimant with their own Expense for it, Dues offers to link the two; theirs closes as "paid back by <Claimant>".
11. A Bill in a colleague's name files as is; no note needed.

## Purpose

12. A Purpose has a name and "Paid from: Advance | Other fund". A new Purpose starts as "Other fund" (trips and events usually come from another fund). *(Superseded by 39 and 43: a Fund is where the money comes from; a Purpose is an optional group inside a Fund.)*
13. Expenses with no Purpose are plain Expenses, paid from the Advance, and file together as today. *(Superseded by 42, 44 and 34: with no Purpose an Expense is still in a Fund, Makerspace by default, whether or not an Advance is on.)*
14. Advance-funded Purposes file with the plain Expenses; the mail breakdown groups lines by Purpose. *(Superseded by 42 and 43: each Fund files as its own Claim; Purposes are breakdown groups inside it.)*
15. Each Other-fund Purpose files as its own Claim, with its own total and its own "File" in Ready to file. Example: a trip claimed from a separate fund. *(Superseded by 42: each Fund files as its own Claim, not each "Other fund" Purpose.)*
16. A Purpose can be active (for example during a trip). Zero or more can be active at once. With exactly one active, new payments go into it by default with one tap to put one elsewhere; with two or more active, the "What for?" step offers the active Purposes as choices plus None. Ending a Purpose ("End trip") stops it catching payments.
17. Moving an Expense into or out of a Purpose updates the Advance balance. *(Changed by 45: moving an Expense changes the Advance left of the Funds it leaves and enters, where those have an Advance on.)*
18. Other-fund Claims use the same form and the same Approvers for now. Per-Purpose approvers may come later (a future possibility, not a requirement). *(Superseded by 39 and 46: each Fund has its own form template and mail, including To and CC.)*

## Advance

19. Finance credited the Claimant an advance into their own bank account for lab purchases. Settings, Advance: off by default for every Claimant; when on, the Claimant enters one total amount. No top-up or return records: they edit the total. *(Superseded by 45: the Advance lives inside a Fund, personal and off by default.)*
20. Advance left = Advance total minus money still out of pocket on Advance-funded Expenses (waiting for invoice, ready to file, and filed but not yet reimbursed). A Payment lowers it; a Refund or Reimbursement received raises it, using the amount actually received. Other-fund Purposes never touch it. *(Changed by 45: Advance left is per Fund, over that Fund's Expenses; "Other-fund Purposes never touch it" no longer applies.)*
21. It can go below zero, meaning the Claimant has their own money in.
22. Home shows the balance as a primary block when Advance is on (hidden when off): red below zero, amber when 15% or less of the total is left, green above that. Below zero it carries "₹x of your own money in". Exact placement and visuals are for the designer. *(Changed by 45: the colours and the sentence stay; the block is per Fund with an Advance on.)*

## Home and filing

23. Home is three lists: Waiting for invoice, Ready to file, Filed awaiting money; plus the Advance block when on.
24. Review happens at filing time, in one sitting: the Claimant reviews all ready-to-file Bills, then the filled form and the mail breakdown.
25. Mail: the primary path is a Gmail draft (Gmail compose scope) with the form PDF and Bill files attached and the breakdown as body. Fallback: download a zip of all files plus a "copy body" button. If Gmail is blocked, an `.eml` file. A later path: the Claimant's Claude Code (MCP) using its Gmail connector to prepare the draft. Past batches reach about 22 MB raw, near Gmail's 25 MB limit after encoding; this is open for the mail step. *(The size sentence is superseded by 37 and 38.)*
26. **Standing rule: Dues never sends mail by itself, in any scenario, by any path.** Only drafts or files; the Claimant sends.
27. After the draft or download, Dues asks "Sent it?"; yes marks the Claim submitted.

## Round 2 (owner, 22 Nov 2026)

### Online orders that arrive in parts (resolves the conflict on decision 6)

28. An invoice smaller than the open amount still auto-attaches and splits the Order's expected Bill when the date is within the window AND the order number or the shop matches (the shop includes the platform and learned aliases). Otherwise it attaches to the best candidate with "Check". An exact amount follows decision 6 as written.
29. Marketplace invoices (for example Amazon): the platform is the shop for matching; the "Sold by" seller is detail, so a different seller name never breaks a match. The order number read from the first invoice is saved on the Expense, and later invoices match on it exactly.
30. After an auto-attach Dues says once: "₹2,100 invoice added to <shop> · <what for>. ₹2,770 still expected." with Undo and Move.
31. The Order page: the Payment at the top (amount, date, method, proof, order number), then each Bill (amount, seller, status) with Move to another payment / Detach (becomes its own invoice-only Expense) / Edit (opens review R), then "Still expected ₹x" with "Item cancelled" (expects a Refund of that amount; "Refund received" when it lands) and "No more invoices". A small leftover (for example ₹1 from rounding or a coupon) gets "₹1 left. Close the order?", never closed silently. The leftover threshold is an open question.
32. Invoice before payment still works as W4 step 4 (merge suggestion, one tap, never automatic).

### Reminders, Funds off Advance, moves

33. Only one invoice reminder: 14 days from paid-on. The old 3-day "Bill missing" rule is removed.
34. Funds and Purposes work the same whether a Claimant's Advance is on or off.
35. Moving an Expense to another Purpose or Fund while its Bill is on a draft Claim takes the Bill off that draft and onto the draft Claim of its new Fund.
36. Registering Dues with Google for Gmail drafts is parked (owner: later). It stays an open question.

### Attachments

37. The claim mail and package carry the original files, untouched: the PDF or image as shared, never a copy with reading boxes.
38. Mail attachments are base64-encoded, which adds about a third, and Gmail's 25 MB limit applies to the encoded mail, so the target is about 18 MB of raw files. If over, Dues shrinks the largest images first, then scanned PDFs, until it fits; text PDFs are left alone. The filing review lists every file shrunk ("3 photos made smaller to fit 25 MB"). The originals in paperless never change. Still too big after shrinking: Dues offers to split the Claim into two mails. Open: confirm the limit with one real ~22 MB test draft.

### Funds (new glossary term; replaces "Paid from: Advance | Other fund")

39. A Fund is where the money comes from and how it is claimed. Settings → Funds. Each Fund has: a name; a mail builder (To, CC, subject, body) with variables Dues fills: {claimant}, {claim_name}, {total}, {total_in_words}, {bill_count}, {date_range}, {purpose}, {breakdown}; notes, shown only to Dues users, never in mail or form; a form template (Word file with placeholders; the PDF is made from it as already decided in the spec); a file-name pattern (47); a claim-name pattern such as {Month}{n} (for example "September1"); a "What for?" hint shown as grey example text on the upload prompt; Archive (hidden from the prompt, history kept).
40. Nothing goes into the mail subject or body unless the Fund's template puts it there. The Claimant sees the draft and can edit it before it is made. Dues never sends (26 stands).
41. The Funds page shows a preview of the form and the mail side by side, filled from a sample claim, with a switch "Use my last claim".
42. Makerspace is a Fund like any other, first by default, its template starting as today's Contingency Reimbursement Form. Each Fund files as its own Claim. The claim total is always rounded up to the rupee, for every Fund (not a Fund setting). No budget or cap for now.
43. A Purpose is now an optional group inside a Fund: a name and its Fund. Purposes are breakdown groups inside that Fund's Claim. Active Purposes keep 16 (zero or more active; one active catches new payments; two or more are offered as choices) and an active Purpose preselects its Fund. Which Fund a new Purpose starts on is an open question.
44. The upload and payment prompt shows Funds as choices in the Claimant's own order, Makerspace first and preselected. Each Claimant orders and hides Funds for themselves only.
45. The Advance lives inside a Fund: a personal amount on a Fund, never shared, off by default. The chip reads "Makerspace" and, with the Advance on, "Makerspace · Advance". Home's Advance block (22's colours and sentence) is per Fund with an Advance on.
46. Sharing: a new Fund is private to its creator; "Share with team" makes it a team Fund. The team version is edited by an admin and the Fund's creator. Anyone can make "my version" of a Fund's mail, form, file-name pattern or hint; it overrides only for them, with "Reset to team version". When the team version changes under a personal version, that person sees one line: "Team version updated. Compare". A filed Claim keeps a snapshot of the template version it used; later edits never change past Claims.

### File naming

47. File-name pattern variables: {purpose}, {what}, {vendor}, {person}, {n}, {kind}. {what} is the Bill's description, which defaults to the Expense's "what for". {kind} is "Invoice", "Bill", or "Payment" for a payment proof used as the Bill. An empty part is dropped with its separator. {n} is added only when two names in one Claim would clash, in one numbering style. Makerspace default: `{purpose} - {what} {kind}` (gives "Solder Invoice", "Club - Acrylic Beads Invoice"). Every file name is shown at filing review and can be edited for that one file; an edited name is kept.

## Still open

- Gmail compose scope: whether the university Workspace allows it (being checked).
- Registering Dues with Google for Gmail drafts: parked, later (36).
- Attachment limit: confirm with one real ~22 MB test draft (38).
- Leftover threshold for "₹1 left. Close the order?" (31), and what "No more invoices" and "Close the order?" do to the remaining amount.
- Which Fund a new Purpose starts on (43).
- Whether the Claimant's Approvers list stays in the profile beside each Fund's To and CC (39).
- The designer shapes the home screen and the filing flow.
- Per-Purpose approvers, later.
