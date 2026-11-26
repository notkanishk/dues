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
The system SHALL log an Expense immediately, open and not draft, for each payment confirmation, with whatever can be read, with kind guessed from the payee (remembered payee type, known vendor history, or online for marketplace vendors, otherwise shop), Payment method matched through the Claimant's hints, and "what for" left empty, so that sharing the confirmation is the only required action.

#### Scenario: Immediate Expense
- **WHEN** a payment confirmation of ₹2,500.00 to a known online vendor arrives
- **THEN** an open Expense of ₹2,500.00 of kind online exists with the confirmation as Payment proof
- **AND** "what for" is empty

#### Scenario: Method matched
- **WHEN** the confirmation shows a card ending 1234 that matches a Payment method hint
- **THEN** that Payment method is recorded on the Expense

#### Scenario: Order confirmation shared
- **WHEN** an order-confirmation screenshot is shared for an Expense
- **THEN** the Expense's order reference is filled from it and it is not treated as a Bill

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

### Requirement: Bill intake
The system SHALL extract from a bill the vendor, Bill number, Bill date and total, and SHALL pass them to bill-matching; a bill with no matching Expense MUST create an Expense immediately, as described in expense-tracking.

#### Scenario: Extracted bill fields
- **WHEN** a bill reads "Sample Tools, Invoice SI-0042, 3 March 2026, ₹1,180.00"
- **THEN** vendor Sample Tools, Bill number SI-0042, date 3 March 2026 and total 118000 paise are extracted

#### Scenario: No match logs an Expense
- **WHEN** no Expense matches the bill
- **THEN** an open Expense is created with amount equal to the bill total, vendor from the bill, paid-on date equal to the Bill date and Payment method "not recorded"

#### Scenario: Vendor unreadable
- **WHEN** no Expense matches and the vendor cannot be read
- **THEN** the Expense's vendor shows "Unknown"
- **AND** review asks for the vendor once

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
The system SHALL send a Web Push notification to the Claimant after a Payment is logged, reading for example "₹2,500 to Sample Electronics logged. What was it for?", with actions Add details (the "What for?" step) and Later, and ignoring it MUST NOT affect anything. See reminders for push delivery rules.

#### Scenario: Nudge after logging
- **WHEN** a Payment is logged and push is on
- **THEN** the Claimant receives the nudge with Add details and Later

#### Scenario: Ignored
- **WHEN** the Claimant ignores the nudge
- **THEN** the Expense stays open and nothing else changes

#### Scenario: Add details
- **WHEN** the Claimant taps Add details and enters "Robotics club"
- **THEN** the Expense's "what for" is "Robotics club"

### Requirement: "What for?" step
The system SHALL ask only "What for?" after a Payment is logged, and on the same step SHALL offer "Ordered by" (Me by default, or a recent Person, stored as the Orderer) and the Fund and Purpose choices (see expense-tracking).

#### Scenario: Default Orderer
- **WHEN** the Claimant answers "What for?" and leaves "Ordered by" alone
- **THEN** the Orderer is the Claimant

#### Scenario: Ordered by a colleague
- **WHEN** the Claimant picks Priya under "Ordered by"
- **THEN** the Orderer is Priya

### Requirement: Payee type asked once
The system SHALL, the first time a payee that is a person (not a shop) appears, ask one question, "Shop", "Online order" or "Paying someone back", SHALL remember the answer for that payee, and MUST NOT ask again for that payee. "Paying someone back" makes the Expense a Payback (see paybacks).

#### Scenario: First time
- **WHEN** a payment to a person payee Priya appears for the first time
- **THEN** the Claimant is asked Shop, Online order or Paying someone back

#### Scenario: Remembered
- **WHEN** the Claimant answered Paying someone back and pays Priya again
- **THEN** the Expense is a Payback and no question is asked

#### Scenario: Shop payee
- **WHEN** the payee is a shop
- **THEN** no question is asked
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
The system SHALL store each extractor's result for a document as an append-only Reading recording the extractor name, model, version, whether it was pulled or pushed and by whom, SHALL treat a repeated submission from the same extractor version as the same Reading, and SHALL build the proposal shown to the Claimant from all Readings of the document. Readings MUST only propose: a value the Claimant confirmed, or a Bill on a submitted Claim, MUST NOT change. A second Reading only adds care: it MUST NOT remove a stop or confirm anything. Where the provider could not read a field, a Claude Code Reading fills it like any single Reading.

#### Scenario: Two readers agree
- **WHEN** a provider and the Claimant's Claude Code both read total 1180.25/- and Bill number SI-0042 for a document
- **THEN** both fields are proposed with the value both read, carry no mark of who read them, and still wait for the Claimant's confirmation

#### Scenario: Agreement removes no stop
- **WHEN** two Readings agree on a total that the validators already flag
- **THEN** the total still stops for the Claimant

