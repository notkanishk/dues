# The app builds Claims itself; Claude is an optional helper

Because any Claimant can use the tracker, filling the Contingency Reimbursement Form, producing its PDF and assembling the submission email must be features of the app, not hand-offs to Claude on the maintainer's Mac. The app fills the form from a per-Claimant profile (name, employee code, designation, Approvers) and the Claim's Bills. Claude remains useful for jobs that need a browser session (reading Amazon orders, downloading invoices or statements) and for the maintainer's own convenience, but nothing in the core path depends on it.

## Consequences

- The form template (today `Template/Reimbursement Form Template.docx`, filled via Word on the Mac) must be reproducible server-side, e.g. by filling the docx with a library and converting with LibreOffice in the container, or by generating the PDF directly. Output must match the current form exactly.
- The email cannot be sent from the Claimant's Gmail by the app without OAuth scopes; v1 produces a ready-to-send package (PDF, bills, subject, body) that the Claimant sends themselves.
- The "hand-off to Claude" buttons in `mockup/DESIGN.md` become app actions; only browser-scraping jobs stay as optional hand-offs.
