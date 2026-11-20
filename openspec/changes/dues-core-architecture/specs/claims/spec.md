## ADDED Requirements

### Requirement: Claim record
The system SHALL record each Claim with an id, owning Claimant, name, status (draft, submitted or reimbursed), latest submitted-on date, reimbursed-on date, total and the paperless-ngx document of its form, and a Claimant SHALL be able to have several draft Claims.

#### Scenario: Several drafts
- **WHEN** a Claimant creates a second draft Claim
- **THEN** both exist as drafts

#### Scenario: Owner only
- **WHEN** a Claimant lists Claims
- **THEN** only their own Claims are returned

### Requirement: Claim eligibility of Bills
The system SHALL allow only ready Bills on a Claim and MUST block a Bill that matches a Ledger line, that has an open Check, that is held by two Claimants with no Payback link, or whose Expense has no "what for" until it is filled in. A Claim line is always exactly one Fulfilled Bill at its exact amount.

#### Scenario: Not ready
- **WHEN** a Claimant adds an expected Bill to a Claim
- **THEN** the system refuses

#### Scenario: Open Check
- **WHEN** a Bill has an open Check (see bill-matching)
- **THEN** it cannot be added until the Check is confirmed or the Bill moved

#### Scenario: Ledger match
- **WHEN** a Bill matches a Ledger line (see duplicate-guard)
- **THEN** it cannot be added

#### Scenario: Unlinked shared Bill
- **WHEN** a Bill is held by two Claimants with no Payback link (see paybacks)
- **THEN** it cannot be added by either Claimant

#### Scenario: Missing what for
- **WHEN** a Bill's Expense has no "what for"
- **THEN** the system shows an inline field and the Bill can be added once it is filled

#### Scenario: Exact line amount
- **WHEN** a Bill of ₹1,180.25 is added
- **THEN** its Claim line is ₹1,180.25 in paise precision

### Requirement: Building a draft Claim
The system SHALL create a draft Claim from the Bills a Claimant selects, with all ready Bills selected by default, and SHALL run the duplicate check across all Claimants when Bills are added.

#### Scenario: Default selection
- **WHEN** a Claimant starts a Claim with three ready Bills
- **THEN** all three are selected

#### Scenario: Duplicate check on add
- **WHEN** a Bill is added to a draft Claim
- **THEN** the duplicate check runs across all Claimants

### Requirement: Draft edits only
The system SHALL allow Bills to be added to or removed from a Claim only while it is a draft, and a Bill removed from a draft MUST return to ready.

#### Scenario: Remove from draft
- **WHEN** a Bill is removed from a draft Claim
- **THEN** its status becomes ready and it no longer records the Claim

#### Scenario: Submitted Claim
- **WHEN** a Claimant adds a Bill to a submitted Claim
- **THEN** the system refuses

### Requirement: Total rounded up
The system SHALL compute a Claim's total as the sum of its Claim lines rounded up to whole rupees, SHALL keep Claim lines at exact paise, SHALL store both on the Claim, and MUST NOT track the rounding difference anywhere else.

#### Scenario: Round up
- **WHEN** Claim lines sum to ₹2,360.25
- **THEN** the total is ₹2,361.00

#### Scenario: Already whole
- **WHEN** Claim lines sum to ₹2,360.00
- **THEN** the total is ₹2,360.00

#### Scenario: One paisa over
- **WHEN** Claim lines sum to ₹2,360.01
- **THEN** the total is ₹2,361.00

#### Scenario: Lines unchanged
- **WHEN** the total is rounded up
- **THEN** each Claim line keeps its exact paise amount

### Requirement: Form and PDF generation
The system SHALL fill the Contingency Reimbursement Form from the Claimant profile and the Claim lines, grouped by purpose, with the rounded total and the amount in words, SHALL render it to PDF with Gotenberg from the form template, and the output MUST match the university's current form.

#### Scenario: Form content
- **WHEN** a draft Claim has lines under purposes "Robotics club" and "O-week"
- **THEN** the form lists the lines grouped by those purposes
- **AND** shows the rounded total and the amount in words

#### Scenario: Profile data used
- **WHEN** the form is produced
- **THEN** it carries the Claimant's full name, employee code and designation

#### Scenario: Invoice data only
- **WHEN** a line comes from a Payback Expense
- **THEN** no Payback information appears (see paybacks)

### Requirement: Submission package
The system SHALL assemble a package of the form PDF, the Bill files and an email subject and body with the purpose breakdown, addressed to the Claimant's Approvers, SHALL store the form as a Claim form document and tag the Bills' documents with the Claim, and MUST NOT send the email or submit anything without the Claimant.

