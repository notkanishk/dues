## ADDED Requirements

### Requirement: Candidate Expenses for a bill
The system SHALL look for the Claimant's Expenses a bill belongs to, leading with the amount: a candidate has an Open amount equal to the bill total and an Expense date within ±10 days of the Bill date, and an online Expense whose Open amount is larger than the bill total is also a candidate (see "A smaller invoice splits the Order"). The vendor is a soft signal, because a UPI payee name is often a gateway or a person. An exact Expense ID or order number, when known, MUST be preferred.

#### Scenario: Clear candidate
- **WHEN** a bill of ₹1,180.00 from Sample Tools has one Expense with Open amount ₹1,180.00, 3 days earlier, under any payee name
- **THEN** that Expense is the only candidate

#### Scenario: Amount differs
- **WHEN** a shop Expense's Open amount is ₹1,000.00 and the bill total is ₹1,180.00
- **THEN** it is not a candidate

#### Scenario: Outside the window
- **WHEN** the Expense is 11 days from the Bill date
- **THEN** it is not a candidate

#### Scenario: Other Claimants excluded
- **WHEN** a bill belongs to Claimant A
- **THEN** only Claimant A's Expenses are considered

### Requirement: Auto-attach only on a strong match
The system SHALL attach a bill of exactly the Open amount automatically as a Fulfilled Bill only when the date is within the window AND (the vendor or order number matches, OR there is exactly one candidate). A bill smaller than the Open amount follows "A smaller invoice splits the Order".

#### Scenario: Vendor matches
- **WHEN** a bill matches one of two candidates on amount, date and vendor
- **THEN** it attaches to that Expense automatically

#### Scenario: Single candidate, vendor differs
- **WHEN** the payee on the only candidate is a gateway name unlike the bill's vendor
- **THEN** it attaches automatically

#### Scenario: Several candidates, no vendor or order match
- **WHEN** two candidates share the amount and date and neither matches by vendor or order number
- **THEN** it is not attached automatically (see the Check below)

### Requirement: A smaller invoice splits the Order
The system SHALL attach a bill smaller than an online Expense's Open amount automatically, splitting the Order's expected Bill, when the date is within the window AND the order number or the shop matches. The shop includes the platform and learned aliases. Otherwise the bill MUST attach to the best candidate with a Check.

#### Scenario: Order number matches
- **WHEN** a ₹2,100.00 Invoice dated within the window carries the order number of a ₹4,870.00 online Expense with an expected Bill of ₹4,870.00
- **THEN** a Fulfilled Bill of ₹2,100.00 is attached automatically
- **AND** the expected Bill is ₹2,770.00

#### Scenario: Shop matches
- **WHEN** a ₹2,100.00 Invoice from Sample Tools, dated within the window and with no order number, meets a ₹4,870.00 online Expense whose shop is Sample Tools
- **THEN** it is attached automatically and the expected Bill is ₹2,770.00

#### Scenario: Neither matches
- **WHEN** a ₹2,100.00 Invoice dated within the window matches neither the order number nor the shop of the only larger online Expense
- **THEN** it attaches to that Expense with a Check
- **AND** it cannot be claimed until the Check is confirmed or the Bill moved

#### Scenario: Outside the window
- **WHEN** the Invoice date is outside the window
- **THEN** it is not attached automatically

#### Scenario: Exact amount unchanged
- **WHEN** an Invoice equals the Open amount
- **THEN** "Auto-attach only on a strong match" applies as written

### Requirement: Marketplace invoices match on the platform
The system SHALL treat the platform of a marketplace invoice (for example Amazon) as the shop for matching, SHALL treat the "Sold by" seller as detail that MUST NOT break a match, SHALL save the order number read from the first invoice on the Expense, and SHALL match later invoices on that order number exactly.

#### Scenario: Different seller
- **WHEN** an Amazon invoice is "Sold by Sample Seller" and the Expense's shop is Amazon
- **THEN** the shop matches

#### Scenario: Order number saved
- **WHEN** the first invoice of an Order is attached
- **THEN** its order number is saved on the Expense

#### Scenario: Later invoice by order number
- **WHEN** a later invoice, sold by another seller, carries that order number
- **THEN** it matches the Expense exactly

### Requirement: Dues says what an auto-attach did
The system SHALL, after an automatic attach, say once "₹2,100 invoice added to <shop> · <what for>. ₹2,770 still expected." with Undo and Move.

#### Scenario: Message after an auto-attach
- **WHEN** a ₹2,100.00 Invoice attaches to a Sample Tools Expense "Solder" with ₹2,770.00 still expected
- **THEN** Dues says "₹2,100 invoice added to Sample Tools · Solder. ₹2,770 still expected." once, with Undo and Move

#### Scenario: Undo
- **WHEN** the Claimant taps Undo
- **THEN** the Bill is detached and the expected Bill is ₹4,870.00 again

### Requirement: Anything else raises a Check
The system SHALL attach any bill that is not auto-attached to the best candidate, SHALL raise a visible "Check: could also be <Expense ID>" in attention with a one-tap move, SHALL let the Claimant confirm or move it, and MUST keep the Bill off every Claim until then. See claims for the claim block.

#### Scenario: Check raised
- **WHEN** a bill fits two Expenses with no vendor or order match
- **THEN** it is attached to the better fit
- **AND** the Check "could also be" the other Expense is raised

