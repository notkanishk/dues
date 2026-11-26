---
status: accepted, scope narrowed to the maintainer's own folder (other Claimants use the app only; documents of record live per ADR-0004)
---

# Mac folder and paperless-ngx sync is additive and keyed by checksum

Bill files live both in the Mac Reimbursement folder (where Claude builds Claims) and in paperless-ngx (where phone uploads land and OCR runs). Sync only ever adds: a file new on one side is copied to the other, and nothing is ever deleted, renamed or moved across. A file and a paperless document are the same thing when the file's SHA-256 equals the document's `checksum` (paperless 3.x stores the SHA-256 of the original; verified 2026-11-20 on the paperless host), so renaming or moving a file on the Mac never breaks the link.

## Considered Options

- **Mount the Reimbursement folder as paperless's consume folder**: rejected. paperless deletes files from the consume folder after ingesting them, which would empty the root folder.
- **Full two-way mirror (deletes and renames propagate)**: rejected. One accidental delete on either side would remove the only copy of a bill, and folder moves (root → WorkingN → Filed) are workflow steps, not document changes.
- **One side only**: rejected by the user; Claude needs local files for forms and email attachments, and the phone needs paperless for capture.

## Consequences

- Deleting a bill must be done by hand on both sides.
- Folder location (root, WorkingN, Filed/<year>/<Claim>) is not mirrored into paperless; claim membership is written to paperless as metadata instead.
- paperless 3.x accepts re-uploads of an identical file (it only logs a warning), so the sync itself must check `checksum` before uploading; Dues' duplicate guard catches anything that slips through.
