## ADDED Requirements

### Requirement: Needs-attention rules
The system SHALL raise an attention item for each of these conditions: Draft waiting (an Expense draft for more than 1 day); Goods late (a Bill expected more than 7 days after the paid-on date); Refund owed (a Refund expected for more than 10 days); Mismatch (nothing expected but Bills plus Refunds plus the amount written off differ from the Payment, raised at once); Invoice waiting (an Expense in Waiting for invoice for more than 14 days after the paid-on date, raised once; the only invoice reminder); Needs description (an Expense without "what for"); Couldn't read (a Payment proof whose amount could not be extracted); Owed to university (a record with status open); Check match (a Bill attached with another candidate Expense, not confirmed); Link as payback? (the same Bill held by two Claimants with no link); Claim unpaid (a Claim submitted more than 45 days); Possible duplicate (a duplicate-guard warning).

#### Scenario: Draft waiting
- **WHEN** a draft Expense is 25 hours old
- **THEN** "Draft waiting" is raised

#### Scenario: Draft not yet due
- **WHEN** a draft Expense is 20 hours old
- **THEN** no item is raised

#### Scenario: Goods late
- **WHEN** a Bill has been expected for 8 days after paid-on
- **THEN** "Goods late" is raised

#### Scenario: Goods not yet late
- **WHEN** the Bill has been expected for 7 days
- **THEN** no item is raised

#### Scenario: No 3-day Bill missing item
- **WHEN** a Fulfilled Bill has had no document for 4 days and the Expense was paid 4 days ago
- **THEN** no item is raised

#### Scenario: Refund owed
- **WHEN** a Refund has been expected for 11 days
- **THEN** "Refund owed" is raised

#### Scenario: Mismatch fires at once
- **WHEN** nothing is expected and Bills plus Refunds differ from the Payment
- **THEN** "Mismatch" is raised immediately with the difference

#### Scenario: Claim unpaid
- **WHEN** a Claim has been submitted for 46 days
- **THEN** "Claim unpaid" is raised

#### Scenario: Couldn't read
- **WHEN** a Payment proof has no extracted amount
- **THEN** "Couldn't read" is raised

#### Scenario: Owed to university
- **WHEN** an Owed to university record is open
- **THEN** an item is raised until it is repaid

#### Scenario: Check match
- **WHEN** a Bill has an unconfirmed Check
- **THEN** "Check match" is raised

#### Scenario: Link as payback
- **WHEN** two Claimants hold the same Bill with no link
- **THEN** "Link as payback?" is raised for both

#### Scenario: Possible duplicate
- **WHEN** a duplicate-guard warning is open
- **THEN** "Possible duplicate" is raised

### Requirement: Items clear when the condition ends
The system SHALL remove an attention item as soon as its condition no longer holds, without a manual dismissal.

#### Scenario: Refund received
- **WHEN** an expected Refund is marked received
- **THEN** its "Refund owed" item disappears

#### Scenario: Description added
- **WHEN** the missing "what for" is filled in
- **THEN** it leaves the "Needs description" item

### Requirement: Ageing in the Claimant's zone
The system SHALL measure every age in a rule in calendar days in the Claimant's time zone.

#### Scenario: Zone-based ageing
- **WHEN** a Claimant in Asia/Kolkata has a Bill expected since the paid-on date 8 calendar days ago in that zone
- **THEN** "Goods late" is raised even if fewer than 8 UTC days have elapsed

### Requirement: Needs description grouped
The system SHALL present Expenses without "what for" as one grouped item (for example "3 payments need a description") that opens a single pass to describe them all, and the description MUST be required only before a Bill goes on a Claim.

#### Scenario: Grouped item
- **WHEN** three Expenses lack "what for"
- **THEN** one item "3 payments need a description" is shown

#### Scenario: Not required until claiming
- **WHEN** an Expense lacks "what for" and none of its Bills is being claimed
- **THEN** nothing is blocked

### Requirement: Web Push delivery
The system SHALL deliver the nudge of document-intake and a daily nudge at the Claimant's chosen time as Web Push notifications only when the Claimant has push on, the daily nudge SHALL link to the grouped Needs description item, and nothing in the app MUST depend on a notification being seen.

#### Scenario: Daily nudge
- **WHEN** the Claimant's daily time arrives and attention items exist
- **THEN** one push links to the attention list

#### Scenario: Nothing to say
- **WHEN** no attention item exists at the daily time
- **THEN** no push is sent

#### Scenario: Push off
- **WHEN** the Claimant has push off
- **THEN** no push is sent and items still appear in the app

### Requirement: Invoice waiting reminder
The system SHALL raise one invoice reminder, and only one, when an Expense has waited for its Bill for more than 14 days after the paid-on date, reading "Ask <name> for the <vendor> invoice" when the Orderer is someone else.

#### Scenario: Own order
- **WHEN** an Expense with the Claimant as Orderer has waited 15 days for its Bill
- **THEN** one "Invoice waiting" item is raised

#### Scenario: Colleague ordered
- **WHEN** an Expense ordered by Priya from Sample Tools has waited 15 days
- **THEN** the item reads "Ask Priya for the Sample Tools invoice"

#### Scenario: Only once
- **WHEN** the reminder has been raised and the Expense still waits
- **THEN** no second reminder is raised

#### Scenario: Not yet due
- **WHEN** an Expense has waited 14 days
- **THEN** no item is raised

#### Scenario: Entry without a bill
- **WHEN** an entry without a bill is 15 days old
- **THEN** no "Invoice waiting" item is raised

#### Scenario: Shop Expense with no document
- **WHEN** a shop Expense whose Bill is Fulfilled has no document 15 days after paid-on
- **THEN** the same "Invoice waiting" item is raised and no other invoice reminder exists
