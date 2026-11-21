## ADDED Requirements

### Requirement: Token-scoped, maintainer-only API
The system SHALL expose an API to the maintainer's assistant authenticated by a personal access token scoped to the maintainer's own data, and the token MUST NOT grant access to any other Claimant's data. The app MUST work fully without the assistant.

#### Scenario: Own data only
- **WHEN** the assistant's token requests another Claimant's Expense
- **THEN** the system responds as if it does not exist

#### Scenario: Invalid token
- **WHEN** a request carries an unknown or revoked token
- **THEN** it is rejected

#### Scenario: App works alone
- **WHEN** no assistant is configured
- **THEN** every Claimant workflow still works

### Requirement: Nothing sent or submitted by the assistant
The system SHALL NOT let the API submit a Claim, mark a draft Expense open, or send anything on behalf of the Claimant, and every suggestion MUST wait for the Claimant's confirmation.

#### Scenario: Draft stays draft
- **WHEN** the assistant creates an Expense
- **THEN** it is a draft until the Claimant confirms it in the app

#### Scenario: Submission refused
- **WHEN** the assistant tries to submit a Claim
- **THEN** the system refuses

### Requirement: Back-fill drafts
The system SHALL let the API create draft Expenses with source back-fill (amount, date, payee, Payment method, UPI reference) and attach existing documents, and SHALL let the API list existing Expenses for de-duplication; the app MUST NOT offer statement upload, parsing or reconciliation.

#### Scenario: Create a draft
- **WHEN** the assistant posts a Back-fill line of ₹320.00 to Sample Stationers
- **THEN** a draft Expense of ₹320.00 with source back-fill exists

#### Scenario: Confirmation in the app
- **WHEN** the Claimant confirms the draft
- **THEN** its status becomes open (see expense-tracking)

#### Scenario: De-duplication by UPI reference
- **WHEN** the assistant lists Expenses with a UPI reference already tracked
- **THEN** it can drop that statement line

#### Scenario: De-duplication by amount and date
- **WHEN** a statement line matches an existing Expense by amount within ±3 days
- **THEN** it can be dropped as already tracked

#### Scenario: No statement handling
- **WHEN** a Claimant looks for a statement upload screen
- **THEN** the app has none

### Requirement: Amazon order picks
The system SHALL accept Amazon orders read by the assistant as candidates (date, order number, items, total, ship-to, payment method, placed-by, delivery status per shipment, invoice availability), SHALL show candidates already matching a Ledger line or an existing Expense order number as already tracked, and SHALL turn each order the Claimant ticks into a draft online Expense with one expected Bill per shipment, delivered shipments Fulfilled and the Orderer taken from "placed by".

#### Scenario: Candidate already tracked
- **WHEN** a candidate's order number matches an existing Expense
- **THEN** it is shown as already tracked and cannot be picked again

#### Scenario: Ticked order
- **WHEN** the Claimant ticks an order with two shipments, one delivered
- **THEN** a draft online Expense exists with two Bills, one Fulfilled and one expected

#### Scenario: Orderer from placed-by
- **WHEN** the order was placed by a colleague
- **THEN** the Orderer is that colleague

#### Scenario: Nothing without a tick
- **WHEN** a candidate is not ticked
- **THEN** no Expense is created

### Requirement: Amazon invoice upload
The system SHALL accept an invoice PDF for a Fulfilled shipment uploaded to paperless-ngx with the Expense ID and attach it through the exact Expense ID without suggestion. See document-intake.

#### Scenario: Invoice attached by ID
- **WHEN** the assistant uploads an invoice with Expense ID E-213
- **THEN** it becomes the document of that Expense's Fulfilled Bill and the Bill is ready

### Requirement: Marking a Reimbursement
The system SHALL let the API mark a Claim reimbursed when the assistant finds the credit during a Back-fill, with the same effects as marking it in the app (see claims).

#### Scenario: Marked through the API
- **WHEN** the assistant marks a submitted Claim reimbursed
- **THEN** its Bills become reimbursed and its Claim lines join the Ledger

#### Scenario: Not submitted
- **WHEN** the assistant marks a draft Claim reimbursed
- **THEN** the system refuses

### Requirement: Maintainer folder sync mapping
The system SHALL expose through the API, for the maintainer's own data, the mapping from the local Reimbursement folder to the app: the folder root holds Bills not yet in any Claim, Working, Working2 and Working3 hold one draft or submitted Claim each, and Filed/<year>/<Claim> holds each reimbursed Claim, each with its form docx and PDF.

#### Scenario: Root contents
- **WHEN** the assistant requests the mapping
- **THEN** Bills not in any Claim map to the root

#### Scenario: Working folders
- **WHEN** the maintainer has a draft and a submitted Claim
- **THEN** each maps to one of Working, Working2 and Working3

#### Scenario: Reimbursed Claim
- **WHEN** a Claim named 2026/November1 is reimbursed
- **THEN** it maps to Filed/2026/November1

### Requirement: Additive sync keyed by checksum
The sync SHALL only add files, MUST NOT delete, rename or move across, SHALL identify a file and a paperless-ngx document as the same when the file's SHA-256 equals the document's checksum, SHALL upload a new file in the folder root to paperless-ngx as the maintainer with tag `inbox`, and SHALL download a Bill document missing locally into the folder its Bill or Claim maps to.

#### Scenario: New local file
- **WHEN** a file in the root has a SHA-256 not found in paperless-ngx
- **THEN** it is uploaded to paperless-ngx owned by the maintainer with tag `inbox`
- **AND** it follows document-intake

#### Scenario: Known file
- **WHEN** a file's SHA-256 equals an existing document's checksum
- **THEN** nothing is uploaded

#### Scenario: Renamed file
- **WHEN** a local file is renamed
- **THEN** its link to the document is unchanged

#### Scenario: Missing local copy
- **WHEN** a Bill document is absent from the folder
- **THEN** it is downloaded into the folder its Bill or Claim maps to

#### Scenario: Never deletes
- **WHEN** a file is deleted on one side
- **THEN** the sync does not delete the other copy

#### Scenario: Claim changes state
- **WHEN** a Claim becomes reimbursed
- **THEN** its folder is moved from WorkingN to Filed/<year>/<Claim>

### Requirement: Claim helpers for the maintainer
The system SHALL let the maintainer's assistant create a mail draft for a Claim and copy its files to the local folder, and the maintainer MUST still send the mail.

#### Scenario: Draft only
- **WHEN** the assistant prepares a mail draft for a Claim
- **THEN** the draft exists unsent
