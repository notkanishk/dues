## ADDED Requirements

### Requirement: Expense ownership and fields
The system SHALL record each Expense with an id, paid-on date, Payment amount, owning Claimant, Payment method, payee, vendor, kind (online, shop or service), Orderer (default the Claimant), Payback flag, optional order reference, a free-text "what for", the Fund it is claimed from, an optional link to a Purpose inside that Fund, optional UPI reference, source (manual, document, amazon or back-fill), Payment proof documents and notes, and every Expense, Bill and Refund MUST belong to exactly one Claimant.

#### Scenario: Default Orderer
- **WHEN** a Claimant adds an Expense without naming an Orderer
- **THEN** the Orderer is the Claimant

#### Scenario: Owner-only access
- **WHEN** a Claimant lists Expenses
- **THEN** only Expenses owned by that Claimant are returned

### Requirement: Expense lifecycle
The system SHALL give each Expense one status of draft, open, settled or closed, SHALL derive the status from its Bills, Refunds and Open amount, and MUST NOT let a Claimant set it by hand except by closing.

#### Scenario: Confirming a draft
- **WHEN** a Claimant confirms a draft Expense
- **THEN** its status becomes open

#### Scenario: Discarding a draft
- **WHEN** a Claimant discards a draft Expense
- **THEN** its status becomes closed

#### Scenario: Shared documents skip draft
- **WHEN** an Expense is created from a shared payment confirmation or a shared Bill
- **THEN** it is created open and never draft (see document-intake)

#### Scenario: Settling
- **WHEN** an open Expense has an Open amount of zero and every Bill is reimbursed or cancelled
- **THEN** its status becomes settled

#### Scenario: Not settled while a Bill is unreimbursed
- **WHEN** the Open amount is zero but one Bill is claimed and not yet reimbursed
- **THEN** the Expense stays open

#### Scenario: Status cannot be set directly
- **WHEN** a Claimant tries to set an Expense to settled by hand
- **THEN** the system refuses

### Requirement: Open amount invariant
The system SHALL compute every Expense's Open amount as the Payment minus the sum of its Bills minus the sum of its Refunds, in integer paise, and SHALL treat an Expense as settled in amount only when the Open amount is zero.

#### Scenario: Partly covered
- **WHEN** an Expense has a Payment of ₹1,000.00, one Bill of ₹400.00 and no Refunds
- **THEN** the Open amount is ₹600.00

#### Scenario: Bills and Refunds together
- **WHEN** an Expense has a Payment of ₹1,000.00, Bills of ₹700.00 and a Refund of ₹300.00
- **THEN** the Open amount is ₹0.00

#### Scenario: Exact in paise
- **WHEN** a Payment of ₹100.05 has a Bill of ₹100.04
- **THEN** the Open amount is exactly 1 paise

### Requirement: Why an Expense is open
The system SHALL show, wherever an open Expense appears, exactly one reason it is open, chosen in this order: awaiting goods (a Bill is expected and not Fulfilled), refund owed (a Refund is expected), bill missing (a Bill is Fulfilled but has no document), mismatch (nothing is expected but Bills plus Refunds differ from the Payment, with the amount), in claim (everything is covered and the Expense waits for Reimbursement).

#### Scenario: Awaiting goods
- **WHEN** an online Expense has an expected Bill
- **THEN** its reason is awaiting goods

#### Scenario: Refund owed
- **WHEN** no Bill is expected and a Refund is expected
- **THEN** its reason is refund owed

#### Scenario: Bill missing
- **WHEN** a Bill is Fulfilled and has no document
- **THEN** its reason is bill missing

#### Scenario: Mismatch
- **WHEN** no Bill or Refund is expected and Bills plus Refunds are ₹50.00 less than the Payment
- **THEN** its reason is "mismatch ₹50.00"
- **AND** it appears at once with no waiting period

#### Scenario: In claim
- **WHEN** all Bills are covered and at least one is claimed and not reimbursed
- **THEN** its reason is in claim

### Requirement: Expense corrections and their lock
The system SHALL keep an Expense's amount, payee, date and Payment method editable until one of its Bills is on a submitted Claim, SHALL write each edit to the audit log, and MUST refuse these edits once any of its Bills is on a submitted Claim.

#### Scenario: Edit before submission
- **WHEN** a Claimant corrects a Payment amount while no Bill is on a submitted Claim
- **THEN** the amount changes and an audit entry is written

