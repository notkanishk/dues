# Product

<!-- impeccable:product-schema 1 -->

> Drafted from README.md, GLOSSARY.md, docs/spec/FUNCTIONAL.md and docs/adr/ without an interview. Lines marked **(assumed)** are inferences from the repo and are listed again under Open questions.

## Platform

web

## Users

**Claimants**: people at a university makerspace who pay for lab supplies and services out of their own pockets and claim the money back from the university. They are not accountants. They meet Dues in two situations:

- **On the phone, seconds after paying**: share the payment confirmation and put the phone away. Nothing else is required at that moment.
- **At a laptop, in a batch**: review the Bills that have arrived, answer what Dues could not decide, and build a Claim. A sitting is typically a handful to a few dozen Bills **(assumed)**.

One Claimant is also **the maintainer**, who runs the instance and may use Claude helpers for browser jobs. Approvers (the lab head, the accounts contact) receive the Claim by email and do not use the app in v1.

## Product Purpose

Dues follows every Payment a Claimant makes for the lab from the moment the money leaves their account to the day the university pays it back, and fills the Contingency Reimbursement Form for them. Online orders that arrive in pieces, cancellations, refunds, colleagues paying each other back and invoices that turn up weeks later are each followed until the Open amount is zero.

Success: no rupee spent for the lab goes unclaimed, no Bill is claimed twice, and a Claim takes minutes to build instead of an evening.

## Positioning

- **Money first.** An Expense exists the moment money leaves the account, before any order number or document exists. Expense trackers that start from the receipt cannot say what is still owed.
- **One invariant explains everything.** `Open amount = Payment − Bills − Refunds`; every reminder is a reason that amount is not zero.
- **Readings propose, the Claimant confirms.** Dues states what it knows (where a value is on the page, what it agrees with) and never shows a confidence score.
- **A cross-Claimant Ledger** blocks the same Bill being claimed twice, including by two different people.

## Operating Context

- Self-hosted for one makerspace; sign-in through the organisation's identity provider, by role. No self-service onboarding.
- Documents live in paperless-ngx; Dues owns status and money (ADR 0001). Documents arrive by phone share, upload, email or a folder drop.
- Bills are read by vision-language models (ADR 0006). Measured on real bills: the total is right 97 to 100% of the time, the full set (date, bill number, total) about 80%. About a third of bills (handwriting, bad scans) have no located total.
- Documents are Indian: rupees with Indian digit grouping, GST tax invoices, UPI payment screenshots, handwritten cash memos, numeric dates that are ambiguous as printed.
- The Claimant sends the Claim email themselves; Dues prepares the form PDF, the Bill files and the email text (ADR 0003).
- Laptop for review and Claims; phone for capture and quick answers.

## Capabilities and Constraints

- Entities, state machines and workflows W1 to W9 are defined in `docs/spec/FUNCTIONAL.md`; the spec wins over any screen.
- Vocabulary is fixed by `GLOSSARY.md` and used exactly, in UI copy and code: Claimant, Expense, Bill, Invoice, Informal bill, Payment proof, Payment, Refund, Open amount, Reading, Reference, Claim, Ledger.
- Money is integer paise; a Bill is never rounded, only a Claim total is rounded up.
- Suggest, then confirm: matches, merges and extracted values are proposed and confirmed with one action. Nothing about money changes silently; every state change is in the audit log and confirmations are undoable until a Bill is on a submitted Claim.
- Editing a value on a confirmed Bill reopens it, by any path (typing, pointing, choosing a candidate), and it must be confirmed again (owner, 21 Nov 2026: "reconfirm").
- A highlight on a document is drawn only where the value was actually located in the OCR text. No approximate regions.
- Status: design and planning; no application code yet. Application stack undecided (`docs/research/notes/Tracker stack choice`).
- Public repository: examples are fictional, people appear by role, hosts appear as placeholders.

## Brand Commitments

- Name: **Dues**. Tagline: "Dues ex Machina. Divine intervention for your reimbursements."
- Voice: plain, short, sentence case. States facts, not feelings. Never says "confidence", "AI", "verified" or a percentage.
- Requested character for review surfaces: clean, elegant, polished, posh, efficient; the invoice total front and centre, other numbers quieter.
- No logo or other identity assets exist yet.

## Evidence on Hand

- `docs/spec/FUNCTIONAL.md`, `GLOSSARY.md`, ADRs 0001 to 0006.
- `docs/research/notes/Bill review UX/design.md`: field-state model, four variants, tokens, fictional sample bills.
- `prototypes/bill-review/index.html`: bill review prototype; variant R is the approved direction (approved 21 Nov 2026).
- Extraction accuracy figures in ADR 0006 and the design note above.
- Absent, do not fabricate: screenshots of a running product, user quotes, usage numbers, a logo.

## Product Principles

1. **Honesty over polish.** Never show certainty the data lacks. A state is a glyph and words, never colour alone; absence of evidence is shown as an absence.
2. **One glance, one key.** The common case costs one look and one keypress; Dues stops the Claimant only where it has a real reason to doubt.
3. **Money is exact.** Paise as printed, differences written out with sign and amount.
4. **The document is the witness.** Values are shown against the place they were found; the Payment is a second witness, named in words.
5. **Finished work recedes.** Confirmed things go quiet; attention belongs to what is still open.

## Accessibility & Inclusion

WCAG 2.2 AA **(assumed)**. Every flow is operable from the keyboard alone, with one recorded exception: marking a region on a document needs a pointer (WCAG 2.1.1, Level A; ADR 0008). Typing the value is the keyboard path; two taps or clicks stand in for the drag (WCAG 2.5.7); state is never carried by colour alone; `prefers-reduced-motion` is honoured; touch targets are at least 44px; light and dark themes are both first-class.

## Open questions

1. Typical batch size at a laptop sitting (assumed: a handful to a few dozen Bills).
2. Accessibility target (assumed: WCAG 2.2 AA).
3. Whether Approvers will ever use the app (assumed: not in v1; the spec mentions later `approver` and `finance` roles).
4. Interface languages (assumed: English only, `en-IN` formats).
