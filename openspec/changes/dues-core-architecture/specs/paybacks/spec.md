## ADDED Requirements

### Requirement: Payback Expense
The system SHALL record a Payment to a colleague who already paid the vendor as an Expense with the Payback flag set, payee the colleague, vendor the shop or site kept separately, and Orderer the colleague.

#### Scenario: Recording a Payback
- **WHEN** a Claimant pays a colleague ₹900.00 for a Sample Tools order
- **THEN** an Expense exists with payback true, payee the colleague, vendor Sample Tools and Orderer the colleague

#### Scenario: Payee and vendor distinct
- **WHEN** a Payback Expense is viewed
- **THEN** payee and vendor are shown as separate fields

### Requirement: Offer to link the colleague's Expense
The system SHALL, when the colleague is a Claimant who logged that vendor payment as their own Expense, offer to link it, and on confirmation SHALL close the colleague's Expense as "paid back by" the paying Claimant and move its Bills to the Payback Expense.

#### Scenario: Link confirmed
- **WHEN** the paying Claimant confirms the link
- **THEN** the colleague's Expense is closed as "paid back by" that Claimant
- **AND** its Bills belong to the Payback Expense

#### Scenario: Link not offered
- **WHEN** the colleague has no Claimant link or has no matching Expense
- **THEN** no link is offered

#### Scenario: Never silent
- **WHEN** a link candidate exists
- **THEN** nothing moves until the paying Claimant confirms

### Requirement: Bills from a colleague without a link
The system SHALL accept Bills for a Payback Expense as forwarded invoices that follow normal intake in document-intake.

#### Scenario: Forwarded invoice
- **WHEN** the colleague forwards an invoice and the Claimant uploads it
- **THEN** it is matched and attached to the Payback Expense like any bill

### Requirement: Payback details stay off the form
The system SHALL keep Payback, payee, Orderer and Payment method in the app only, and a Claim form for a Payback Bill MUST show only the invoice date, Bill number, description and amount.

#### Scenario: Form content
- **WHEN** a Claim line comes from a Payback Expense
- **THEN** the form shows date, Bill number, description and amount and none of payee, Orderer or Payment method

### Requirement: Undo of the link
The system SHALL let the link be undone, reopening the colleague's Expense and moving its Bills back, until any of those Bills is on a submitted Claim, and MUST lock the link from then on.

#### Scenario: Undo before submission
- **WHEN** a link is undone while no Bill is on a submitted Claim
- **THEN** the colleague's Expense reopens and its Bills move back

#### Scenario: Undo blocked
- **WHEN** one of the moved Bills is on a submitted Claim
- **THEN** the undo is refused

#### Scenario: Unlocked by recall
- **WHEN** that Claim is recalled to draft
- **THEN** the undo is allowed again

### Requirement: Unlinked shared Bill blocks both Claimants
The system SHALL, when two Claimants hold the same Bill (a duplicate-guard match) and no Payback link exists, block both from claiming it and show both "Link as payback?", and MUST NOT let the first Claimant to claim win.

#### Scenario: Both blocked
- **WHEN** Claimants A and B each hold the same ₹900.00 Bill with no Payback link
- **THEN** neither can add it to a Claim
- **AND** both see "Link as payback?"

#### Scenario: Linking releases the Bill
- **WHEN** the link is confirmed
- **THEN** only the Payback Expense holds the Bill and its Claimant can claim it

#### Scenario: Other Claimant's details hidden
- **WHEN** Claimant A sees the block
- **THEN** only the fact that the Bill is held by another Claimant is shown, not that Claimant's Expense details

### Requirement: Payback is not a duplicate
The system SHALL treat a Payback and the colleague's linked Expense as one purchase, and MUST NOT report them as duplicates of each other. See duplicate-guard.

#### Scenario: Linked pair
- **WHEN** a Payback Expense and the colleague's Expense are linked
- **THEN** no duplicate block or warning is raised between them