#### Scenario: Edit blocked after submission
- **WHEN** a Claimant edits the amount of an Expense with a Bill on a submitted Claim
- **THEN** the system refuses

#### Scenario: Unlocked by recall
- **WHEN** the only Claim holding its Bills is recalled to draft
- **THEN** the Expense's fields are editable again

### Requirement: Closing an Expense
The system SHALL let a Claimant close an Expense as personal, duplicate or written off, MUST ask for each expected Refund whether it stays expected or is written off, SHALL cancel the Expense's unclaimed Bills, and MUST block closing when any Bill is on a submitted Claim.

#### Scenario: Close as personal
- **WHEN** a Claimant closes an open Expense as personal
- **THEN** its unclaimed Bills become cancelled
- **AND** each expected Refund is kept expected or written off as the Claimant chooses

#### Scenario: Paperless tags on close
- **WHEN** an Expense is closed
- **THEN** its documents lose their `reimb:*` tag
- **AND** only closing as personal adds the tag `personal`; duplicate and written off add no tag

#### Scenario: Closing blocked by a submitted Claim
- **WHEN** a Claimant closes an Expense that has a Bill on a submitted Claim
- **THEN** the system refuses

#### Scenario: Closed from open or draft
- **WHEN** an Expense is closed from either draft or open
- **THEN** its status becomes closed

### Requirement: Bill lifecycle
The system SHALL give each Bill one status of expected, ready, claimed, reimbursed or cancelled, and SHALL make a Bill ready only when it is Fulfilled and has a paperless-ngx document.

#### Scenario: Ready needs both
- **WHEN** a Bill is Fulfilled and then a document is attached
- **THEN** its status becomes ready

#### Scenario: Fulfilled without document
- **WHEN** a Bill is Fulfilled and has no document
- **THEN** it is not ready

#### Scenario: Document without fulfilment
- **WHEN** a document is attached to a Bill that is not Fulfilled
- **THEN** it stays expected

#### Scenario: Added to a Claim
- **WHEN** a ready Bill is added to a Claim
- **THEN** its status becomes claimed and it records that Claim

#### Scenario: Reimbursed
- **WHEN** the Claim holding a claimed Bill is marked reimbursed
- **THEN** the Bill's status becomes reimbursed

#### Scenario: Cancelled before fulfilment
- **WHEN** an expected Bill of ₹800.00 is cancelled
- **THEN** its status becomes cancelled
- **AND** an expected Refund of ₹800.00 is created

### Requirement: Bill kinds and remarks
The system SHALL classify every Bill as an Invoice, an Informal bill or a Payment proof, SHALL leave the Bill number empty for the latter two, and SHALL add the remark "Informal/raw bill attached" automatically to an Informal bill.

#### Scenario: Informal bill remark
- **WHEN** a Bill of kind Informal bill is created
- **THEN** its remarks contain "Informal/raw bill attached"

#### Scenario: No number on a Payment proof
- **WHEN** a Payment proof is marked as the Bill
- **THEN** its Bill number is empty

### Requirement: Shop and service Bills start Fulfilled
The system SHALL create the Bill of a shop or service Expense already Fulfilled with the reason bill missing until its document is attached, and SHALL let the Claimant mark the payment confirmation itself as the Bill (Payment proof) when no other document exists.

#### Scenario: Shop Expense
- **WHEN** a shop Expense of ₹250.00 is logged
- **THEN** one Fulfilled Bill of ₹250.00 exists and the reason is bill missing

#### Scenario: Payment proof as Bill
- **WHEN** the Claimant marks the payment confirmation as the Bill
- **THEN** a Payment proof Bill of ₹250.00 is ready

### Requirement: A Bill arriving first
The system SHALL create, for a Bill that arrives with no matching Expense, an Expense and a Fulfilled ready Bill, and MUST NOT require a payment record before the Bill can be claimed. See document-intake for how the Expense is logged.

#### Scenario: Claimable without a payment record
- **WHEN** an Invoice for ₹1,180.00 arrives and matches no Expense
- **THEN** a new Expense and a ready Bill of ₹1,180.00 exist
- **AND** the Bill is claimable without a Payment confirmation

### Requirement: Order splitting
The system SHALL start an online Expense with one expected Bill for the full Payment and reason awaiting goods, SHALL split each delivery's Invoice off the expected Bill as its own Fulfilled Bill so the expected remainder shrinks, and SHALL let each Invoice be claimed on its own.

