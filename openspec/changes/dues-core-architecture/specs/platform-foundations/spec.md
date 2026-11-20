## ADDED Requirements

### Requirement: Money stored as integer paise
The system SHALL store every money amount as an integer number of paise together with a currency code, and SHALL display amounts in rupees with two decimal places. The system MUST NOT store or compute money with fractional or floating-point values.

#### Scenario: Amount stored as paise
- **WHEN** a Claimant records a Payment of ₹2,500.50
- **THEN** the stored amount is 250050 paise with currency code INR
- **AND** it is displayed as ₹2,500.50

#### Scenario: Sums stay exact
- **WHEN** the system adds three Bills of ₹0.10, ₹0.20 and ₹0.30
- **THEN** the sum is exactly 60 paise

### Requirement: Paise kept as printed; only the Claim total is rounded
The system SHALL keep every amount (Payment, Bill, Refund, Claim line, Ledger line, Owed to university) at the exact paise printed on its document or entered by the Claimant, everywhere it is stored, shown or written to the form. The only rounded figure in the system MUST be a Claim's total, which `claims` rounds up to whole rupees.

#### Scenario: Invoice paise preserved
- **WHEN** an Invoice for ₹1,180.25 is attached as a Bill
- **THEN** the Bill amount is 118025 paise
- **AND** its form row shows 1180.25/-

#### Scenario: Only the form total rounds
- **WHEN** a Claim's lines are ₹1,180.25 and ₹99.50
- **THEN** both rows keep their paise on the form
- **AND** only the total shows ₹1,280.00

### Requirement: Keys and References
The system SHALL key every record with a UUIDv7 that is never shown to people, and SHALL give every Expense, Bill, Refund and Owed to university record a Reference made of a type letter and one global sequence per type with no zero padding (E-213, B-431, R-12, O-1). A Reference MUST be unique across all Claimants and MUST NOT change once issued. The vendor's Bill number MUST be stored separately and MUST NOT be replaced by a Reference.

#### Scenario: Global across Claimants
- **WHEN** two Claimants each log their first Expense of the day
- **THEN** they receive different References, such as E-213 and E-214

#### Scenario: Reference survives correction
- **WHEN** a Claimant corrects the Bill number of B-431 from 128 to 1280
- **THEN** the Bill is still B-431 and its paperless custom field is unchanged

#### Scenario: No padding
- **WHEN** the ten-thousandth Expense is logged
- **THEN** its Reference is E-10000

### Requirement: Moments stored in UTC
The system SHALL store every moment (creation, update, state change, audit entry, webhook receipt) as a UTC timestamp and SHALL exchange moments as ISO 8601 text with an offset. Hosts, containers, the database and scheduled jobs MUST run in UTC.

#### Scenario: Moment exchanged with offset
- **WHEN** a state change is recorded at 14:44:10 IST on 20 November
- **THEN** it is stored and exchanged as 2026-11-20T09:14:10Z

#### Scenario: Scheduled job in UTC
- **WHEN** a scheduled job is defined
- **THEN** it runs on a UTC clock
- **AND** its definition carries a comment with the IST equivalent

### Requirement: Business dates are plain dates
The system SHALL store business dates (paid on, Bill date, refunded on, submitted on, reimbursed on) as plain calendar dates, exactly as the Claimant experienced them, and MUST NOT convert them between time zones.

#### Scenario: Late-night Payment keeps its day
- **WHEN** a Payment is made at 00:30 in the Claimant's zone on 5 March
- **THEN** its paid-on date is 5 March
- **AND** it is not stored as 4 March

### Requirement: Display in the Claimant's zone
The system SHALL display moments, decide "today" and age reminders in the viewing Claimant's time zone, and SHALL read dates extracted from documents in that zone. See identity-access for the time-zone setting.

#### Scenario: Display follows the setting
- **WHEN** a Claimant whose zone is Asia/Kolkata views a state change stored as 2026-11-20T09:14:10Z
- **THEN** it is shown as 14:44 on 20 November

#### Scenario: Document date read in the Claimant's zone
- **WHEN** a payment screenshot shows 00:30 on 5 March in the Claimant's zone
- **THEN** the extracted date is 5 March, not the previous UTC day