#### Scenario: Two readers differ
- **WHEN** they read totals of ₹700.00 and ₹7,000.00
- **THEN** the total stops showing both values, each named by who read it ("your Claude Code" for the Claimant's own), and neither is accepted automatically

#### Scenario: Only four fields stop on a difference
- **WHEN** two Readings differ on total, date, bill number or GSTIN
- **THEN** that field stops
- **AND WHEN** they differ on vendor or description
- **THEN** nothing stops: the value found on the page is shown and the other is kept on record (Readings and audit log)

#### Scenario: Compared after conversion
- **WHEN** one Reading has total "2270-00" and the other ₹2,270.00, or bill numbers "SI 0042" and "si0042"
- **THEN** they are equal and nothing stops

#### Scenario: Differing total with a default
- **WHEN** two totals differ and exactly one equals the Payment or is found on the page
- **THEN** that value is choice 1 and Enter takes it

#### Scenario: Differing total with no default
- **WHEN** two totals differ and both or neither equal the Payment or are found on the page
- **THEN** Enter chooses nothing, the line reads "Choose 1 or 2", and the Claimant presses 1 or 2 or types the value

#### Scenario: Date and bill number ordering
- **WHEN** two dates or two bill numbers differ
- **THEN** the candidates are ordered as in the approved review design, with no new default rule

#### Scenario: Two readings agree, on a total that stops
- **WHEN** a printed bill's total already stops and the two readers are of different model families and agree on it
- **THEN** the line "Two readings agree" shows beside the total

#### Scenario: Two readings agree, nowhere else
- **WHEN** the readers agree on a date, a bill number, a handwritten bill's field, or a field that does not stop
- **THEN** no "Two readings agree" line shows

#### Scenario: Late Reading never overwrites
- **WHEN** a Reading arrives after the Claimant confirmed the total
- **THEN** the confirmed total stays and the Reading is kept only as history

#### Scenario: Reading arrives while the Bill is open
- **WHEN** a Reading arrives for a Bill the Claimant has open
- **THEN** the values on screen stay as they are and nothing changes under their hand
- **AND** if the Reading differs on a field that stops, one line says so and that field becomes a stop before the Bill can be confirmed

#### Scenario: Handwritten bills
- **WHEN** a document is classified as a handwritten bill
- **THEN** its fields always need the Claimant's confirmation, whatever the agreement

#### Scenario: Printed values converted by Dues
- **WHEN** a Reading has grand total "2270-00"
- **THEN** the proposed total is ₹2,270.00

### Requirement: Claimant's Claude Code as a reader, over MCP, reading only
The system SHALL let every Claimant connect their own Claude Code to Dues through an MCP server authorised through Zitadel with an `extraction` scope, and this MCP server MUST be the only way a Claude Code reaches Dues. It SHALL offer tools to list the Claimant's unconfirmed Bills still to read, fetch a Bill's pages and submit a Reading, and SHALL let the connection see and submit only the Claimant's own Bills that are not confirmed. The connection MUST NOT confirm a Bill, build or send a Claim, or change anything but add a Reading. The sentence that starts a run is "read my bills"; near wordings work and there is no second command. A Claimant's Bills are read by a run only while unconfirmed; undoing a confirmation puts a Bill back.

#### Scenario: Read my bills
- **WHEN** a Claimant types "read my bills" into Claude Code with the Dues plugin installed and connected
- **THEN** Claude Code reads each unconfirmed Bill, submits a Reading for it, and the Claimant confirms in Dues

#### Scenario: Confirmed Bills are not re-read
- **WHEN** a Claimant has confirmed a Bill and runs "read my bills"
- **THEN** that Bill is not offered to the run

#### Scenario: Undo puts a Bill back
- **WHEN** the Claimant undoes a Bill's confirmation
- **THEN** the next run offers it again

#### Scenario: Any Claimant, including the maintainer
- **WHEN** the maintainer connects their Claude Code
- **THEN** the connection has the same tools and the same limits as any Claimant's

#### Scenario: Another Claimant's document
- **WHEN** the connection asks for a document owned by another Claimant
- **THEN** the answer is not found

#### Scenario: Nothing but a Reading
- **WHEN** the connection tries to confirm a Bill or build or send a Claim
- **THEN** the system has no such tool and refuses

#### Scenario: Repeat run
- **WHEN** a run is repeated or resumed after it was cut short
- **THEN** a Reading already made by the same extractor version is the same Reading and nothing doubles

#### Scenario: Model name is self-declared
- **WHEN** the same Claimant submits two Readings claiming different models of the same family
- **THEN** they count as one vote for agreement

### Requirement: One connection per Claimant, ended by Disconnect on the server
The system SHALL keep one connection per Claimant, shown in Settings as connected since and the last read (date and count), and SHALL end it with one Disconnect that applies to every computer at once: Dues records a cut-off time and its MCP server MUST refuse every token issued before it. Readings already made MUST stay. The Claimant gets no run log; the audit log holds it.

#### Scenario: Connected once, on many computers
- **WHEN** a Claimant connects a second computer
- **THEN** Settings still shows one connection

#### Scenario: Disconnect cuts off every computer
- **WHEN** the Claimant presses Disconnect
- **THEN** a cut-off time is recorded, a token issued before it is refused, and Settings says "Disconnected. Your Claude Code can no longer read your bills. Readings it already made stay."

#### Scenario: Removing the server on the computer is not Disconnect
- **WHEN** the Claimant only removes the MCP server from one computer
- **THEN** the tokens already issued still work until Disconnect

#### Scenario: Readings survive
- **WHEN** the Claimant disconnects
- **THEN** the Readings already made stay on their Bills

#### Scenario: Connecting again
- **WHEN** the Claimant connects after a Disconnect
- **THEN** tokens issued after the cut-off are accepted

#### Scenario: Phone
- **WHEN** a Claimant is not connected and opens Settings on a phone
- **THEN** it shows "Connect from your computer." with no line to copy

### Requirement: Dues' own consent page
The system SHALL show its own consent page around the sign-in redirect when a Claude Code connects, apart from the external-reading opt-in, because Zitadel has no per-application consent screen. The page SHALL say in plain words that Claude Code sends the pages of the Claimant's bills to Anthropic under their own account, that it can read their unconfirmed bills and propose values, that it cannot confirm a bill or build or send a Claim, and that they can disconnect any time in Settings, and SHALL offer "Allow" and "Don't allow". A computer that was allowed MUST NOT be asked again until Disconnect.

#### Scenario: Allow
- **WHEN** the Claimant presses Allow
- **THEN** the page says "Connected. Go back to your terminal." and the connection exists

#### Scenario: Don't allow
- **WHEN** the Claimant presses Don't allow
- **THEN** the page says "Not connected. Nothing was shared. Nothing for you to do." and no token is issued
- **AND** the terminal says "Dues wasn't connected. Nothing was read. Say 'read my bills' to try again."

#### Scenario: Sign-in first
- **WHEN** the Claimant is not signed in when the consent page opens
- **THEN** they sign in and return to the consent page

#### Scenario: Not asked again
- **WHEN** an allowed computer runs "read my bills" again before Disconnect
- **THEN** no consent page opens

### Requirement: A run reports in the terminal only
The system SHALL show no in-progress or failure state for a run anywhere in Dues; each Reading lands on its Bill, and Settings shows only the last read with date and count. A run SHALL end in the terminal with one plain line and one link, printed and never opened by itself, reporting only what needs care; the link opens review on the first Bill in review in the queue's own order, and sign-in returns to the same Bill. A failed run SHALL say in the terminal what happened, what was kept and the next step. Dues sends no push and adds no attention item for a run, and offers no button to start one; the one mention is a line with the sentence to type on a "Couldn't read" Bill of a connected Claimant.

#### Scenario: Run with values to check
- **WHEN** a run reads 7 Bills and 2 have differing values
- **THEN** the terminal says "7 bills read. 2 have values to check. Review: <link>"

#### Scenario: Nothing new, some waiting
- **WHEN** a run finds nothing unread and 3 Bills wait for review
- **THEN** the terminal says "No new bills to read. 3 are waiting for your review: <link>"

#### Scenario: Nothing at all
- **WHEN** a run finds no Bills to read and none waiting
- **THEN** the terminal says "No bills to read. Nothing for you to do."

#### Scenario: One could not be read
- **WHEN** a run reads 6 of 7 Bills
- **THEN** the terminal says "6 of 7 read. 1 couldn't be read; type its values in review: <link>"

#### Scenario: Not connected on this computer
- **WHEN** a run starts on a computer that is not connected
- **THEN** the terminal says "Dues isn't connected on this computer. Nothing was read. Connect: <link>"

#### Scenario: Dues unreachable
- **WHEN** Dues cannot be reached during a run
- **THEN** the terminal says "Couldn't reach Dues. Nothing was changed. Try again in a while."

#### Scenario: Plugin out of date
- **WHEN** the plugin is older than Dues accepts
- **THEN** the terminal says "This Dues plugin is out of date. Nothing was read. Update it: <line>"

#### Scenario: Run cut short by Claude Code
- **WHEN** Claude Code stops the run itself (usage limit, closed window)
- **THEN** Claude Code's own message shows, and every Reading made so far is kept

#### Scenario: Nothing in progress in Dues
- **WHEN** a run is under way
- **THEN** Dues shows no "in progress" state; each Reading simply appears on its Bill

#### Scenario: No push or button
- **WHEN** a run finishes
- **THEN** Dues sends no push and adds no attention item

### Requirement: One line to connect and read
The system SHALL show in Settings one line to copy that installs the Dues plugin (the remote MCP server and a skill) and starts the first run, so connecting and the first run are one move: copy, paste, Allow. See the design for its shape.

#### Scenario: Copy, paste, Allow
- **WHEN** the Claimant pastes the line in a terminal and presses Allow on the consent page
- **THEN** the plugin is installed, the connection exists, and the terminal carries on with the first run
