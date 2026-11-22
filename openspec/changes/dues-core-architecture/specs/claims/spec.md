## ADDED Requirements

### Requirement: Claim record
The system SHALL record each Claim with an id, owning Claimant, the one Fund it files, name, status (draft, submitted or reimbursed), latest submitted-on date, reimbursed-on date, total, amount actually received, the snapshot of the Fund's templates it used and the paperless-ngx document of its form, and a Claimant SHALL be able to have several draft Claims.

#### Scenario: Several drafts
- **WHEN** a Claimant creates a second draft Claim
- **THEN** both exist as drafts

#### Scenario: Owner only
- **WHEN** a Claimant lists Claims
- **THEN** only their own Claims are returned

### Requirement: Claim eligibility of Bills
The system SHALL allow only ready Bills on a Claim and MUST block a Bill that matches a Ledger line, that has an open Check, that is held by two Claimants with no Payback link, or whose Expense has no "what for" until it is filled in. A Claim line is always exactly one Fulfilled Bill at its exact amount. A no-bill Bill is ready without a document and can be claimed.

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

#### Scenario: No-bill Bill is claimable
- **WHEN** a ready no-bill Bill of ₹60.00 is added to a Claim
- **THEN** it is accepted although it has no document

#### Scenario: Exact line amount
- **WHEN** a Bill of ₹1,180.25 is added
- **THEN** its Claim line is ₹1,180.25 in paise precision

### Requirement: Building a draft Claim
The system SHALL create a draft Claim from the Bills a Claimant selects, with all ready Bills selected by default, and SHALL run the duplicate check across all Claimants when Bills are added. Each Fund MUST file as its own Claim, with its own total and its own "File" in Ready to file, and Purposes MUST be breakdown groups inside that Fund's Claim. Review MUST happen at filing time in one sitting: the Claimant reviews every ready-to-file Bill, then the filled form and the mail breakdown.

#### Scenario: Default selection
- **WHEN** a Claimant starts a Claim with three ready Bills
- **THEN** all three are selected

#### Scenario: One Claim per Fund
- **WHEN** a Claimant has ready Bills in the Makerspace Fund and ready Bills in the Fund "Travel grant"
- **THEN** each Fund files as its own Claim with its own total and its own "File" in Ready to file
- **AND** the two never share a Claim

#### Scenario: Purposes group inside a Fund's Claim
- **WHEN** a Fund's ready Bills sit under Purposes "Robotics club" and "O-week" and under no Purpose
- **THEN** they file as one Claim whose lines are grouped by those Purposes, with the no-Purpose lines together

#### Scenario: One sitting
- **WHEN** a Claimant starts filing
- **THEN** they review all ready-to-file Bills first, then the filled form and the mail breakdown

#### Scenario: Duplicate check on add
- **WHEN** a Bill is added to a draft Claim
- **THEN** the duplicate check runs across all Claimants

#### Scenario: Expense moved while its Bill is on a draft
- **WHEN** an Expense moves to a Purpose in another Fund while its Bill is on a draft Claim of the first Fund
- **THEN** the Bill is taken off that draft and put on the draft Claim of its new Fund

#### Scenario: Move inside the same Fund
- **WHEN** an Expense moves to another Purpose of the same Fund while its Bill is on a draft Claim
- **THEN** the Bill stays on that Claim and moves to the new Purpose's group

### Requirement: Draft edits only
The system SHALL allow Bills to be added to or removed from a Claim only while it is a draft, and a Bill removed from a draft MUST return to ready.

#### Scenario: Remove from draft
- **WHEN** a Bill is removed from a draft Claim
- **THEN** its status becomes ready and it no longer records the Claim

#### Scenario: Submitted Claim
- **WHEN** a Claimant adds a Bill to a submitted Claim
- **THEN** the system refuses

### Requirement: Total rounded up
The system SHALL compute a Claim's total as the sum of its Claim lines rounded up to whole rupees, for every Fund and not as a Fund setting, SHALL keep Claim lines at exact paise, SHALL store both on the Claim, and MUST NOT track the rounding difference anywhere else.

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

#### Scenario: Every Fund
- **WHEN** a Claim of a Fund other than Makerspace has lines summing to ₹410.40
- **THEN** its total is ₹411.00

