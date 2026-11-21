## ADDED Requirements

### Requirement: Intake from paperless-ngx
The system SHALL receive a webhook from paperless-ngx for every added document, SHALL read the document and its OCR text through the paperless-ngx API with a service-account token, and SHALL treat the document's paperless-ngx owner as the Claimant it belongs to. Documents arrive stored under the uploader's own paperless-ngx user with the tag `inbox` and type Payment proof when shared from a phone.

#### Scenario: Owner decides the Claimant
- **WHEN** a webhook announces a document owned by Claimant A
- **THEN** any Expense or Bill created from it belongs to Claimant A

#### Scenario: Unknown owner
- **WHEN** a webhook announces a document whose owner is not a Claimant
- **THEN** the system creates nothing from it

#### Scenario: Repeated webhook
- **WHEN** the same document ID is announced twice
- **THEN** it is processed once

### Requirement: Classification
The system SHALL classify each new document from its OCR text as a payment confirmation or a bill (Invoice or Informal bill) and SHALL route a payment confirmation to logging a Payment and a bill to matching.

#### Scenario: Payment confirmation
- **WHEN** the OCR text shows a payment success screen with an amount and a reference
- **THEN** the document is classified as a payment confirmation

#### Scenario: Bill
- **WHEN** the OCR text shows a bill number, vendor and total
- **THEN** the document is classified as a bill and passed to bill-matching

### Requirement: Payment confirmation extraction
The system SHALL extract from a payment confirmation, independent of the payment app, the amount in rupees, the payee, the date and time, the transaction reference (a 12-digit UPI reference, UTR or transaction ID) and the paying bank or card as shown, using the configured extractors (ADR 0006).

#### Scenario: Extraction from a UPI screenshot
- **WHEN** a confirmation reads "Paid ₹2,500 to Sample Electronics, UPI Ref 123456789012"
- **THEN** amount 250000 paise, payee Sample Electronics and reference 123456789012 are extracted


### Requirement: Zero-friction logging of a Payment
The system SHALL log an Expense immediately, open and not draft, for each payment confirmation with kind guessed from the payee (known vendor history, or online for marketplace vendors, otherwise shop), Payment method matched through the Claimant's hints, and "what for" left empty, so that sharing the confirmation is the only required action.

#### Scenario: Immediate Expense
- **WHEN** a payment confirmation of ₹2,500.00 to a known online vendor arrives
- **THEN** an open Expense of ₹2,500.00 of kind online exists with the confirmation as Payment proof
- **AND** "what for" is empty

#### Scenario: Method matched
- **WHEN** the confirmation shows a card ending 1234 that matches a Payment method hint
- **THEN** that Payment method is recorded on the Expense

#### Scenario: Method unmatched
- **WHEN** no Payment method hint matches
- **THEN** the Payment method is left unset for the Claimant to choose

### Requirement: Same reference means same Payment
The system SHALL attach a second confirmation carrying the same transaction reference to the existing Expense as further Payment proof instead of creating a new Expense.

#### Scenario: Second screenshot of one Payment
- **WHEN** a confirmation arrives with the same UPI reference as an existing Expense of the same Claimant
- **THEN** it is attached to that Expense as Payment proof
- **AND** no new Expense is created

### Requirement: "Same payment as E-x?" without a reference
The system SHALL, when neither of two confirmations from the same Claimant carries a readable reference and they arrive within 10 minutes of each other, offer "Same payment as E-x?" and merge only after the Claimant confirms with one tap, and MUST NOT merge automatically.

#### Scenario: Offer within 10 minutes
- **WHEN** two unreadable-reference confirmations from one Claimant arrive 6 minutes apart
- **THEN** the second Expense is offered as "Same payment as" the first

#### Scenario: No offer after 10 minutes
- **WHEN** they arrive 11 minutes apart
- **THEN** no offer is made

#### Scenario: Never automatic
- **WHEN** the offer is not confirmed
- **THEN** both Expenses remain separate

### Requirement: Couldn't read this payment
The system SHALL, when no amount can be extracted from a payment confirmation, still create the Expense with the confirmation attached and the amount blank, flagged "Couldn't read this payment", MUST NOT drop the document, and SHALL let the Claimant enter the amount once.

#### Scenario: Unreadable amount
- **WHEN** a confirmation's amount cannot be extracted
- **THEN** an Expense exists with the document attached, a blank amount and the flag "Couldn't read this payment"

#### Scenario: Amount supplied
- **WHEN** the Claimant enters the amount
- **THEN** the flag is cleared

### Requirement: Quick-add without a confirmation
The system SHALL offer a quick-add form with two fields, amount and what for, for a payment with no confirmation to share.

#### Scenario: Cash payment
- **WHEN** a Claimant adds ₹180.00 with "Zip ties"
- **THEN** an open Expense of ₹180.00 with that purpose exists and no document is attached

### Requirement: Bill intake
The system SHALL extract from a bill the vendor, Bill number, Bill date and total, and SHALL pass them to bill-matching; a bill with no matching Expense MUST create an Expense immediately, as described in expense-tracking.

#### Scenario: Extracted bill fields
- **WHEN** a bill reads "Sample Tools, Invoice SI-0042, 3 March 2026, ₹1,180.00"
- **THEN** vendor Sample Tools, Bill number SI-0042, date 3 March 2026 and total 118000 paise are extracted

#### Scenario: No match logs an Expense
- **WHEN** no Expense matches the bill
- **THEN** an open Expense is created with amount equal to the bill total, vendor from the bill, paid-on date equal to the Bill date and Payment method "not recorded"

### Requirement: Duplicate files and bills at intake
The system SHALL consult duplicate-guard before attaching a Bill, and a file already linked to another Bill MUST NOT be attached again.