### Requirement: Append-only audit log
The system SHALL write an audit entry (who, what, when, from-state, to-state) before every state change and every edit of an Expense, Bill, Refund, Claim or Owed to university record. Audit entries MUST NOT be edited or deleted.

#### Scenario: Entry written before change
- **WHEN** a Claimant corrects an Expense amount
- **THEN** an audit entry with the actor, the old value, the new value and the moment is written before the new value is stored

#### Scenario: Entry cannot be altered
- **WHEN** any user or API call attempts to modify or delete an existing audit entry
- **THEN** the system rejects the attempt
- **AND** the entry is unchanged

#### Scenario: Failed audit write blocks the change
- **WHEN** the audit entry cannot be written
- **THEN** the state change is not applied

### Requirement: Upload validation
The system SHALL accept uploads only of type PDF, JPEG, PNG or HEIC, SHALL enforce a maximum file size, MUST NOT execute uploaded content, and SHALL serve downloads as attachments.

#### Scenario: Unsupported type rejected
- **WHEN** a Claimant uploads a file of an unsupported type
- **THEN** the system rejects it with a message naming the allowed types

#### Scenario: Oversized file rejected
- **WHEN** an upload exceeds the maximum size
- **THEN** the system rejects it and stores nothing

#### Scenario: Downloads are attachments
- **WHEN** a Claimant downloads a stored file
- **THEN** it is served as an attachment and is not rendered inline

### Requirement: Backups
The system SHALL back up the database and the document store to a target other than the host's local disk, and a restore MUST have been tested before go-live.

#### Scenario: Backup target separate from host
- **WHEN** a backup completes
- **THEN** the dump and the documents exist on a target other than the Proxmox host's local disk

#### Scenario: Go-live blocked without a tested restore
- **WHEN** no restore has been tested
- **THEN** the system MUST NOT be declared ready for go-live

### Requirement: Documents on local disk until the NAS is ready
The system SHALL keep documents on the paperless-ngx local disk with its own nightly backup until the maintainer has approved moving them to the dedicated NAS dataset, and that move MUST NOT start before the NAS has snapshots, an off-site backup and healthy disks.

#### Scenario: Launch before the NAS is ready
- **WHEN** the NAS lacks snapshots or an off-site backup
- **THEN** documents stay on the local disk with the nightly backup

#### Scenario: Move needs approval
- **WHEN** the NAS is ready
- **THEN** documents are moved only after the maintainer approves

### Requirement: Deployment shape and network exposure
The system SHALL run as Docker Compose services (the app, the database and Gotenberg) in a dedicated container addressed by a DHCP reservation, served at the placeholder host dues.example.org through the internal reverse proxy, and MUST NOT be published on the public reverse proxy. The database and Gotenberg MUST be reachable only from the internal network, and the app port only from the reverse proxy and paperless-ngx.

#### Scenario: Internal services unreachable from outside
- **WHEN** a host other than the app container connects to the database or Gotenberg port from outside the internal network
- **THEN** the connection is refused

#### Scenario: App port limited
- **WHEN** a host that is neither the reverse proxy nor paperless-ngx connects to the app port
- **THEN** the connection is refused

#### Scenario: Not public
- **WHEN** the deployment is configured
- **THEN** the app is absent from the public reverse proxy's routes

### Requirement: The app is the only access gate
The system SHALL check the session and Claimant ownership on every API call (an `admin` Actor passes the ownership check, see identity-access), because the network does not isolate hosts, and SHALL show a Claimant only their own Expenses, Bills, Claims and documents.

#### Scenario: Other Claimant's record
- **WHEN** a Claimant requests an Expense that belongs to another Claimant
- **THEN** the system responds as if it does not exist

#### Scenario: Unauthenticated call
- **WHEN** a request carries no valid session
- **THEN** the system rejects it before reading any data

### Requirement: Change control for infrastructure
The system's deployment procedure SHALL perform each write to the identity provider, the NAS, the reverse proxy or the firewall one at a time, with the maintainer's explicit approval and a backup of the configuration taken first.

#### Scenario: Approved single change
- **WHEN** a change to the reverse proxy configuration is needed
- **THEN** the configuration is backed up first
- **AND** the change is applied alone after the maintainer approves

#### Scenario: No approval
- **WHEN** the maintainer has not approved a change
- **THEN** it MUST NOT be applied
