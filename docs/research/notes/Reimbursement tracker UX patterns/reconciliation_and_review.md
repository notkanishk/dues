# Transaction review inboxes, statement import/reconciliation, rules, matching, paperless-ngx and Linear patterns

Method note: pages were read via WebFetch (summarised by a small model) or WebSearch snippets; wording is paraphrased. Several official pages returned 403/404 (paperless docs site, Firefly III docs, Monarch help, Linear configuring-workflows), so paperless facts come from the GitHub raw docs (dev branch) and Firefly III facts from search snippets only. Dates: most docs are undated "current" versions; Monarch's review announcement is April 2022 (older).

## 1. Transaction review queue designs (needs review / unreviewed / approve), bulk review, shortcuts

### Takeaway
Every app separates "money data exists" from "a human has confirmed it": imported rows start in an unreviewed/unapproved state, a dashboard card or banner surfaces the count, and a one-key or one-click action clears each row. Rules can pre-clear or pre-flag rows. Keyboard review is documented clearly only for Copilot (Mac) and Linear.

### Cited Findings
- Lunch Money: bank-synced transactions start unreviewed, manually created ones start reviewed. Review one row via a check icon in the far-right column (gray = unreviewed, green = reviewed). Bulk: tick row checkboxes then "Mark reviewed", or click the column-header check to review everything in the current view (with confirmation). — [Lunch Money transaction status](https://support.lunchmoney.app/finances/transactions/transaction-status)
- Lunch Money auto-review settings: "auto-review on update" (editing date, amount, category, payee, notes or account marks the row reviewed) and "auto-review on manual creation"; both are overridden by rules (e.g. rule marking all of one account reviewed). — [Lunch Money transaction status](https://support.lunchmoney.app/finances/transactions/transaction-status)
- Lunch Money rule actions include "mark as reviewed" / "mark as unreviewed", add tags, link to recurring item, split, set category/payee/notes. — [Lunch Money rules](https://support.lunchmoney.app/setup/rules)
- Copilot Money: Dashboard "To Review" section collects newly imported transactions; "Mark as Reviewed" dismisses after you confirm category and name (secondary summary of help article). — [Copilot dashboard article](https://intercom.help/copilotmoney/en/articles/6045480-dashboard-tab-overview)
- Copilot Mac "To Review" card is capped at 25 items, added to stop users accidentally reviewing 100+ at once (from search snippet of Copilot's own post). — [Copilot dispatch: To Review card for Mac](https://www.copilot.money/dispatch/to-review-card-for-mac)
- Copilot Mac keyboard: arrows move through the list, X selects, R marks Reviewed, C changes category, F opens Filters, Cmd+A / Cmd+Shift+A select/deselect all. Mobile: long-press enters multi-select; a Bulk Edit bar appears at the bottom, whose options depend on the selected transactions' state. — [Copilot bulk editing](https://help.copilot.money/en/articles/7668990-bulk-editing-transactions)
- Monarch "Transaction review" (April 2022): transactions can be marked needs-review or reviewed, manually or via if-then rules; a dashboard card lists those needing review; optional email/push alerts; example rules flag super-store purchases (to split), large transactions, unused accounts, Venmo (bill splitting); alerts can be limited to transactions rules didn't process. Page mentions no keyboard shortcuts. Older (2022). — [Monarch: Transaction review](https://www.monarch.com/blog/transaction-review)
- YNAB: imported transactions are "unapproved" and still affect the plan until approved (pending ones excepted). Web shows a blue banner "[#] new transactions to approve or categorize" that filters the register; unapproved rows carry a circled "i" icon; multi-select via checkboxes for bulk approve/reject; mobile shows a "[#] New transactions" banner on Home; approve/reject buttons appear only when applicable. No keyboard shortcuts documented. — [YNAB approving and matching](https://support.ynab.com/en_us/approving-and-matching-transactions-a-guide-ByYNZaQ1i.md)

### Inferences
- For the reimbursement tracker the natural analogue is: imported debit = "unclassified" (not lab/personal yet); one key to set lab, one for personal, one to skip/snooze; header badge count plus a bulk "mark all in this view" with confirmation.
- Copilot's 25-item cap and Lunch Money's confirm-on-bulk are explicit guards against accidental mass-review; worth copying for a financial classification action.
- Auto-review-on-edit (Lunch Money) means classifying a row implicitly clears it, so the user never does two steps.

### Gaps
- Official Monarch "Needs review" help page (help.monarch.com) returned 403; keyboard/bulk review in Monarch unverified.
- No official source found for Lunch Money keyboard shortcuts on the transactions page.

## 2. Statement/CSV import UX: column mapping, dedupe, reconciliation

### Takeaway
Mature importers offer a mapping step (column to field, date format, delimiter, sign flip, split debit/credit), then dedupe by a source id when present or else by fuzzy date+amount(+payee). Reconciliation is a separate ritual: mark rows cleared until the difference to the statement balance is zero, then lock.

### Cited Findings
- Actual Budget import (per account, "Import" button): CSV, QIF, OFX, QFX, CAMT; OFX/QFX recommended as richer. CSV dialog has a "CSV Fields" dropdown per column, date-format selector (green preview date shows if wrong), delimiter, "Flip amount", "Split amount into separate inflow/outflow columns", "Multiply amount". — [Actual: importing](https://actualbudget.org/docs/transactions/importing/)
- Actual dedupe: for OFX/QFX checks transaction id first, then similar date + same amount + similar payee (fuzzy). Imported transactions take precedence; a matching manual entry gets its date updated to the import date. "Merge with existing transactions" option; "Reimport deleted transactions" checked by default for file imports (uncheck so deleted lines do not reappear). — [Actual: importing](https://actualbudget.org/docs/transactions/importing/)
- YNAB file import match: imported vs manually entered match if amounts identical and dates within 10 days; match auto-approves, keeps the bank's amount but your date/payee/memo; matches can be undone ("unmatch") or made manually within the same register. — [YNAB approving and matching](https://support.ynab.com/en_us/approving-and-matching-transactions-a-guide-ByYNZaQ1i.md)
- YNAB reconcile: cleared items show green "c", pending grey "c"; web Reconcile button (top right); compare YNAB cleared balance with bank; if mismatch enter bank balance; if unresolved it creates a "Reconciliation Balance Adjustment" ("Create Adjustment & Finish"). Reconciled rows get a lock; locked rows cannot be unreconciled; YNAB will not import transactions dated more than 3 days before the last reconciled transaction (duplicate guard). Recommends reconciling at least weekly. Filter via "is: Uncleared". — [YNAB reconciling accounts](https://support.ynab.com/en_us/reconciling-accounts-a-guide-BJFE3fHys.md)
- Actual reconcile: new/unmatched rows have grey circle, click to turn green (cleared); header balance expands to show cleared vs uncleared totals; lock icon starts reconciliation, prompts for statement balance (negative for credit accounts); a bar shows the remaining difference; at zero shows "All reconciled!" and a "Lock transactions" button; locked rows show lock, unlocking returns them to Cleared, editing a locked row warns. — [Actual: reconciliation](https://actualbudget.org/docs/accounts/reconciliation/)
- Firefly III data importer (search snippet of official docs, page itself 403): two dedupe methods — content hash ("classic", computed after mapping/roles applied, so changing column roles changes the hash; later edits or rule changes do not alter it) and identifier-based "cell" method using a unique column; "none" disables. Roles tell importer what each column means; mapping links values to existing data (amount cannot be mapped). — [Firefly III duplicate detection](https://docs.firefly-iii.org/references/data-importer/duplicate-detection/) , [roles](https://docs.firefly-iii.org/references/data-importer/roles/)

### Inferences
- The bank's Excel export and the credit card's PDF statement likely have no stable txn id; use a derived hash (date, amount, narration, running balance) stored per line, and keep the same parse so the hash is stable (Firefly's warning about role changes altering the hash applies).
- Reconcile analogue: per statement, "sum of classified + skipped = statement total" check with a visible remaining-difference bar (Actual) and a lock once the month is filed (matches the existing Working to Filed flow).

### Gaps
- Firefly III import docs pages and mapping-step UX not read directly (403); relies on search snippets.
- YNAB file-import guide URL returned 404; column-mapping UX for YNAB not captured.

## 3. Rules / auto-categorisation UX

### Takeaway
Rules are created from a corrected transaction ("always do this for payee X"), shown with a list of affected existing rows to confirm, and apply to future imports. Match on the raw bank text, not the edited name.

### Cited Findings
- Actual: rules run on import in three stages (pre/default/post), specificity ranks within a stage ("is" above "contains"); operators include is, contains, matches (regex), one-of, between; fields include imported payee (original bank text, preferred for stability), payee, account, category, notes, amount, cleared. Rule editor lists matching existing transactions and "Apply actions" can be run on a selection; also usable as batch editor. Actual auto-offers rules: renaming a payee prompts to save a pre-stage rename rule; categorising creates/updates a default-stage rule setting the payee's most common category. — [Actual: rules](https://actualbudget.org/docs/budgeting/rules/)
- Lunch Money: "Create a Rule" in the Transaction Details side panel; also auto-created when category changes (can be disabled), suggested payee-rename rules in a "Suggested Rules" view; conditions payee (contains/starts with/exact), category, notes, amount range, day range, account; priority 1–20 (default 10), additive; "Create & Apply" / "Save and Apply" shows affected transactions with ability to deselect some before applying retroactively; optional "Run rule on transaction updates". — [Lunch Money rules](https://support.lunchmoney.app/setup/rules)
- Copilot: when changing a category you can create a rule from transaction name (exact or partial) or bank category; applies to past and future transactions, cannot be undone, and the help text says to review the listed transactions before confirming; a new rule for the same merchant overwrites the older. Amount/original-name/card-based rules are only roadmap requests. Copilot Intelligence (ML) learns from category reviews without rules. — [Copilot category rules (search snippet of help)](https://www.copilot.money/dispatch/transaction-category-rules) , [Copilot Intelligence](https://copilot.money/intelligence) , [feature request](https://roadmap.copilot.money/feature-requests/p/set-category-rules-based-on-amount)
- Monarch: rules can set review status (see section 1). — [Monarch: Transaction review](https://www.monarch.com/blog/transaction-review)

### Inferences
- "Always treat payee X as lab" = rule on the statement narration substring that sets the classification (lab/personal) and optionally marks it reviewed; consider two confidence tiers: auto-apply and "suggested, needs one-tap confirm" (Copilot ML/Lunch Money Suggested Rules).
- Show a preview list with per-row deselect at rule-creation time; Copilot's irreversibility warning argues for an undo or at least a visible "applied by rule" marker.
- Amount-sensitive rules matter for a lab/personal split (same merchant, both uses); Copilot lacks this and users ask for it.

### Gaps
- Monarch rule-creation UI details not fetched. Copilot name-rule help article (3971270) not fetched directly.

## 4. Matching a transaction to an existing record or receipt (split, link, unmatched)

### Takeaway
Finance apps match bank rows to manual/expected entries on exact amount plus a date window and keep both the bank amount and the user's metadata; unmatched rows stay in the review state. Splitting is a rule/row action.

### Cited Findings
- YNAB match: same amount, dates within 10 days, auto-approves, bank amount wins, user date/payee/memo kept, unmatch available. — [YNAB approving and matching](https://support.ynab.com/en_us/approving-and-matching-transactions-a-guide-ByYNZaQ1i.md)
- Actual: matching imported to existing manual entry updates the date to the import date (fuzzy payee). — [Actual: importing](https://actualbudget.org/docs/transactions/importing/)
- Lunch Money: rules can link a transaction to a recurring item or split it; users have requested linking transactions to a recurring item from the Recurring page (feature request, search result). — [Lunch Money rules](https://support.lunchmoney.app/setup/rules) , [feedback post](https://feedback.lunchmoney.app/transactions/p/allow-finding-and-linking-transactions-to-their-recurring-item-from-the-recurrin)
- Copilot: recurrings created from a single transaction or all transactions sharing a name; match on the stable part of the name. — [Copilot create recurrings](https://help.copilot.money/en/articles/3760068-create-recurrings)
- Splitwise: official row layout not found; secondary sources say default equal split with exact/percent/shares options and a running balance with "Settle up". — secondary: [TapSmart Splitwise guide](https://www.tapsmart.com/tips-and-tricks/splitwise-guide/)

### Inferences
- Tracker match logic: exact amount (or within tolerance for forex on the credit card) plus date window (YNAB uses ±10 days); candidates list ranked, one-tap link, "unlink" always available; keep statement amount as authoritative and invoice amount as secondary field with a mismatch flag.
- A reimbursement "partial lab" debit maps to Splitwise/Copilot-style splits.

### Gaps
- No primary source on Splitwise UI; Monarch split/"Smart Split" and Firefly III split transaction UX not verified.

## 5. paperless-ngx: inbox tag, workflows, custom fields, API, mobile/share

### Takeaway
Paperless supplies nearly everything needed to link from another app: inbox-tag convention, a custom-field query API, a token-authenticated upload endpoint that returns a task id, and Document Link / Monetary custom fields.

### Cited Findings
- Inbox tag: recommended to create a tag auto-assigned to all new documents and remove it after processing; suggestions are fetched automatically for documents still carrying an inbox tag (can disable in Settings). — [paperless usage.md](https://raw.githubusercontent.com/paperless-ngx/paperless-ngx/dev/docs/usage.md)
- Workflow triggers: Consumption Started, Document Added, Document Updated, Scheduled, Manual. Filters: source (consume folder, API/web UI, mail), filename/path wildcards, mail rule, content match, plus tags any/all/none, document type, correspondent, storage path, custom field query. Actions: Assignment, Removal, Email, Webhook, Move to Trash, Password Removal, Remote OCR, Apply AI Suggestions; assignments run in order, later override, tags/custom fields/permissions merge. — [paperless usage.md](https://raw.githubusercontent.com/paperless-ngx/paperless-ngx/dev/docs/usage.md)
- Custom field types: Text, Boolean, Date, URL, Integer, Number, Monetary (ISO 4217 code, two decimals), Document Link (symmetrical reverse link), Select; data type is immutable after creation. — [paperless usage.md](https://raw.githubusercontent.com/paperless-ngx/paperless-ngx/dev/docs/usage.md)
- Mail rules: accounts + ordered rules fetch attachments, actions delete/mark read/flag/move/tag, default check every 10 minutes (PAPERLESS_EMAIL_TASK_CRON), processed mail tracked by UID, OAuth2 for Gmail/Outlook. — [paperless usage.md](https://raw.githubusercontent.com/paperless-ngx/paperless-ngx/dev/docs/usage.md)
- Dashboard shows nothing by default; saved views can be added to it (dynamic). Shift+? shows area-specific hotkeys. Public share links (optional expiry) and ZIP bundles. — [paperless usage.md](https://raw.githubusercontent.com/paperless-ngx/paperless-ngx/dev/docs/usage.md)
- REST: token via POST /api/token/, header `Authorization: Token <token>`. POST /api/documents/post_document/ multipart with `document`, optional title, correspondent, document_type, tags (repeat), custom_fields (id array or id->value object), created, archive_serial_number; returns task UUID; poll GET /api/tasks/?task_id=<uuid> to get the created document id. — [paperless api.md](https://raw.githubusercontent.com/paperless-ngx/paperless-ngx/dev/docs/api.md)
- Querying: `query` (full-text), `custom_field_query` JSON like ["field","exact","x"] with operators exact/in/isnull/exists, icontains etc., gt/lt/range for numbers/dates (relative dates supported), `contains` for document links. Bulk edit endpoint POST /api/documents/bulk_edit/ with methods add_tag, remove_tag, modify_tags, modify_custom_fields, etc. — [paperless api.md](https://raw.githubusercontent.com/paperless-ngx/paperless-ngx/dev/docs/api.md)
- Mobile/clients: Swift Paperless (iOS, share extension and scanning); Android "Paperless NGX Uploader" uses the system Share menu; Paperparrot (macOS) added an option to remove inbox tags on save; docs point to community wiki for client list. — [App Store: Swift Paperless](https://apps.apple.com/app/swift-paperless/id6448698521) , [F-Droid uploader](https://f-droid.org/de/packages/net.gmartin.paperlessngx_uploader/) , [Paperparrot](https://apps.apple.com/bh/app/paperparrot/id1663665267) , [Swift Paperless repo](https://github.com/paulgessinger/swift-paperless)

### Inferences
- Linking design: store paperless document id on the tracker item; give the tracker a deep link to paperless document and use custom_field_query (e.g. a monetary or text "txn ref" field) or tags to find candidate invoices; use the inbox tag as "invoice not yet linked" queue; an Added workflow can tag email/mobile-consumed invoices automatically.
- Scan/share on phone goes through the paperless clients, so the tracker need not implement upload; optional post_document call is available for in-app upload.

### Gaps
- paperless docs site returned 403; used GitHub dev-branch docs (may be newer than a stable release). is_in_inbox / tags__id__all filter names were not confirmed in fetched text. Notes endpoint, suggestions endpoint and webhooks details not confirmed.
- No primary documentation found on Swift Paperless share-extension inbox-tag behavior.

## 6. Linear: state model, triage, inbox, density and keyboard-first UX

### Takeaway
Linear uses fixed ordered status categories with customizable statuses inside them, a separate Triage inbox with accept/decline/duplicate/snooze on single keys, and list rows controlled by "display properties". Its design posts stress density without noise.

### Cited Findings
- Default workflow order: Backlog > Todo > In Progress > Done > Canceled; teams reorder statuses within a category but categories stay fixed; first Backlog status is default unless another Backlog/Todo status is chosen; duplicates go to Canceled (or a custom Canceled-category status). Status icon/colour specifics not retrieved. (Search snippets of Linear docs.) — [Linear: configuring workflows](https://linear.app/docs/configuring-workflows) ; conceptual overview — [Linear conceptual model](https://linear.app/docs/conceptual-model)
- Triage: issues from integrations, outsiders or in-view creation land in Triage, excluded from normal views unless a status filter includes Triage. Actions: Accept `1` (moves to team default status), Decline `2` (Canceled, optional reason), Duplicate `3` or `MM` (merge into canonical issue), Snooze `H` (until time or new activity). `G` then `T` opens Triage. Business/Enterprise: triage rules (top-down, set status/assignee/label/priority) and Triage Intelligence suggestions of assignee, labels, related/duplicate issues. — [Linear: Triage](https://linear.app/docs/triage)
- Inbox: `G` then `I`; `J/K` or arrows move; `U` toggles read; `Option+U` mark all read; `Backspace` delete; `Shift+Backspace` delete all read; `H` snooze; Cmd/Ctrl+F filters; Priority tab; 2,000 open notification cap; no archive. — [Linear: Inbox](https://linear.app/docs/inbox)
- Display options: list/board toggle `Cmd/Ctrl+B`, `Shift+V` opens display options; display properties choose what shows on a row (ID, status, assignee, priority, project, due date, labels, estimate); grouping/sub-grouping (status, assignee, project, priority, label...); ordering (status, manual, priority, created, updated, due date); filtering vs display distinction. — [Linear: display options](https://linear.app/docs/display-options)
- Design rationale: 2024 redesign cut visual noise and raised hierarchy/density of navigation, Inbox got higher density and better contrast; March 2026 refresh aims for easier scanning, dimmer sidebars, smaller icons, muted inactive text, more vertical padding while keeping information density (secondary summary of Linear posts via search). — [Linear: how we redesigned the UI](https://linear.app/now/how-we-redesigned-the-linear-ui) , [Linear: behind the latest design refresh](https://linear.app/now/behind-the-latest-design-refresh) , [changelog 2026-03-12](https://linear.app/changelog/2026-03-12-ui-refresh)

### Inferences
- Map tracker states onto Linear's categories: Triage = unclassified import; Todo = lab, awaiting invoice/claim; In progress = claim submitted; Done = reimbursed; Canceled = personal/ignored (keep as a visible, reversible state, not deleted). Duplicate-as-merge parallels deduping repeated statement lines.
- Single-digit accept/decline keys, `H` snooze for "decide later", and `G`+letter navigation are directly portable.

### Gaps
- Linear status icons and colours not confirmed from a primary source; the configuring-workflows `.md` page returned 404 and the HTML page's text was not read. Linear's "Triage" as a status type not confirmed beyond the triage doc.
- No dedicated Linear post on list row density found.

## 7. What list rows show; density vs readability

### Takeaway
Finance rows converge on: date, payee/merchant, category, amount, account, plus one compact status glyph at the edge (cleared circle, lock, check, circled "i"). Linear makes row fields user-selectable and keeps hierarchy via muted secondary text.

### Cited Findings
- Status glyphs on rows: YNAB green/grey "c" cleared, lock for reconciled, circled "i" for unapproved; Actual grey/green circle and lock; Lunch Money grey/green check at far right, left checkboxes for selection. — [YNAB reconciling](https://support.ynab.com/en_us/reconciling-accounts-a-guide-BJFE3fHys.md) , [YNAB approving](https://support.ynab.com/en_us/approving-and-matching-transactions-a-guide-ByYNZaQ1i.md) , [Actual reconciliation](https://actualbudget.org/docs/accounts/reconciliation/) , [Lunch Money status](https://support.lunchmoney.app/finances/transactions/transaction-status)
- Linear row fields are toggleable via Display properties. — [Linear display options](https://linear.app/docs/display-options)
- Actual "imported payee" retains the original bank text alongside the edited payee, i.e. row keeps raw narration for matching. — [Actual rules](https://actualbudget.org/docs/budgeting/rules/)

### Inferences
- Suggested row for the tracker: [select box] date | cleaned narration (raw on hover or second muted line) | amount (right-aligned, tabular) | account chip | classification chip (lab/personal/unset) | document-linked icon | status glyph; compact by default with a density toggle.

### Gaps
- Pixel-level row layout of Monarch, Copilot, Lunch Money not found in text docs (would need screenshots). Splitwise row layout not found from a primary source.
