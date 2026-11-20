# Tracker DB owns expense status; paperless-ngx owns documents

The tracker keeps its own database of Expenses, Refunds, Claims and Statement lines, and is the only place their status lives. paperless-ngx stores the documents (bills, payment screenshots, statements, claim forms) and is referenced by document ID. We chose this over putting status, amounts and claim membership into paperless custom fields because an Expense must exist the moment money leaves the account, often days before any document does, and paperless can only hold records that are documents.

## Considered Options

- **Paperless only** (custom fields for amount, stage, claim; no separate DB): rejected. Every payment would need a placeholder document, partial cancellations and refunds have no natural home, and statement reconciliation would be querying documents for things that are not documents.

## Consequences

- Documents are linked by paperless document ID; the tracker never copies file contents into its own store.
- Paperless metadata the tracker writes (tags, custom fields) is a convenience for browsing inside paperless, not the record of truth. If the two disagree, the tracker wins.
