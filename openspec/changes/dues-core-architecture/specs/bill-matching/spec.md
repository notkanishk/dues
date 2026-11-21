## ADDED Requirements

### Requirement: Candidate Expenses for a bill
The system SHALL look for the Claimant's Expenses a bill belongs to, where the Expense's Open amount is at least the bill total, the vendor or payee is similar and the Expense date is within ±10 days of the Bill date, and SHALL prefer an exact Expense ID or order number when known.

#### Scenario: Clear candidate
- **WHEN** a bill of ₹1,180.00 from Sample Tools has one Expense with Open amount ₹1,180.00 and a similar vendor 3 days earlier
- **THEN** that Expense is the only candidate

#### Scenario: Open amount too small
- **WHEN** an Expense's Open amount is ₹1,000.00 and the bill total is ₹1,180.00
- **THEN** it is not a candidate

#### Scenario: Outside the window
- **WHEN** the Expense is 11 days from the Bill date
- **THEN** it is not a candidate

#### Scenario: Other Claimants excluded
- **WHEN** a bill belongs to Claimant A
- **THEN** only Claimant A's Expenses are considered

### Requirement: One clear match attaches automatically
The system SHALL attach a bill with exactly one clear candidate as a Fulfilled Bill automatically, and SHALL split the Order's expected Bill when the Expense is online.

#### Scenario: Attach to shop Expense
- **WHEN** a bill matches exactly one shop Expense
- **THEN** it becomes that Expense's Fulfilled Bill

#### Scenario: Split an online Order
- **WHEN** a ₹1,200.00 Invoice matches an online Expense with an expected Bill of ₹3,000.00
- **THEN** a Fulfilled Bill of ₹1,200.00 is created and the expected Bill is ₹1,800.00

### Requirement: Several candidates raise a Check
The system SHALL attach a bill with several candidates to the best one, SHALL raise "Check: could also be E-xxxx" in attention, SHALL let the Claimant confirm or move it with one tap, and MUST keep the Bill off every Claim until then. See claims for the claim block.

#### Scenario: Check raised
- **WHEN** a bill fits two Expenses
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

### Requirement: No match logs a new Expense
The system SHALL, when no Expense matches, log a new Expense at once from the bill, and the Bill MUST be claimable immediately. See document-intake.

#### Scenario: No candidate
- **WHEN** a bill of ₹640.00 dated 4 March has no candidate Expense
- **THEN** an Expense of ₹640.00 paid on 4 March with Payment method "not recorded" exists
- **AND** its Bill is Fulfilled and ready

### Requirement: Late payment confirmation attaches to the Expense
The system SHALL attach a payment confirmation arriving after the bill, with amount within ±₹1, date within ±10 days and payee similar to the vendor, to the existing Expense as Payment proof, filling paid-on date, Payment method and reference, instead of creating a new Expense.

#### Scenario: Within tolerance
- **WHEN** a confirmation of ₹1,179.50 arrives for an Expense created from a ₹1,180.00 bill 2 days earlier
- **THEN** it is attached to that Expense as Payment proof and paid-on, Payment method and reference are filled

#### Scenario: Outside amount tolerance
- **WHEN** the confirmation is ₹1,178.00
- **THEN** it is not attached and a new Expense is logged

#### Scenario: Outside date window
- **WHEN** the confirmation date is 11 days from the Expense date
- **THEN** it is not attached

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
