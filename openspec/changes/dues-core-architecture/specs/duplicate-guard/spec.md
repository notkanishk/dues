## ADDED Requirements

### Requirement: Ledger of submitted Claim lines
The system SHALL keep a Ledger of every Claim line ever submitted by any Claimant, SHALL append a Claim's lines when it is reimbursed (see claims), and the Ledger MUST be read-only history.

#### Scenario: Append on reimbursement
- **WHEN** a Claim is marked reimbursed
- **THEN** each of its Claim lines is added to the Ledger

#### Scenario: Read-only
- **WHEN** any user attempts to edit or delete a Ledger line
- **THEN** the system refuses

### Requirement: Ledger import
The system SHALL import the existing ledger rows (date, Bill number, description, amount, Claim) once as Ledger lines (no Expense or Bill behind them) so the duplicate check sees them, and a repeated import MUST NOT create duplicates.

#### Scenario: Imported rows
- **WHEN** the import runs on 199 rows
- **THEN** 199 Ledger lines exist, each owned by the importing Claimant and visible to the duplicate check

#### Scenario: Re-run
- **WHEN** the import runs a second time on the same rows
- **THEN** no further Bills are created

### Requirement: When the check runs
The system SHALL run the duplicate check across all Claimants when an Expense is confirmed, when a Bill is attached, when an Amazon pick is made and when a Bill is added to a Claim.

#### Scenario: Run on attach
- **WHEN** a Bill is attached
- **THEN** the check runs

#### Scenario: Run on Amazon pick
- **WHEN** an Amazon order is picked
- **THEN** the check runs

### Requirement: Block rules
The system SHALL block, not merely warn, when a Bill has the same Bill number and the same amount as a Ledger line or another Bill of any Claimant, when the same Amazon order and shipment is already tracked, or when the same file checksum is already linked to another Bill.

#### Scenario: Same number and amount
- **WHEN** a Bill with number SI-0042 and amount ₹1,180.00 matches a Ledger line with the same number and amount
- **THEN** it is blocked

#### Scenario: Same number, different amount
- **WHEN** the amounts differ
- **THEN** the block rule does not fire

#### Scenario: Another Claimant's Bill
- **WHEN** the matching Bill belongs to a different Claimant
- **THEN** it is blocked

#### Scenario: Same Amazon shipment
- **WHEN** an order and shipment already tracked is picked again
- **THEN** it is blocked

#### Scenario: Same file
- **WHEN** a file whose checksum is already linked to another Bill is attached
- **THEN** it is blocked

### Requirement: Warn rules
The system SHALL warn when two items have the same amount within ±7 days and a similar vendor and no Bill number to compare, checking open Bills and the Ledger so that Informal bills and Payment proofs are covered.

#### Scenario: Inside the window
- **WHEN** an Informal bill of ₹450.00 and an open Bill of ₹450.00 from a similar vendor are 6 days apart
- **THEN** "Possible duplicate" is raised

#### Scenario: Outside the window
- **WHEN** the two are 8 days apart
- **THEN** no warning is raised

#### Scenario: Ledger covered
- **WHEN** a Payment proof matches a Ledger line by amount, date and vendor
- **THEN** a warning is raised

### Requirement: Resolving a warning
The system SHALL let the Claimant resolve a warning as "same thing" (merge or close one) or "different", and "different" MUST be remembered permanently for that pair so it never warns again.

#### Scenario: Same thing
- **WHEN** the Claimant resolves a warning as the same thing
- **THEN** one of the two is merged into the other or closed

#### Scenario: Different remembered
- **WHEN** the Claimant resolves a pair as different
- **THEN** that pair never warns again

#### Scenario: Other pairs unaffected
- **WHEN** a third item matches one of the pair
- **THEN** a new warning is raised for the new pair

### Requirement: Cross-Claimant disclosure
The system SHALL show a Claimant who hits another Claimant's Bill only that the Bill is already claimed and by whom, and MUST NOT show the other Claimant's details.

#### Scenario: Cross-Claimant hit
- **WHEN** a Claimant's Bill matches another Claimant's Ledger line
- **THEN** the message states that it is already claimed and by whom
- **AND** no amount, description or Expense of the other Claimant is shown beyond what is needed to identify the match
