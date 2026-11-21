# A confirmed Bill reopens on any value change; one undo per Bill; Cmd+Z names its steps

Reviewing a Bill ends with one confirm. Three rules govern what happens after it. (1) A confirmed Bill reopens when any of its values changes, by any path: typing, pointing, choosing a candidate or marking a region. It must be confirmed again, and its primary reads "Confirm again". Choosing to keep the reader's value changes nothing and does not reopen. (2) Each Bill has one "Undo confirm", offered until the Bill is on a submitted Claim; it restores the values as they were before the confirm and puts the Bill back in review. A single value is corrected by editing it, which reopens the Bill. A toast's Undo is bound to the Bill it names. (3) Cmd+Z steps back one entry at a time, and every entry has a name ("Undone: date edit, B-431"), so the Claimant always knows what went.

## Considered Options

- **Edits keep a confirmed Bill confirmed**: rejected; a Bill could carry values nobody looked at after the edit. Owner, 21 Nov 2026: "reconfirm".
- **Per-field undo buttons**: rejected; clutter on every row, when editing a value back is one click.
- **Cmd+Z only, no visible Undo**: rejected; the phone has no Cmd+Z and the status line is where the Claimant looks.

## Consequences

- The Bill state machine has a transition from confirmed back to review. **`docs/spec/FUNCTIONAL.md` §3.2 does not describe field confirmation or this transition and needs it** (not edited here).
- Every confirm, reopen, edit and undo is an audit log entry with the Bill Reference and the field, so Cmd+Z labels come from the log.
- Once a Bill is on a submitted Claim, none of this applies: its values are locked (FUNCTIONAL §3.2) and Undo confirm is no longer offered. Whether a recalled Claim (§3.3) makes its Bills editable again is for FUNCTIONAL to say.