#### Scenario: Initial expected Bill
- **WHEN** an online Expense of ₹3,000.00 is created
- **THEN** it has one expected Bill of ₹3,000.00

#### Scenario: First delivery
- **WHEN** an Invoice of ₹1,200.00 is attached to that Order
- **THEN** a Fulfilled Bill of ₹1,200.00 exists
- **AND** the expected Bill is ₹1,800.00

#### Scenario: Partly reimbursed Order
- **WHEN** the first Invoice is claimed and reimbursed while ₹1,800.00 remains expected
- **THEN** the Expense stays open

#### Scenario: Smaller invoice
- **WHEN** an Invoice smaller than the open amount matches by order number or shop (see bill-matching)
- **THEN** it splits the expected Bill the same way

### Requirement: The Order page
The system SHALL show an online Expense as an Order page: at the top the Payment (amount, date, method, proof, order number); then each Bill (amount, seller, status) with Move to another payment, Detach (the Bill becomes its own invoice-only Expense) and Edit (opens review); then "Still expected ₹x" with "Item cancelled" (expects a Refund of that amount, and "Refund received" when it lands) and "No more invoices". A small leftover (for example ₹1 from rounding or a coupon) SHALL prompt "₹1 left. Close the order?" and MUST NOT be closed silently. The leftover threshold is an open question.

#### Scenario: Page contents
- **WHEN** a Claimant opens an Order with a Payment of ₹4,870.00 and one Bill of ₹2,100.00
- **THEN** the page shows the Payment first, the Bill with its seller and status, and "Still expected ₹2,770"

#### Scenario: Move
- **WHEN** the Claimant moves a Bill to another payment
- **THEN** the Bill belongs to that Expense

#### Scenario: Detach
- **WHEN** the Claimant detaches a Bill
- **THEN** it becomes its own invoice-only Expense

#### Scenario: Edit
- **WHEN** the Claimant taps Edit on a Bill
- **THEN** review of that Bill opens

#### Scenario: Item cancelled
- **WHEN** the Claimant taps "Item cancelled" for ₹500.00 of the expected ₹2,770.00
- **THEN** an expected Refund of ₹500.00 exists and the expected Bill is ₹2,270.00
- **AND** "Refund received" is offered when the money lands

#### Scenario: Small leftover
- **WHEN** ₹1 is left after the Bills and Refunds
- **THEN** the page asks "₹1 left. Close the order?" and the Order stays open until the Claimant says yes

### Requirement: Order cancellation and Refunds
The system SHALL reduce the expected remainder by a cancelled amount and create an expected Refund of the same amount, SHALL turn the whole remainder into a Refund when everything left is cancelled, SHALL support several Refunds per Expense with reason cancelled, returned or partial, and SHALL let the Claimant mark a Refund received.

#### Scenario: Partial cancellation
- **WHEN** ₹500.00 of an expected remainder of ₹1,800.00 is cancelled
- **THEN** the expected remainder is ₹1,300.00
- **AND** an expected Refund of ₹500.00 exists

#### Scenario: Cancel everything left
- **WHEN** the entire remainder of ₹1,300.00 is cancelled
- **THEN** the expected Bill becomes cancelled
- **AND** an expected Refund of ₹1,300.00 exists

#### Scenario: Refund received
- **WHEN** a Claimant marks an expected Refund received
- **THEN** its status becomes received and the refunded-on date is recorded

#### Scenario: Several Refunds
- **WHEN** an Expense has a cancelled Refund and a returned Refund
- **THEN** both count against the Open amount

### Requirement: Return after delivery before submission
The system SHALL, when a Bill not on a submitted Claim is returned, make it cancelled permanently, create an expected Refund, and MUST NOT let the Bill become ready again, including after a Claim is recalled.

#### Scenario: Return of a ready Bill
- **WHEN** a ready Bill of ₹600.00 is returned
- **THEN** it becomes cancelled
- **AND** an expected Refund of ₹600.00 exists

#### Scenario: Cancelled Bill stays cancelled
- **WHEN** a Claim that once held a returned Bill is recalled and edited
- **THEN** the returned Bill is still cancelled and cannot be added again

### Requirement: Return after submission creates Owed to university
The system SHALL, when a Bill on a submitted Claim is returned and refunded, create an Owed to university record (Claimant, Bill, Claim, amount, status open) with an attention item, SHALL let the Claimant mark it repaid with a date, and MUST NOT show it on any form or as a negative line.