### Requirement: Funds define how a Claim is made
The system SHALL give each Fund a name; a mail builder (To, CC, subject, body), where each Fund keeps its own To and CC and a Claimant's personal version of the Fund can change them, with the variables {claimant}, {claim_name}, {total}, {total_in_words}, {bill_count}, {date_range}, {purpose} and {breakdown}; notes shown only to Dues users and MUST NOT be put in the mail or the form; a form template (a Word file with placeholders, from which the PDF is made); a file-name pattern; a claim-name pattern such as {Month}{n}; a "What for?" hint shown as grey example text on the upload prompt; and an Archive that hides the Fund from the prompt while its history is kept. Makerspace SHALL be a Fund like any other, first by default, with its template starting as today's Contingency Reimbursement Form. No budget or cap exists for a Fund for now.

#### Scenario: Own recipients
- **WHEN** two Funds have different To and CC
- **THEN** a Claim of each uses its own Fund's To and CC, and a Claimant's personal version of a Fund can change them for that Claimant only

#### Scenario: Fund fields
- **WHEN** a Claimant opens a Fund in Settings → Funds
- **THEN** they can edit its name, mail, notes, form template, file-name pattern, claim-name pattern and "What for?" hint, and archive it

#### Scenario: Notes stay inside Dues
- **WHEN** a Fund has notes and a Claim of that Fund is built
- **THEN** the notes appear in neither the mail nor the form

#### Scenario: Makerspace is a Fund
- **WHEN** a Claimant signs in for the first time
- **THEN** Makerspace exists as a Fund, first in their order, with its template starting as today's Contingency Reimbursement Form

#### Scenario: Archive
- **WHEN** a Fund is archived
- **THEN** it is no longer offered on the upload prompt and its filed Claims stay

#### Scenario: Claim name from the Fund's pattern
- **WHEN** a Claim of a Fund whose claim-name pattern is {Month}{n} is built in September as that Claimant's first Claim that month
- **THEN** its name follows that pattern (see "Claim naming")

### Requirement: The mail holds only what the Fund's template puts there
The system SHALL fill the mail's To, CC, subject and body from the Fund's mail builder and MUST NOT add anything to the subject or body that the template does not put there (the Purpose name is not added to the subject by itself). The Claimant SHALL see the mail draft and be able to edit it before it is made. Dues never sends it.

#### Scenario: Variables filled
- **WHEN** the body is "Claim {claim_name}: {bill_count} bills, {total} ({total_in_words})" and the Claim has 3 Bills totalling ₹2,361.00
- **THEN** the body reads with that Claim's name, 3, ₹2,361.00 and the total in words

#### Scenario: Nothing extra in the subject
- **WHEN** the Fund's subject template does not contain {purpose} and the Claim has the Purpose "O-week"
- **THEN** the subject does not mention "O-week"

#### Scenario: Breakdown
- **WHEN** the body contains {breakdown}
- **THEN** it lists the Claim's lines grouped by Purpose

#### Scenario: No-bill line in the breakdown
- **WHEN** the body contains {breakdown} and a line comes from a no-bill Bill
- **THEN** that line is marked "no bill"

#### Scenario: Edit before it is made
- **WHEN** the Claimant changes a word in the draft body
- **THEN** the draft that is made carries the change and the Fund's template is unchanged

### Requirement: Preview of the form and the mail
The system SHALL show on the Funds page the form and the mail side by side, filled from a sample claim, with a switch "Use my last claim", and SHALL show the same preview of the draft at filing.

#### Scenario: Sample claim
- **WHEN** a Claimant opens a Fund's preview
- **THEN** the form and the mail are shown side by side, filled from a sample claim

#### Scenario: Use my last claim
- **WHEN** the Claimant switches on "Use my last claim"
- **THEN** the preview is filled from their last Claim of that Fund

### Requirement: Personal versions and the snapshot
The system SHALL let any Claimant make "my version" of a Fund's mail, form, file-name pattern or "What for?" hint, which overrides the team version only for them and can be undone with "Reset to team version"; SHALL show one line, "Team version updated. Compare", when the team version changes under a personal version; and SHALL keep with each filed Claim a snapshot of the template version it used, which later edits MUST NOT change. Who edits the team version is in identity-access.

#### Scenario: My version
- **WHEN** a Claimant edits the mail of a team Fund as "my version"
- **THEN** their Claims use their version and other Claimants still use the team version

#### Scenario: Reset
- **WHEN** the Claimant taps "Reset to team version"
- **THEN** their Claims use the team version again

#### Scenario: Team version changed
- **WHEN** an admin edits the team mail while a Claimant has a personal version
- **THEN** that Claimant sees "Team version updated. Compare"

