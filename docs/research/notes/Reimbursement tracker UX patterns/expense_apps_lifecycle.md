# Expense app lifecycle, attention queues, receipt matching and report submission UX

Scope note: built from ~17 tool calls, mostly vendor help centres (primary). Help-centre pages rarely state colours, row layout or cadence; those are listed under Gaps rather than guessed. Pages are 2024-2026 New Expensify unless marked Classic.

## 1. How do these apps represent expense/report status and lifecycle (states, badges)?

### Takeaway
Two-level model is universal: a loose expense has a pre-report state (Zoho "Unreported"), and once attached to a report it inherits the report's status. Report ladders converge on Draft -> Submitted/Outstanding -> Approved -> Paid/Reimbursed (-> Done/Archived). The only badge explicitly documented is Expensify's "Fix" attention badge; colour semantics are not documented in any help page found.

### Cited Findings
- Expensify New renamed statuses: Open->Draft, Processing->Outstanding, Reimbursed->Paid, Closed->Done, Approved unchanged. Classic defined Outstanding as submitted and awaiting approval — [Expensify Understanding Report Statuses (search summary)](https://help.expensify.com/articles/new-expensify/reports-and-expenses/Understanding-Report-Statuses-and-Actions); [Classic statuses](https://help.expensify.com/articles/expensify-classic/reports/Report-statuses)
- New Expensify definitions: Draft = unsubmitted, still editable; Submitted = awaiting approval from another person; Outstanding = in progress (under review, on hold, partly complete); Approved = ready for payment or export; Paid = "All actions are complete"; Done = locked, no further edits or deletions — [Expensify New statuses](https://help.expensify.com/articles/new-expensify/reports-and-expenses/Understanding-Report-Statuses-and-Actions)
- Paid has sub-stages shown on hover (web): "Marked as paid" (paid outside Expensify), "Withdrawing" (funds being pulled from bank), "Confirmed" (reimbursement confirmed) — same page. Directly relevant: a "paid out-of-band, awaiting confirmation" intermediate state.
- Reports in Draft or Outstanding can be deleted; Done or Paid cannot — [Expensify New statuses (search summary)](https://help.expensify.com/articles/new-expensify/reports-and-expenses/Understanding-Report-Statuses-and-Actions)
- Primary action button per state in Expensify (inferred by the fetch tool, not stated): Draft -> Submit; Approved -> Pay/Export; anything with holds/violations/duplicates -> Review button carrying a "Fix" badge. Green = primary action, grey = More — same page.
- Zoho expense-level statuses: Unreported (not on a report), Unsubmitted (on a Draft report), Expired (not approved before admin-set expiry); once on a report the expense takes the report's status — [Zoho expense status](https://www.zoho.com/us/expense/kb/expenses/expense-status/)
- Zoho report statuses: Draft, Awaiting Approval, Recalled (pull back to edit), Approved, Rejected, Reimbursed ("admin will mark the report as reimbursed"); Archived also exists per search summary — [Zoho report status](https://www.zoho.com/us/expense/kb/reports/status-of-reports/)
- Expensify: for reports containing only non-reimbursable expenses (e.g. company card), Approved is the final status — [Expensify statuses summary](https://help.expensify.com/articles/new-expensify/reports-and-expenses/Understanding-Report-Statuses-and-Actions)
- SAP Concur: a card/available item stays in "Available Expenses" until added to a report; users can mark "Personal Expense (do not reimburse)" (user forum, secondary, config-dependent) — [Concur community](https://community.concur.com/t5/Concur-Expense-Forum/Duplicate-Charge-showing-under-available-expenses-but-not-under/m-p/40267)

### Inferences
- For a single-user tracker, a clean lifecycle is: Purchased (unreported) -> Awaiting delivery -> Awaiting invoice -> Ready to claim -> In claim (Draft) -> Submitted -> Paid (with optional "Confirmed"). Expense inherits claim status once batched (Zoho model).
- Expensify's Paid sub-stages (Marked as paid / Withdrawing / Confirmed) map to "money sent" vs "money seen in my account".
- Zoho "Recalled" suggests an explicit "pull back claim to edit" action rather than silently editing submitted claims.

### Gaps
- No badge colours documented for Expensify, Zoho, Ramp (help pages are silent). Would need screenshots/live product.
- Brex, Navan, Pleo, Spendesk, Concur official status-name pages not retrieved.

## 2. How do they surface "needs attention" items (missing receipt/memo, violations) and nudge?

### Takeaway
Pattern: a dedicated "missing items / to-dos" block on the home screen, per-field red "(required)" markers, and channel-appropriate nudges (SMS for in-person, email/chat for online). Navan frames it as "To dos" with typed reasons; Expensify uses one "Fix" badge. Best queues hold only items needing human judgment.

### Cited Findings
- Ramp: "Missing items" section on homepage plus My expenses; each unmet required field shows a red "(required)" label; mobile push for receipt/memo reminders is off by default — [Ramp support: submitting receipts, memos](https://support.ramp.com/hc/en-us/articles/360042588454-Submitting-receipts-memos-and-accounting-for-your-Ramp-transactions)
- Ramp: pre-filled memos need review (opening the transaction or clicking the memo field counts); auto-filled memos (SaaS, fuel, parking) don't; suggested accounting category must be confirmed; prefilled fields get a brief animation on homepage and a marker on detail page; card lock may take up to an hour to clear after completion — same page.
- Ramp: "I don't have a receipt" in the transaction Options menu; via SMS reply "OOPS" starts a policy exception request — [Ramp support](https://support.ramp.com/hc/en-us/articles/360042588454-Submitting-receipts-memos-and-accounting-for-your-Ramp-transactions) and [search summary of Ramp SMS docs](https://support.ramp.com/hc/en-us/articles/1500011601642-What-to-do-if-you-re-missing-a-receipt)
- Ramp channel routing: in-person purchases -> SMS by default; online -> email or Slack/Teams/Google Chat; text reminders for online purchases opt-in — Ramp support page above. Cadence not specified there; Ramp blog claims reminders continue until the receipt is submitted (marketing, unverified in docs) — [Ramp blog](https://ramp.com/blog/receipt-compliance/send-automated-reminders-when-receipts-are-overdue)
- Ramp design stance: "automated, conversational, and — whenever possible — invisible"; claims completion "in under 15 seconds" (vendor claim, no methodology) — [Ramp blog](https://ramp.com/blog/how-ramp-users-finish-expenses-in-15-seconds)
- Navan To dos (secondary, GitLab internal guide via search summary): "To dos" area at top; categories: Missing receipt (policy-driven), Info needed (approver asked for more), Needs your review (custom field on card txns); Drafts as a separate folder — [GitLab Navan guide](https://handbook.gitlab.com/handbook/business-technology/enterprise-applications/guides/navan-expense-guide/) (page body not fully read; taken from search summary)
- Navan exceptions queue (admin side, primary blog): each row = flagged transaction + suggested action + rationale citing policy + status such as "Info requested" / "Flagged"; in-policy items never reach the queue; when employee answers, item returns to queue or completes automatically — [Navan blog](https://navan.com/blog/expense-exceptions-queue)
- Expensify: a "Fix" badge appears on the Review button / on the chat in Inbox when something needs attention (holds, violations, duplicates) — [Expensify statuses](https://help.expensify.com/articles/new-expensify/reports-and-expenses/Understanding-Report-Statuses-and-Actions); [Expensify duplicate detection](https://help.expensify.com/articles/new-expensify/reports-and-expenses/Duplicate-Detection)
- Pleo: spender reminders by push (most reliable) or email, triggered when an expense lacks receipt and is incomplete; admins get weekly missing-receipt summary emails; optional Automatic Card Freeze after a threshold plus grace period — [Pleo help](https://pleohelp.freshdesk.com/support/solutions/articles/103000402666-missing-receipt-reminders)
- Spendesk: controllers send reminders manually or automatically; marking receipt "cannot be provided" stops all future reminders for that payment — [Spendesk help](https://helpcenter.spendesk.com/en/articles/4153508-missing-receipts-send-reminders)
- Brex: Slack alerts for missing receipts, resolvable by replying in thread — [Brex support search result](https://www.brex.com/support/receipts-for-expenses)
- Pleo: Expenses tab filter "Missing receipt" then "Ask for more info" — [Pleo blog](https://blog.pleo.io/en/mastering-month-end)

### Inferences
- For a personal tracker, "attention" should be typed, each with a single next action: Awaiting delivery overdue, Invoice missing, Ready to batch, Claim unsent, Claim unpaid past N days. "Cannot provide / dismiss" escape hatch (Ramp "I don't have a receipt", Spendesk "cannot be provided") that stops nudges is worth copying.
- Navan/Ramp principle: items that need no human judgment never enter the queue.
- Red "(required)" inline marker + home-screen aggregation is the cheapest pattern.

### Gaps
- Exact nudge cadence for Ramp SMS is undocumented in help pages.
- Concierge/Inbox "to-do" behaviour: two Expensify Inbox URLs 404 and the statuses page does not mention Inbox/To-do; not confirmed.
- Brex "missing receipt queue" as named screen not found.

## 3. Receipt capture and matching (SmartScan, forwarding, auto-match, unmatched display)?

### Takeaway
Receipts enter by camera, email forward, SMS/MMS, inbox integration; matching keys on amount + merchant/date (+/-1 day) and sender identity. Unmatched receipts live in a holding place (Brex Wallet "View unmatched receipts"; Expensify "awaiting merge" scan state). Failure modes are documented and instructive.

### Cited Findings
- Ramp matching uses amount, merchant, transaction date, card info; receipt dated within one calendar day counts; sender must be known email; can match pending transactions; most match within seconds, image/PDF-only need OCR (minutes); Amazon order confirmations don't auto-match (amount may change) — [Ramp troubleshooting matching](https://support.ramp.com/troubleshooting-transaction-receipt-matching)
- Ramp failure outcomes: no receipt on txn (matched another same-vendor txn), wrong txn (delete and reattach), no match (attach manually or forward to missedreceipts@ramp.com); fails when dates differ, one receipt covers multiple charges, lookalike recurring charges; one receipt can attach to multiple transactions; user notified by SMS/email on match — same page and [Ramp support](https://support.ramp.com/hc/en-us/articles/360042588454-Submitting-receipts-memos-and-accounting-for-your-Ramp-transactions)
- Ramp SMS: text receipt photo to Ramp number; any text added becomes the memo; texts with no pending request attach to most recent transaction — Ramp support page above
- Ramp camera-roll auto-match feature exists; nothing is uploaded until user reviews and confirms — [Ramp: camera roll](https://support.ramp.com/auto-match-receipts-from-your-camera-roll) (via search summary)
- Brex: forward to receipts@brex.com from an address on the account; only receipts under two months old auto-match; fall back to manual attach — [Brex receipts](https://www.brex.com/support/how-do-i-auto-forward-my-receipts)
- Brex Wallet "View unmatched receipts" (early access): assign an unmatched receipt to an expense, or use it to create a reimbursement; receipts can be sent by text, email, WhatsApp — [Brex announcement](https://www.brex.com/product-announcements/manage-your-unmatched-receipts-in-one-place)
- Expensify SmartScan (secondary, search summary of help/community): receipt shows "Scanning" after upload; held "awaiting merge with card transaction" for seven days counted from expense date; "Mark as Cash" clears awaiting-merge; failure message "Receipt scanning failed" with Replace option; manual Merge by selecting receipt + card expense — [Expensify SmartScan troubleshooting](https://help.expensify.com/articles/new-expensify/reports-and-expenses/Troubleshoot-SmartScan-Issues); [Expensify merging](https://help.expensify.com/articles/new-expensify/reports-and-expenses/Merging-expenses); [community](https://community.expensify.com/discussion/717/smartscanned-receipts-now-merge-with-submitted-card-transactions)
- Ramp inbox integration: Gmail/Outlook connect; claim "70 percent-plus of receipts are matched within 24 hours" (vendor claim) — [Ramp blog](https://ramp.com/blog/how-ramp-users-finish-expenses-in-15-seconds)

### Inferences
- Single-user analog: an invoice inbox (forwarded email / dropped PDF) with suggested matches to open items by amount and vendor, +/-1-day date tolerance; a visible "unmatched invoices" tray; explicit "mark as no invoice needed".
- Order-confirmation vs final invoice amount mismatch (Amazon) is exactly the user's "wait for delivery, then collect invoice" case: match on invoice, not order confirmation.

### Gaps
- No row-level field list for Brex unmatched receipts.
- Expensify SmartScan statuses came via search summary, not full page fetch.

## 4. Duplicate detection UX

### Takeaway
Flag, hold, side-by-side review, resolve with Keep all / Keep selected. Concur treats duplicates as soft warnings; Expensify blocks (hold) until resolved.

### Cited Findings
- Expensify: flagged expense is put on hold; "Fix" badge in Inbox chat; expense labelled "Potential duplicate"; "Review duplicates" screen lists matches with radio to choose which to keep; if category/tags differ, choose values; Confirm removes hold; options Keep all / Keep selected — [Expensify duplicate detection](https://help.expensify.com/articles/new-expensify/reports-and-expenses/Duplicate-Detection)
- Expensify matches on amount, currency, date; may auto-dismiss clear non-duplicates with note that Concierge resolved it plus an "Explain" link; resolving only possible on Draft/Outstanding reports (retract to edit) — same page
- Concur: duplicate exceptions are warnings, not hard stops; do not notify finance — [Concur community](https://community.concur.com/t5/Concur-Expense-Forum/duplicate-expenses/m-p/10513) (forum, secondary)

### Inferences
- Soft flag + two-choice resolve (keep both / merge) is enough; show amount, date, vendor side by side.

### Gaps
- Ramp/Brex/Zoho duplicate UX not found.

## 5. Report/batch building, submit flow, totals and completion display

### Takeaway
Loose items -> add to report (Draft) -> Submit -> Approved -> Paid. Submit is the green primary action; reports are editable until submitted and can be recalled/retracted.

### Cited Findings
- Expensify Draft is editable; Submit is primary action; Mark as done when no approval workflow; Paid shows sub-stage on hover — [Expensify statuses](https://help.expensify.com/articles/new-expensify/reports-and-expenses/Understanding-Report-Statuses-and-Actions)
- Zoho: expenses in Draft report = Unsubmitted; Recalled state to edit after submit; admin marks Reimbursed — [Zoho report status](https://www.zoho.com/us/expense/kb/reports/status-of-reports/)
- Concur: Available Expenses pool selected into a report; "Personal Expense (do not reimburse)" checkbox — [Concur community](https://community.concur.com/t5/Concur-Expense-Forum/Duplicate-Charge-showing-under-available-expenses-but-not-under/m-p/40267)
- Navan: Drafts are a separate folder; open a draft, add missing details/receipts, submit or save for later — [GitLab Navan guide (search summary)](https://handbook.gitlab.com/handbook/business-technology/enterprise-applications/guides/navan-expense-guide/)

### Inferences
- Only items past "invoice collected" should be selectable into a claim; show claim total live and per-status subtotals (owed / submitted / paid).

### Gaps
- Totals/header layout of report screens not documented in help text; would need screenshots.

## 6. List density: table vs cards, fields per row

### Takeaway
Not answerable from help text.

### Cited Findings
- Ramp article mentions memo field, receipts, required labels, suggested accounting codes and Options menu but not row layout — [Ramp support](https://support.ramp.com/hc/en-us/articles/360042588454-Submitting-receipts-memos-and-accounting-for-your-Ramp-transactions)
- Navan exceptions row = suggested action + rationale + status — [Navan blog](https://navan.com/blog/expense-exceptions-queue)

### Gaps
- Table vs card, mobile density and per-row fields for all vendors: no primary source found; needs live screenshots.

## 7. Published design rationale

### Takeaway
Rationales found are thin and promotional: meet users in existing channels, automate, show only exceptions.

### Cited Findings
- Ramp: "automated, conversational, and — whenever possible — invisible"; "No additional logins or switching between tools" — [Ramp blog](https://ramp.com/blog/how-ramp-users-finish-expenses-in-15-seconds)
- Navan: "AI Assisted, Human Controlled"; 91% of suggested actions accepted over three months (vendor stat) — [Navan blog](https://navan.com/blog/expense-exceptions-queue)
- Pleo: new accounting dashboard groups missing receipts and pending approvals under "needs attention" — [Pleo blog](https://blog.pleo.io/en/new-in-pleo-october) (via search summary)

### Gaps
- No genuine design-team write-ups (typography, density decisions) found.
