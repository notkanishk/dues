## ADDED Requirements

### Requirement: Sign-in through Zitadel
The system SHALL authenticate users only through Zitadel (OIDC authorization code with PKCE, confidential web client, project "Reimbursements"), SHALL key each user on the Zitadel subject and not on email, and MUST NOT store local passwords or keep a second user database beyond the Claimant profile.

#### Scenario: First sign-in creates a profile
- **WHEN** a user with a valid Zitadel session and the `claimant` role signs in for the first time
- **THEN** the system creates a Claimant profile keyed on the Zitadel subject with name and email from Zitadel

#### Scenario: Email change keeps the account
- **WHEN** a Claimant's email changes in Zitadel
- **THEN** the same Claimant profile is used because the subject is unchanged

### Requirement: Role gate
The system SHALL grant access only when the `roles` claim contains `claimant`, and SHALL give no access, and no self-service onboarding, to a user without it. The `admin` role MUST be recognised as a separate role that may see and do everything in the app, across all Claimants (including other Claimants' Expenses, Bills and Claims); every admin action on another Claimant's data MUST be written to the audit log with the admin as actor. Roles are granted and reviewed outside the app.

#### Scenario: Missing role
- **WHEN** a user signs in through Zitadel without the `claimant` role
- **THEN** the system shows no data and offers no way to request access in the app

#### Scenario: Role removed
- **WHEN** a Claimant's `claimant` role is removed
- **THEN** the next request from that Claimant is refused

### Requirement: Claimant profile
The system SHALL keep for each Claimant the full name, employee code and designation the university form needs, entered once by the Claimant because Zitadel supplies only name and email. The profile holds no Approvers field: each Fund's mail builder holds its own To and CC, which a Claimant's personal version of the Fund can change (see claims).

#### Scenario: Profile gaps filled once
- **WHEN** a Claimant first signs in
- **THEN** employee code and designation are empty
- **AND** the Claimant can enter them once and they are reused on every Claim

#### Scenario: Claim blocked by an incomplete profile
- **WHEN** a Claimant without an employee code builds a Claim form
- **THEN** the system asks for the missing field before producing the form

#### Scenario: No Approvers field
- **WHEN** a Claimant opens their profile
- **THEN** it has no Approvers field, and recipients come from the Fund's To and CC

### Requirement: Claimant-defined Payment methods
The system SHALL let each Claimant define, rename and archive their own Payment methods (for example a savings account, a credit card, a UPI app), MUST NOT hard-code any Payment method, and SHALL let each carry optional match hints (bank name, card last four digits, UPI handle) used to recognise it on a payment confirmation.

#### Scenario: Method with hints
- **WHEN** a Claimant defines "Travel card" with the hint "card ending 1234"
- **THEN** a payment confirmation showing a card ending 1234 is matched to "Travel card"

#### Scenario: Archived method
- **WHEN** a Claimant archives a Payment method
- **THEN** it is no longer offered for new Payments
- **AND** existing Expenses that used it keep it

#### Scenario: Methods are private
- **WHEN** one Claimant defines a Payment method
- **THEN** other Claimants do not see it

### Requirement: Claimant time zone
The system SHALL store an IANA time zone for each Claimant, defaulting to Asia/Kolkata and suggested from the browser on first sign-in, and SHALL use it for display, "today", reminder ageing and the submission month of a Claim name.

#### Scenario: Default zone
- **WHEN** a Claimant's browser reports no usable zone on first sign-in
- **THEN** the zone is Asia/Kolkata

#### Scenario: Suggested zone
- **WHEN** a Claimant's browser reports Europe/Berlin on first sign-in
- **THEN** the system suggests Europe/Berlin and applies it only after the Claimant confirms

#### Scenario: Zone decides the month
- **WHEN** a Claimant in Asia/Kolkata submits at 01:00 IST on 1 December, which is 19:30 UTC on 30 November
- **THEN** the Claim's submission month is December

### Requirement: Notification preferences
The system SHALL store per Claimant whether Web Push is on or off and the time of the daily nudge, and MUST NOT send a push while it is off. See reminders for what is sent.

#### Scenario: Push off
- **WHEN** a Claimant has Web Push off
- **THEN** no push is sent to that Claimant

#### Scenario: Daily time
- **WHEN** a Claimant sets the daily nudge to 09:00
- **THEN** the daily nudge is due at 09:00 in that Claimant's zone

### Requirement: People for Orderers and Payback payees
The system SHALL keep a list of Persons (name, optional UPI handle, optional link to a Claimant) for use as Orderer and as Payback payee.

#### Scenario: Linked Person
- **WHEN** a Person is linked to a Claimant
- **THEN** that link is available when offering a Payback link (see paybacks)

#### Scenario: Unlinked Person
- **WHEN** a Person has no Claimant link
- **THEN** the Person can still be chosen as Orderer or payee

### Requirement: Admin sees everything
The system SHALL let a user with the `admin` role read and act on every Claimant's data, and SHALL record the acting admin in the audit log for each change.

#### Scenario: Admin views another Claimant's Claim
- **WHEN** an admin opens another Claimant's submitted Claim
- **THEN** the system shows it in full

#### Scenario: Admin change audited
- **WHEN** an admin corrects another Claimant's Expense amount
- **THEN** the audit log records the admin as actor and the Claimant as owner

### Requirement: Consent to external reading
The system SHALL keep, per Claimant, a setting that allows their documents to be read by external providers, off by default and changeable at any time, and SHALL record each change in the audit log.

#### Scenario: Default off
- **WHEN** a new Claimant signs in for the first time
- **THEN** external reading is off for them

#### Scenario: Opt in
- **WHEN** a Claimant turns external reading on
- **THEN** their next uploads may be read by external providers and the audit log records the change

### Requirement: Advance is a personal amount on a Fund
The system SHALL keep per Claimant and Fund whether the Advance is on and, when on, one total amount in paise, off by default, and MUST NOT share it with any other Claimant, even on a team Fund. The system MUST NOT keep top-up or return records: the Claimant edits the total. See expense-tracking for the balance.

#### Scenario: Default off
- **WHEN** a new Claimant signs in for the first time
- **THEN** their Advance is off on every Fund

#### Scenario: Turn on
- **WHEN** a Claimant turns the Advance on for Makerspace and enters ₹10,000.00
- **THEN** their Makerspace Advance total is ₹10,000.00

#### Scenario: Edit the total
- **WHEN** the Claimant changes the total to ₹15,000.00
- **THEN** the total is ₹15,000.00 and no top-up record is made

#### Scenario: Never shared
- **WHEN** a Fund is shared with the team and one Claimant has an Advance on it
- **THEN** other Claimants see no Advance on that Fund and their own is unaffected

### Requirement: Fund sharing and edit rights
The system SHALL keep a new Fund private to its creator, SHALL make it a team Fund when the creator chooses "Share with team", and SHALL let only an admin and the Fund's creator edit the team version. Any Claimant MAY make a personal version of a team Fund's mail, form, file-name pattern or "What for?" hint that affects only them (see claims). Every admin edit of a team Fund MUST be written to the audit log with the admin as actor.

#### Scenario: Private by default
- **WHEN** a Claimant creates a Fund
- **THEN** only they can see and use it

#### Scenario: Share with team
- **WHEN** the creator chooses "Share with team"
- **THEN** every Claimant can use the Fund

#### Scenario: Who edits the team version
- **WHEN** a Claimant who is neither an admin nor the creator tries to edit the team version
- **THEN** the system refuses, and offers "my version" instead

#### Scenario: Admin edit
- **WHEN** an admin edits a team Fund's mail
- **THEN** it takes effect for every Claimant without a personal version and the audit log records the admin as actor

#### Scenario: Creator edit
- **WHEN** the creator edits the team version
- **THEN** it takes effect for every Claimant without a personal version
