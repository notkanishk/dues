## Why

Makerspace members pay for lab supplies out of pocket and claim the money back from the university, today by hand: a folder of invoices, a Word form, an email, and memory for everything in between. Payments, partial deliveries, cancellations, refunds and paybacks between colleagues get lost, and a Bill can be claimed twice. Dues replaces that with one system of record that follows every Payment until it is reimbursed, for every Claimant. Roadmap phase: **Phase 0–1 (foundation)**; this change defines the whole core and the order it is built in.

## What Changes

- New application **Dues**, multi-Claimant, signed in through Zitadel; access only with the `claimant` role.
- Every **Expense** is logged the moment money leaves a Claimant's account, by sharing a payment confirmation (or a Bill) to paperless-ngx from the phone; nothing else is required.
- Each Expense carries an **Open amount** (`Payment − Σ Bills − Σ Refunds`) and the reason it is still open; Orders split into one Bill per invoice, with cancellations, returns and Refunds.
- Documents are matched to Expenses automatically (suggest, then confirm).
- **Claims** are built in the app: each Fund's form template is filled, rendered to PDF and packaged with the Bills and a mail built from the Fund's template, for the Claimant to send. Funds are where the money comes from; Purposes group Expenses inside a Fund; an Advance is a personal amount on a Fund.
- A cross-Claimant **Ledger** blocks duplicate claims; reminders surface everything that needs attention.
- A Claimant's own Claude Code can read their unconfirmed Bills over MCP (read only) and propose Readings; the Claimant confirms in Dues. MCP is the only door; there is no token API. Maintainer helpers (Back-fill, folder sync, Amazon picks) are not part of this change and return later as their own decision.

## Capabilities

### New Capabilities
- `platform-foundations`: money as integer paise, time rules, append-only audit log, upload validation, backups, deployment shape.
- `identity-access`: Zitadel sign-in, role gate, Claimant profile, user-defined Payment methods, time zone.
- `expense-tracking`: Expense and Bill lifecycles, Orders (partial delivery, cancellation, return), Refunds, Open amount, corrections, closing, Owed to university.
- `document-intake`: paperless webhook, classification, field extraction from payment confirmations and Bills, Readings (provider and the Claimant's own Claude Code over read-only MCP, consent, Disconnect), zero-friction logging, unreadable documents, write-back to paperless.
- `bill-matching`: matching documents to Expenses (one, several, none), Check matches, one Payment for several invoices.
- `paybacks`: Payback Expenses, linking a colleague's Expense, undo, unlinked shared Bills.
- `claims`: building a Claim, form and PDF generation, submission package, naming, rounding, recall, Reimbursement.
- `duplicate-guard`: Ledger, block and warn rules across Claimants, remembered "different" pairs.
- `reminders`: attention rules and Web Push nudges.

### Modified Capabilities
- None (first change).

## Impact

- New repository code (TypeScript only, ADR 0007; Postgres).
- paperless-ngx: OIDC login, per-Claimant users, document types, tags, custom fields, a webhook workflow, a service-account token.
- Zitadel: a "Reimbursements" project with `claimant` and `admin` roles, a confidential web client, and a public PKCE client for iOS uploaders.
- New services on `<APP_HOST>`: the app, Postgres, Gotenberg; served as `dues.example.org` through the internal reverse proxy.
- Supersedes the hand workflow; existing claim history is imported into the Ledger.
- GLOSSARY terms touched: all of them; this change establishes the language.