#### Scenario: Same file twice
- **WHEN** a document with the checksum of a file already linked to a Bill arrives
- **THEN** it is not attached to a second Bill and the Claimant is told which Bill holds it

### Requirement: Write-back to paperless-ngx
The system SHALL, after a document is linked, remove the `inbox` tag, set the document type, set the correspondent to the vendor, fill the custom fields (Expense ID, Bill ID, Amount, Bill number, Claim) and set the tag `reimb:ready`, a Payment proof not marked as the Bill SHALL lose `inbox` and get its Expense ID but no `reimb:*` tag, and the tracker MUST remain the record of truth if paperless-ngx metadata disagrees.

#### Scenario: Bill linked
- **WHEN** a Bill's document is attached
- **THEN** the document loses `inbox`, gets its type and correspondent, the fields Expense ID, Bill ID, Amount and Bill number, and the tag `reimb:ready`

#### Scenario: Disagreement
- **WHEN** a paperless-ngx field differs from the tracker's value
- **THEN** the tracker's value is used and the field is rewritten

### Requirement: Documents referenced, not copied
The system SHALL reference documents by paperless-ngx document ID and MUST NOT copy file contents into its own store.

#### Scenario: Reference only
- **WHEN** a Bill is attached to a document
- **THEN** the Bill stores the paperless-ngx document ID and no copy of the file

### Requirement: Uploads with a known Expense ID
The system SHALL attach a document carrying the Expense ID custom field directly to that Expense without suggesting candidates.

#### Scenario: Exact Expense ID
- **WHEN** an uploaded invoice carries Expense ID E-213
- **THEN** it is attached to E-213 as a Fulfilled Bill with no Check

### Requirement: Intake channels
The system SHALL treat documents from the phone uploader share menu, web upload, a per-Claimant mail rule and the maintainer's folder drop identically once they reach paperless-ngx.

#### Scenario: Any channel
- **WHEN** a document reaches paperless-ngx by mail rule
- **THEN** it follows the same intake steps as a phone share

### Requirement: Needs-description nudge
The system SHALL send a Web Push notification to the Claimant after a Payment is logged, reading for example "₹2,500 to Sample Electronics logged. What was it for?", with actions Add details (a one-field form) and Later, and ignoring it MUST NOT affect anything. See reminders for push delivery rules.

#### Scenario: Nudge after logging
- **WHEN** a Payment is logged and push is on
- **THEN** the Claimant receives the nudge with Add details and Later

#### Scenario: Ignored
- **WHEN** the Claimant ignores the nudge
- **THEN** the Expense stays open and nothing else changes

#### Scenario: Add details
- **WHEN** the Claimant taps Add details and enters "Robotics club"
- **THEN** the Expense's "what for" is "Robotics club"

### Requirement: Providers configured, ordered and privacy-marked
The system SHALL read documents through an ordered list of configured providers, each marked `internal` or `external`, SHALL send a Claimant's document to an `external` provider only if that Claimant has opted in, and SHALL skip a provider that answers `refused` until it is reconfigured, falling through to the next one.

#### Scenario: External skipped without opt-in
- **WHEN** the first provider is external and the Claimant has not opted in
- **THEN** the document goes to the next internal provider and nothing is sent outside the network

#### Scenario: Expired provider
- **WHEN** the first provider answers `refused`
- **THEN** the next provider in the list reads the document and the expired one is not retried until reconfigured

#### Scenario: Swap by configuration
- **WHEN** the maintainer replaces the provider row with another OpenAI-compatible endpoint
- **THEN** new documents are read by it with no code change

### Requirement: Readings and proposals
The system SHALL store each extractor's result for a document as an append-only Reading recording the extractor name, model, version, whether it was pulled or pushed and by whom, SHALL treat a repeated submission from the same extractor version as the same Reading, and SHALL build the proposal shown to the Claimant from all Readings of the document, with confidence from validators and agreement between model families. Readings MUST only propose: a value the Claimant confirmed, or a Bill on a submitted Claim, MUST NOT change.

#### Scenario: Two readers agree
- **WHEN** a provider and the Claimant's Claude Code both read total 1180.25/- and Bill number SI-0042 for a document
- **THEN** both fields are proposed with high confidence

#### Scenario: Two readers differ
- **WHEN** they read totals of ₹700.00 and ₹7,000.00
- **THEN** the total is flagged for the Claimant to check and neither value is accepted automatically

#### Scenario: Late Reading never overwrites
- **WHEN** a Reading arrives after the Claimant confirmed the total
- **THEN** the confirmed total stays and the Reading is kept only as history

#### Scenario: Handwritten bills
- **WHEN** a document is classified as a handwritten bill
- **THEN** its fields always need the Claimant's confirmation, whatever the agreement

#### Scenario: Printed values converted by Dues
- **WHEN** a Reading has grand total "2270-00"
- **THEN** the proposed total is ₹2,270.00

### Requirement: Claimant's Claude Code as a reader
The system SHALL let a Claimant connect their own Claude Code to Dues through an MCP server authorised through Zitadel with an `extraction` scope, offering tools to list their documents still to read, fetch a document's pages, submit what was read and get an upload link, and SHALL let that connection see and submit only the Claimant's own documents.

#### Scenario: File my pending bills
- **WHEN** a Claimant types "file my pending bills" into Claude Code with the Dues plugin installed
- **THEN** Claude Code reads each pending document, submits a Reading for it, and the Claimant confirms the proposals in Dues

#### Scenario: Another Claimant's document
- **WHEN** the connection asks for a document owned by another Claimant
- **THEN** the answer is not found

#### Scenario: Model name is self-declared
- **WHEN** the same Claimant submits two Readings claiming different models of the same family
- **THEN** they count as one vote for agreement