#### Scenario: Confirm
- **WHEN** the Claimant confirms the match
- **THEN** the Check is cleared and the Bill can be claimed

#### Scenario: Move
- **WHEN** the Claimant moves the Bill to the other Expense
- **THEN** the Bill belongs to that Expense and the Check is cleared

#### Scenario: Open Check blocks claiming
- **WHEN** a Bill has an open Check
- **THEN** it cannot be added to a Claim

#### Scenario: Split an online Order
- **WHEN** a ₹1,200.00 Invoice has no Expense with an Open amount of ₹1,200.00 but fits an online Expense with an expected Bill of ₹3,000.00 by order number
- **THEN** the order number match attaches it, a Fulfilled Bill of ₹1,200.00 is created and the expected Bill is ₹1,800.00 (see "A smaller invoice splits the Order")

### Requirement: Confirmed matches teach payee aliases
The system SHALL, whenever the Claimant confirms or moves a match, remember the payee-to-vendor alias (for example a gateway name stands for a shop) and use it in later matches.

#### Scenario: Alias learned
- **WHEN** the Claimant confirms a bill from Sample Tools against an Expense whose payee is "GatewayPay Merchant 77"
- **THEN** the alias "GatewayPay Merchant 77" = Sample Tools is remembered

#### Scenario: Alias used
- **WHEN** a later bill from Sample Tools meets an Expense with payee "GatewayPay Merchant 77"
- **THEN** the vendor counts as matching

### Requirement: No match logs a new Expense
The system SHALL, when no Expense matches, log a new invoice-only Expense at once from the bill, and the Bill MUST be claimable immediately. If the vendor cannot be read it MUST show "Unknown" and review MUST ask for the vendor once. See document-intake.

#### Scenario: No candidate
- **WHEN** a bill of ₹640.00 dated 4 March has no candidate Expense
- **THEN** an Expense of ₹640.00 paid on 4 March with Payment method "not recorded" exists
- **AND** its Bill is Fulfilled and ready

#### Scenario: Unknown vendor
- **WHEN** the same bill's vendor cannot be read
- **THEN** the Expense's vendor shows "Unknown" and review asks for it once

### Requirement: Bill for a Payback matches on amount and date
The system SHALL expect, for a payment to a person marked "Paying someone back", a bill of that amount from any vendor, SHALL skip the vendor check, and SHALL match on amount and date. See paybacks.

#### Scenario: Any vendor
- **WHEN** a ₹900.00 bill from Sample Tools arrives 2 days after a ₹900.00 Payback to Priya
- **THEN** it matches the Payback Expense without a vendor comparison

### Requirement: Late payment confirmation attaches to the Expense
The system SHALL attach a payment confirmation arriving after the bill, with amount within ±₹1, date within ±10 days and payee similar to the vendor (or a learned alias), to the existing Expense as Payment proof, filling paid-on date, Payment method and reference, instead of creating a new Expense.

#### Scenario: Within tolerance
- **WHEN** a confirmation of ₹1,179.50 arrives for an Expense created from a ₹1,180.00 bill 2 days earlier
- **THEN** it is attached to that Expense as Payment proof and paid-on, Payment method and reference are filled

#### Scenario: Outside amount tolerance
- **WHEN** the confirmation is ₹1,178.00
- **THEN** it is not attached and a new Expense is logged

#### Scenario: Outside date window
- **WHEN** the confirmation date is 11 days from the Expense date
- **THEN** it is not attached

### Requirement: Invoice before payment
The system SHALL keep working when the invoice arrives before the payment confirmation: the bill logs an Expense (see "No match logs a new Expense"), the late confirmation attaches to it, and a merge of several invoice-only Expenses is only suggested, in one tap, never automatically.

#### Scenario: Invoice first
- **WHEN** an Invoice arrives and later a matching payment confirmation arrives
- **THEN** the confirmation attaches to the invoice's Expense as Payment proof (see "Late payment confirmation attaches to the Expense")

#### Scenario: Merge is never automatic
- **WHEN** two invoice-only Expenses fit one later payment
- **THEN** a merge is suggested and nothing is merged until the Claimant confirms

### Requirement: One Payment for several invoices
The system SHALL suggest, but MUST NOT perform automatically, merging into one Expense when a payment equals the sum of two or three invoice-only Expenses from the same vendor within ±10 days, and each invoice MUST remain its own Bill and Claim line.

#### Scenario: Suggest the merge
- **WHEN** a payment of ₹1,500.00 arrives and two same-vendor invoice-only Expenses of ₹900.00 and ₹600.00 exist within ±10 days
- **THEN** merging them into one Expense is suggested

#### Scenario: Merge confirmed
- **WHEN** the Claimant confirms
- **THEN** one Expense exists with two Bills of ₹900.00 and ₹600.00
- **AND** each is its own Claim line when claimed

#### Scenario: Sum within ±₹1
- **WHEN** the payment is ₹1,499.50 for invoices of ₹900.00 and ₹600.00
- **THEN** the merge is still suggested

#### Scenario: Four invoices
- **WHEN** the payment equals the sum of four invoice-only Expenses
- **THEN** no merge is suggested

#### Scenario: Declined
- **WHEN** the Claimant declines the suggestion
- **THEN** the Expenses stay separate