#### Scenario: Package contents
- **WHEN** the package is built
- **THEN** it contains the form PDF, every Bill file, a subject and a body addressed to the Approvers

#### Scenario: Not sent by the app
- **WHEN** the package is complete
- **THEN** the Claimant downloads it or opens a mail client and sends it themselves
- **AND** the app sends nothing

#### Scenario: Form stored
- **WHEN** the form PDF is produced
- **THEN** it is stored as a document of type Claim form and the Bills' documents are tagged with the Claim

### Requirement: Claim naming
The system SHALL assign a Claim its name when its submission package is built, as the build year and month name plus the sequence among that Claimant's named Claims of that month (for example 2026/November1), the month being taken in the Claimant's time zone, because the name appears in the submission email subject. If the package is rebuilt in a later month before the Claim is marked submitted, the system SHALL rename it for that month and rebuild the package. Once the Claim is marked submitted its name MUST never change, including after a recall. A Claim without a built package MUST show only "Draft".

#### Scenario: First of the month
- **WHEN** a Claimant builds the package of their first Claim in November
- **THEN** its name is 2026/November1

#### Scenario: Second of the month
- **WHEN** the same Claimant builds the package of another Claim in November
- **THEN** its name is 2026/November2

#### Scenario: Sequence per Claimant
- **WHEN** a different Claimant builds the package of their first Claim in November
- **THEN** its name is 2026/November1

#### Scenario: Rebuilt in a later month
- **WHEN** a Claim's package was built on 30 November as 2026/November2 and is rebuilt on 2 December before being marked submitted
- **THEN** it is renamed 2026/December1 and the package is rebuilt with the new name

#### Scenario: Name fixed at submission
- **WHEN** a Claim named 2026/November2 is marked submitted in December
- **THEN** its name stays 2026/November2

#### Scenario: Draft unnamed
- **WHEN** a Claim is a draft whose package was never built
- **THEN** it is shown as "Draft"

### Requirement: Submitting a Claim
The system SHALL move a draft Claim to submitted when the Claimant marks it submitted after sending, recording the submission date and tagging the Bills' documents `reimb:claimed`, and the Bills MUST be claimed.

#### Scenario: Marking submitted
- **WHEN** the Claimant marks a draft Claim submitted
- **THEN** its status is submitted with the submitted-on date and its Bills are claimed

#### Scenario: Empty Claim
- **WHEN** a draft Claim has no Claim lines
- **THEN** it cannot be submitted

### Requirement: Recall
The system SHALL let a Claimant recall a submitted Claim to draft for editing and resending, a recalled Claim MUST keep its name, and resubmitting SHALL update the submitted-on date to the latest submission.

#### Scenario: Name kept
- **WHEN** Claim 2026/November1 is recalled and resubmitted
- **THEN** its name is still 2026/November1
- **AND** submitted-on is the date of the resubmission

#### Scenario: Recalled back to draft
- **WHEN** a submitted Claim is recalled
- **THEN** its status is draft and its Bills can be added or removed

#### Scenario: Reimbursed Claim
- **WHEN** a Claimant recalls a reimbursed Claim
- **THEN** the system refuses

#### Scenario: Returned Bill stays cancelled
- **WHEN** a Bill returned before submission was cancelled and the Claim is recalled
- **THEN** that Bill cannot return to the Claim (see expense-tracking)

### Requirement: Reimbursement completes a Claim
The system SHALL, when the Claimant marks a submitted Claim reimbursed, move its Bills to reimbursed, append its Claim lines to the Ledger, re-tag the documents `reimb:reimbursed` and record the reimbursed-on date, and a Reimbursement SHALL pay the Claim in full as one credit.

#### Scenario: Marking reimbursed
- **WHEN** a submitted Claim is marked reimbursed
- **THEN** its Bills become reimbursed
- **AND** its Claim lines are appended to the Ledger
- **AND** its documents are tagged `reimb:reimbursed`

#### Scenario: Draft cannot be reimbursed
- **WHEN** a draft Claim is marked reimbursed
- **THEN** the system refuses

#### Scenario: Expense settles
- **WHEN** this completes the last unreimbursed Bill of a fully covered Expense
- **THEN** the Expense becomes settled (see expense-tracking)

### Requirement: Local copies of a Claim
The system SHALL offer a download of a Claim's form and Bills so that Claimants never need a shared folder.

#### Scenario: Download
- **WHEN** a Claimant downloads a Claim
- **THEN** the form PDF and the Bill files are delivered as attachments