#### Scenario: Return after submission
- **WHEN** a Bill of ₹600.00 on a submitted Claim is returned
- **THEN** an Owed to university record of ₹600.00 with status open exists
- **AND** an attention item is raised

#### Scenario: Repaid
- **WHEN** the Claimant marks the record repaid on a date
- **THEN** its status becomes repaid with that date

#### Scenario: Never on a form
- **WHEN** a later Claim form is produced
- **THEN** no line for the Owed to university record appears

### Requirement: Replacement without money change
The system SHALL leave all amounts and statuses unchanged when an item is replaced with no money change, except that the Bill remains expected for longer.

#### Scenario: Replacement
- **WHEN** a delivered item is replaced and no money moves
- **THEN** the expected Bill and the Open amount do not change

### Requirement: Order completion
The system SHALL mark an Order's Expense settled when its Bills plus Refunds equal the Payment and every Bill is reimbursed or cancelled.

#### Scenario: Complete Order
- **WHEN** a Payment of ₹1,000.00 has a reimbursed Bill of ₹700.00 and a received Refund of ₹300.00
- **THEN** the Expense is settled

#### Scenario: Refund still expected
- **WHEN** the Refund of ₹300.00 is expected and not received
- **THEN** the Expense is not settled (see "Settling needs received Refunds")

### Requirement: Bill corrections after a document is attached
The system SHALL keep a Bill's amount, Bill number and date editable after its document is attached, SHALL show "differs from the document" until the Claimant confirms the document says so, SHALL write each edit to the audit log, and MUST lock these fields once the Bill is on a submitted Claim.

#### Scenario: Reader got the amount wrong
- **WHEN** a Claimant changes a Bill's amount from ₹1,180.00 to ₹1,108.00 after the document is attached
- **THEN** the Bill shows "differs from the document"
- **AND** an audit entry is written

#### Scenario: Confirmed against the document
- **WHEN** the Claimant confirms the document shows the edited values
- **THEN** the "differs from the document" mark is cleared

#### Scenario: Locked after submission
- **WHEN** a Claimant edits the amount of a Bill on a submitted Claim
- **THEN** the system refuses

### Requirement: Settling needs received Refunds
The system SHALL NOT mark an Expense settled while any Refund is still expected, even when the Open amount is zero.

#### Scenario: Expected Refund blocks settled
- **WHEN** the Open amount is zero, all Bills are reimbursed or cancelled and one Refund is expected
- **THEN** the Expense stays open with reason refund owed

### Requirement: Purpose
The system SHALL let a Claimant keep named Purposes, each with a name, its Fund and an active flag; a Purpose is an optional group inside a Fund, and an Expense MAY link to one Purpose of its Fund; Purposes are breakdown groups inside that Fund's Claim. Zero or more Purposes MAY be active at once, an active Purpose MUST preselect its Fund, and ending a Purpose MUST stop it catching new payments without changing Expenses already in it. Each Purpose belongs to one Claimant. Which Fund a new Purpose starts on is an open question.

#### Scenario: New Purpose
- **WHEN** a Claimant creates the Purpose "Robotics trip" in the Fund "Travel grant"
- **THEN** it belongs to that Fund and is active

#### Scenario: No Purpose
- **WHEN** an Expense has no Purpose
- **THEN** it sits in its Fund with no group

#### Scenario: Active Purpose preselects its Fund
- **WHEN** the Purpose "Robotics trip" of the Fund "Travel grant" is the only active Purpose and a payment is logged
- **THEN** the prompt preselects "Travel grant" and the payment goes into that Purpose by default, and one tap puts it elsewhere

#### Scenario: Two active Purposes
- **WHEN** two Purposes are active and a payment is logged
- **THEN** the "What for?" step offers both as choices plus None

#### Scenario: No active Purpose
- **WHEN** no Purpose is active
- **THEN** the step offers no Purpose and the Expense has none

#### Scenario: End trip
- **WHEN** the Claimant ends a Purpose
- **THEN** it stops catching new payments and its existing Expenses keep it

#### Scenario: Other Claimants excluded
- **WHEN** a Claimant lists Purposes
- **THEN** only their own are returned

### Requirement: Funds on the upload prompt
The system SHALL show Funds as choices on the upload and payment prompt in the Claimant's own order, with Makerspace first and preselected, SHALL let each Claimant order and hide Funds for themselves only, and SHALL show the chip as "Makerspace" and, with the Advance on, "Makerspace · Advance". The Fund's "What for?" hint MUST show as grey example text.

