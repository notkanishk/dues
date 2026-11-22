# Makerspace Reimbursement

Makerspace members pay for lab supplies and services out of their own pockets and claim the money back from the university. This context tracks each payment from the moment it is made until the university pays it back, for every Claimant.

## People

**Claimant**:
A person who pays for lab things and files Claims in their own name; every Expense, Bill and Claim belongs to exactly one Claimant.
_Avoid_: User, employee, member

**Approver**:
A person who approves or processes a Claimant's Claims, such as the lab head who approves and the accounts contact who pays.
_Avoid_: Manager, reviewer

**Orderer**:
The person who placed the order with the vendor: the Claimant or a colleague. Tracked because colleagues often order on the lab's shared accounts.
_Avoid_: Buyer, placed by, requester

## Money out

**Expense**:
One Payment a Claimant made for the lab, together with everything that follows from it (order, deliveries, refunds, Bills). An Expense can produce several Bills, claimed separately as each is fulfilled.
_Avoid_: Item, purchase, transaction

**Order**:
What an online Expense buys from a vendor: one order number, invoiced in one or more Bills (Amazon issues one Invoice per delivery). An Order is complete when its Bills and Refunds add up to the Payment.
_Avoid_: Purchase, cart

**Payment**:
The money leaving a Claimant's account for an Expense.
_Avoid_: Transaction, debit

**Payment method**:
One of a Claimant's own ways of paying, defined by them (e.g. a savings account, a credit card, a UPI app), recorded on each Payment.
_Avoid_: Funding account, card, bank

**Payback**:
A Claimant's Payment to a colleague who already paid a vendor for the lab. The Payback is the Expense; if the colleague had logged the original payment as their own Expense, that Expense closes and its Bills move to the Payback.
_Avoid_: Reimbursing someone, refund to colleague

**Refund**:
Money a vendor returns for an Expense after a cancellation or return. An Expense can have several Refunds.
_Avoid_: Reversal, cashback

**Open amount**:
The part of an Expense's Payment not yet covered by a Bill or a Refund: goods still coming, a refund still owed, or a bill not yet in hand. An Expense is settled when its Open amount is zero, every Refund has arrived and every Bill is reimbursed or cancelled.
_Avoid_: Balance, pending, outstanding

**Fund**:
Where an Expense's money comes from and how it is claimed: a name, a mail and form template, and optionally the Claimant's own Advance. Each Fund files as its own Claim.
_Avoid_: Budget, account, pot

**Purpose**:
An optional group inside a Fund that a Claimant puts Expenses into, such as a trip or an event. Its Expenses form one breakdown group in that Fund's Claim.
_Avoid_: Category, project, tag

**Advance**:
A personal amount on a Fund, off by default and never shared: money Finance credited to the Claimant's own bank account for that Fund's purchases, kept as one total the Claimant enters. What is left of it is the total minus the Claimant's money still out on that Fund's Expenses; below zero means the Claimant's own money is in.
_Avoid_: Float, wallet, imprest

## Proof

**Reference**:
The short label Dues gives each Expense, Bill, Refund and Owed to university record, such as E-213 or B-431, unique across all Claimants and never changed. Distinct from the Bill number the vendor prints.
_Avoid_: ID, tracker ID, invoice number

**Bill**:
A document that proves part or all of an Expense to the university, and the unit that is claimed. Comes in three kinds: Invoice, Informal bill, Payment proof.
_Avoid_: Receipt, voucher

**Fulfilled**:
A Bill whose goods have all arrived (or whose service is done). Only Fulfilled Bills can go on a Claim.
_Avoid_: Delivered, complete

**Reading**:
One reader's account of what a document says, as printed: from a provider Dues calls, or from a Claimant's own Claude Code. Readings only propose; the Claimant confirms.
_Avoid_: OCR result, parse, extraction

**Invoice**:
A Bill issued by the vendor with a bill number, typically a GST tax invoice.
_Avoid_: Tax receipt

**Informal bill**:
A handwritten or unnumbered Bill from a shop, such as a cash memo or estimate slip.
_Avoid_: Raw bill, kacha bill

**Payment proof**:
A screenshot of the Payment itself, used as the Bill when the vendor gives nothing else.
_Avoid_: UPI receipt, screenshot

## Getting paid back

**Claim**:
One submitted form of one Fund and the Bills sent with it, filed by one Claimant and named by the Fund's claim-name pattern, e.g. 2026/September1; once submitted the name never changes, even after a recall.
_Avoid_: Batch, report, reimbursement

**Claim line**:
One row on a Claim; always exactly one Fulfilled Bill at its amount.
_Avoid_: Row, entry

**Reimbursement**:
The single bank credit from the university that pays a Claim in full.
_Avoid_: Payout, settlement

**Owed to university**:
Money a Claimant must give back because a Bill they already claimed was later returned and refunded to them; settled by repaying it.
_Avoid_: Clawback, negative claim

**Ledger**:
The record of every Claim line ever submitted by any Claimant, used to stop a Bill being claimed twice, including by two different people.
_Avoid_: History, filed list

## Statements

**Statement line**:
One row of a bank or card statement: a Payment, a Refund, a Reimbursement, or something unrelated to the lab. Only used when a Claimant back-fills past Expenses.
_Avoid_: Transaction, entry

**Back-fill**:
Recording Expenses after the fact from a bank or card statement, for payments that were never logged when they happened.
_Avoid_: Retro upload, reconciliation, import