#### Scenario: Snapshot keeps past Claims
- **WHEN** a Fund's mail template is edited after a Claim was filed
- **THEN** the filed Claim still shows the version it used

### Requirement: Form and PDF generation
The system SHALL fill the Fund's form template from the Claimant profile and the Claim lines (a no-bill line is one line with its text, amount and remark in the remarks column), and any approver names the form prints are part of the template text, not profile data, grouped by Purpose with lines of no Purpose together, with the rounded total and the amount in words, SHALL render it to PDF with Gotenberg from that template, and for Makerspace the output MUST match the university's current form.

#### Scenario: Form content
- **WHEN** a draft Claim has lines under Purposes "Robotics club" and "O-week"
- **THEN** the form lists the lines grouped by those Purposes
- **AND** shows the rounded total and the amount in words

#### Scenario: Profile data used
- **WHEN** the form is produced
- **THEN** it carries the Claimant's full name, employee code and designation

#### Scenario: No-bill line on the form
- **WHEN** a Claim holds a no-bill Bill "Auto to hardware market" of ₹60.00 with remark "No bill (cash)"
- **THEN** the form has one line with that text, amount and remark

#### Scenario: Invoice data only
- **WHEN** a line comes from a Payback Expense
- **THEN** no Payback information appears (see paybacks)

### Requirement: Submission package
The system SHALL assemble a package of the form PDF, the Bill files and a mail built from the Fund's mail template (To, CC, subject, body), SHALL store the form as a Claim form document, and MUST NOT send the mail or submit anything without the Claimant.

#### Scenario: Package contents
- **WHEN** the package is built
- **THEN** it contains the form PDF, every Bill file (a no-bill line has none), and a mail whose To, CC, subject and body come from the Fund's mail template

#### Scenario: Form stored
- **WHEN** the form PDF is produced
- **THEN** it is stored as a document of type Claim form and no tag or Claim field is written yet

### Requirement: Original files in the package
The system SHALL put the original files in the claim mail and the package, untouched: the PDF or image as shared, never a copy with reading boxes.

#### Scenario: Original attached
- **WHEN** a Bill's file was shared as a photo and has reading boxes in Dues
- **THEN** the mail carries the photo as shared, without the boxes

### Requirement: Mail attachments fit Gmail's limit
The system SHALL target about 18 MB of raw files per mail, because base64 adds about a third and Gmail's 25 MB limit applies to the encoded mail. If the files are over, the system SHALL shrink the largest images first, then scanned PDFs, until they fit, MUST leave text PDFs alone, MUST list every shrunk file in the filing review (for example "3 photos made smaller to fit 25 MB"), and MUST NOT change the originals in paperless. If the files are still too big, the system SHALL offer to split the Claim into two mails. The limit is to be confirmed with one real draft of about 22 MB.

#### Scenario: Under the target
- **WHEN** a Claim's files total 12 MB
- **THEN** nothing is shrunk

#### Scenario: Shrink images first
- **WHEN** a Claim's files total 24 MB with large photos and a scanned PDF
- **THEN** the largest photos are shrunk first, then scanned PDFs if still over, until about 18 MB or less
- **AND** the filing review says, for example, "3 photos made smaller to fit 25 MB"

#### Scenario: Text PDFs untouched
- **WHEN** a text PDF is among the files and the Claim is over the target
- **THEN** that PDF is not shrunk

#### Scenario: Originals unchanged
- **WHEN** files are shrunk for a mail
- **THEN** the originals in paperless are unchanged

#### Scenario: Still too big
- **WHEN** the files are still over the target after shrinking
- **THEN** Dues offers to split the Claim into two mails

### Requirement: File names from the Fund's pattern
The system SHALL name each Bill's file that has one in the package from the Fund's file-name pattern with the variables {purpose}, {what}, {vendor}, {person}, {n} and {kind}, where {what} is the Bill's description (which defaults to the Expense's "what for") and {kind} is "Invoice", "Bill", or "Payment" for a payment proof used as the Bill; SHALL drop an empty part with its separator; SHALL add {n} only when two names in one Claim would clash, in one numbering style; SHALL show every file name at the filing review and let the Claimant edit it for that one file; and MUST keep an edited name. The Makerspace default is "{purpose} - {what} {kind}".

#### Scenario: Makerspace default with no Purpose
- **WHEN** an Invoice for the Expense "Solder" has no Purpose
- **THEN** its file is named "Solder Invoice"

