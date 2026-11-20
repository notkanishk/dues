# Dues

**Dues ex Machina.** Divine intervention for your reimbursements.

Dues tracks money that makerspace members spend for the lab, from the moment it leaves their account to the day the university pays it back. Online orders that arrive in pieces, cancellations, refunds, colleagues paying each other back, invoices that turn up weeks later: each payment is followed until every rupee is accounted for, and the Contingency Reimbursement Form is filled for you.

> Status: **design and planning.** No application code yet. The functional spec, glossary and decisions are below; the build is planned with OpenSpec.

## How it works

- **Log a payment by sharing it.** Share the payment app's confirmation to paperless-ngx from your phone; Dues logs the Expense immediately. An invoice on its own works too.
- **Follow the money.** Every Expense keeps an *Open amount* (`Payment − Bills − Refunds`) and says why it is still open: goods awaited, refund owed, bill missing.
- **Claim what is ready.** Fulfilled Bills go on a Claim; Dues fills the university form, builds the PDF and the submission email. You send it.
- **Never claim twice.** A cross-Claimant ledger blocks duplicates.

## Documents

| | |
|---|---|
| [GLOSSARY.md](GLOSSARY.md) | The domain language |
| [docs/spec/FUNCTIONAL.md](docs/spec/FUNCTIONAL.md) | Entities, state machines, workflows |
| [docs/adr/](docs/adr/) | Architecture decisions |
| [docs/research/](docs/research/) | UX, stack and fact-check research |
| [`prototype/explorations` branch](../../tree/prototype/explorations/prototypes) | Throwaway mockups and experiments (kept off `main`) |

## Stack (planned)

paperless-ngx for documents · Zitadel (OIDC) for sign-in · Postgres · Docker Compose on a Proxmox LXC behind Caddy. Application stack under evaluation; see [docs/research/notes/Tracker stack choice](docs/research/notes/Tracker%20stack%20choice/).

## License

[MIT](LICENSE)