#### Scenario: Default order
- **WHEN** a Claimant who has not ordered their Funds opens the prompt
- **THEN** Makerspace is first and preselected

#### Scenario: Own order
- **WHEN** a Claimant moves "Travel grant" above Makerspace
- **THEN** their prompt lists it first and other Claimants' prompts are unchanged

#### Scenario: Hidden Fund
- **WHEN** a Claimant hides a Fund
- **THEN** it is not offered on their prompt and other Claimants still see it

#### Scenario: Chip with the Advance
- **WHEN** the Advance of Makerspace is on for the Claimant
- **THEN** the chip reads "Makerspace · Advance"

#### Scenario: Hint
- **WHEN** the chosen Fund has the "What for?" hint "e.g. soldering supplies"
- **THEN** it shows as grey example text in the "What for?" field

### Requirement: Funds and Purposes work with the Advance on or off
The system SHALL treat Funds and Purposes the same whether a Claimant's Advance is on or off.

#### Scenario: Advance off
- **WHEN** a Claimant has no Advance on any Fund
- **THEN** they still choose Funds, use Purposes and file one Claim per Fund

### Requirement: Advance balance
The system SHALL, when a Claimant's Advance on a Fund is on, compute that Fund's Advance left as the Advance total minus the sum of Payments plus the sum of Refunds received plus the sum of Reimbursements received, over the Claimant's Expenses of that Fund, using the amount actually received; Expenses of other Funds MUST NOT affect it; it MAY go below zero.

#### Scenario: Payment lowers it
- **WHEN** the Makerspace Advance total is ₹10,000.00 and a ₹2,500.00 Payment is logged in Makerspace
- **THEN** Advance left is ₹7,500.00

#### Scenario: Reimbursement raises it
- **WHEN** a Claim that includes that Expense is reimbursed and ₹2,500.00 is received
- **THEN** Advance left is ₹10,000.00

#### Scenario: Refund raises it
- **WHEN** a Refund of ₹500.00 on a Makerspace Expense is marked received
- **THEN** Advance left rises by ₹500.00

#### Scenario: Other Fund untouched
- **WHEN** a ₹4,000.00 Payment is logged in the Fund "Travel grant", which has no Advance on
- **THEN** the Makerspace Advance left does not change

#### Scenario: Below zero
- **WHEN** Advance left would be -₹300.00
- **THEN** it is -₹300.00, meaning ₹300.00 of the Claimant's own money is in

#### Scenario: Moving an Expense
- **WHEN** an Expense moves from the Fund "Travel grant" into Makerspace
- **THEN** the Makerspace Advance left falls by its Payment, and it rises again if the Expense moves back

### Requirement: Home lists and the Advance block
The system SHALL present Home as three lists, Waiting for invoice (open Expenses with no Bill document yet), Ready to file (ready Bills, with one "File" for each Claim that would be built) and Filed awaiting money (submitted Claims not yet reimbursed); an Expense whose Orderer is someone else MUST read "Invoice with <name>" in Waiting for invoice; and for each Fund whose Advance is on, Home SHALL show that Fund's Advance left as a primary block, red below zero, amber when 15% or less of the total is left and green above that, carrying "₹x of your own money in" below zero, and MUST hide the block when that Fund's Advance is off. Placement and visuals are not specified.

#### Scenario: Three lists
- **WHEN** a Claimant opens Home
- **THEN** they see Waiting for invoice, Ready to file and Filed awaiting money

#### Scenario: Invoice with a colleague
- **WHEN** a Payment's Orderer is Priya and no Bill has arrived
- **THEN** its line in Waiting for invoice reads "Invoice with Priya"

#### Scenario: Green
- **WHEN** the Advance total is ₹10,000.00 and ₹1,600.00 or more is left
- **THEN** the block is green

#### Scenario: Amber
- **WHEN** the Advance total is ₹10,000.00 and ₹1,500.00 is left
- **THEN** the block is amber

#### Scenario: Red
- **WHEN** Advance left is -₹300.00
- **THEN** the block is red and reads "₹300.00 of your own money in"

#### Scenario: Advance off
- **WHEN** the Claimant's Advance on a Fund is off
- **THEN** no Advance block is shown for that Fund

#### Scenario: One block per Fund
- **WHEN** the Advance is on for two Funds
- **THEN** Home shows one block for each