#### Scenario: Makerspace default with a Purpose
- **WHEN** an Invoice for "Acrylic Beads" sits under the Purpose "Club"
- **THEN** its file is named "Club - Acrylic Beads Invoice"

#### Scenario: Payment proof as the Bill
- **WHEN** a payment proof is used as the Bill for "Solder"
- **THEN** its file is named "Solder Payment"

#### Scenario: Clash
- **WHEN** two Bills in one Claim would both be named "Solder Invoice"
- **THEN** a number is added to each, in one numbering style

#### Scenario: No-bill line has no name
- **WHEN** a Claim holds a no-bill Bill
- **THEN** no attachment and no file name exist for it

#### Scenario: Edited name kept
- **WHEN** the Claimant edits one file's name at the filing review
- **THEN** that name is used for that file and kept

### Requirement: Dues never sends mail
The system MUST NOT send mail by itself, in any scenario, by any path. It SHALL only prepare a Gmail draft or give the Claimant files, and the Claimant sends.

#### Scenario: Gmail draft
- **WHEN** the package is complete and the Gmail compose scope is granted
- **THEN** a Gmail draft exists with the form PDF and Bill files attached and the body from the Fund's mail template
- **AND** nothing is sent

#### Scenario: Zip fallback
- **WHEN** a Gmail draft is not available
- **THEN** the Claimant downloads a zip of all the files and a "copy body" button copies the body
- **AND** the app sends nothing

#### Scenario: Gmail blocked
- **WHEN** Gmail is blocked
- **THEN** the Claimant gets an .eml file and sends it themselves

#### Scenario: No send path
- **WHEN** any step of building, drafting or downloading a Claim completes
- **THEN** no mail has left the system by Dues

#### Scenario: Later Claude Code path
- **WHEN** the Claimant's own Claude Code prepares a draft through its Gmail connector (a later path, not part of this change)
- **THEN** it is still only a draft

### Requirement: "Sent it?" marks submitted
The system SHALL, after the draft or download, ask "Sent it?", and a yes SHALL mark the Claim submitted as in Submitting a Claim.

#### Scenario: Yes
- **WHEN** the Claimant answers yes
- **THEN** the Claim is submitted

#### Scenario: Not yet
- **WHEN** the Claimant does not answer yes
- **THEN** the Claim stays a draft

### Requirement: Claim naming
The system SHALL assign a Claim its name when its submission package is built, as the build year and month name plus the sequence among that Claimant's named Claims of that month (for example 2026/November1) following the Fund's claim-name pattern, the month being taken in the Claimant's time zone, because the Fund's mail can carry it as {claim_name}. If the package is rebuilt in a later month before the Claim is marked submitted, the system SHALL rename it for that month and rebuild the package. Once the Claim is marked submitted its name MUST never change, including after a recall. A Claim without a built package MUST show only "Draft".

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
The system SHALL move a draft Claim to submitted when the Claimant marks it submitted after sending, recording the submission date and, in one paperless call, setting the Claim field and tag `reimb:claimed` on the Bills' documents and the Claim form document, and the Bills MUST be claimed.

#### Scenario: Marking submitted
- **WHEN** the Claimant marks a draft Claim submitted
- **THEN** its status is submitted with the submitted-on date and its Bills are claimed

#### Scenario: Empty Claim
- **WHEN** a draft Claim has no Claim lines
- **THEN** it cannot be submitted

### Requirement: Recall
The system SHALL let a Claimant recall a submitted Claim to draft for editing and resending, a recalled Claim MUST keep its name, its documents MUST go back to `reimb:ready` keeping the Claim field, and resubmitting SHALL update the submitted-on date to the latest submission.

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
The system SHALL, when the Claimant marks a submitted Claim reimbursed with the amount actually received (default: the Claim total), move its Bills to reimbursed, append its Claim lines to the Ledger, re-tag the documents `reimb:reimbursed` and record the reimbursed-on date, and a Reimbursement SHALL pay the Claim in full as one credit.

#### Scenario: Marking reimbursed
- **WHEN** a submitted Claim is marked reimbursed
- **THEN** its Bills become reimbursed
- **AND** its Claim lines are appended to the Ledger
- **AND** its documents are tagged `reimb:reimbursed`

#### Scenario: Amount received recorded
- **WHEN** a Claim of total ₹2,361.00 is marked reimbursed with ₹2,361.00 received
- **THEN** the amount received is stored and, for a Fund with an Advance on, that Fund's Advance left rises by it (see expense-tracking)

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
