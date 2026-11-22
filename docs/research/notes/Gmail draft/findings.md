# Gmail draft creation for Dues: findings

Researched 2026-11-22 from Google docs only (RFC 6068 for mailto). Claims marked UNVERIFIED were not found in a primary source.

## 1. Scope and verification

- Minimum scope: `https://www.googleapis.com/auth/gmail.compose`. drafts.create accepts exactly three scopes: `mail.google.com/`, `gmail.modify`, `gmail.compose`. Source: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.drafts/create
- Classification: `gmail.compose` is **restricted** ("Manages drafts and sends email"). `gmail.send` is only sensitive but cannot create drafts. Source: https://developers.google.com/workspace/gmail/api/auth/scopes
- Compose also allows sending; there is no draft-only scope. The app just never calls send.
- Public apps with sensitive/restricted scopes must pass OAuth verification: https://support.google.com/cloud/answer/13463073
- Restricted scope data reached "from or through a third-party server" needs a CASA security assessment by a Google-empanelled assessor, repeated at least every 12 months: https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification
- Exemptions listed on that same page (no review needed): personal use by you or a few people you know; apps in testing status with listed test users; internal use by people in your Workspace org with Internal user type.

### (a) Testing status
- Up to 100 test users; users see a warning; authorization expires 7 days after consent. Source: https://support.google.com/cloud/answer/15549945
- Refresh token lasts 7 days for an external consent screen in Testing (unless scopes are only name/email/profile). Source: https://developers.google.com/identity/protocols/oauth2#expiration
- Fine for 4-5 people but each must re-consent weekly. No verification or CASA needed (exemption above).

### (b) Internal app
- Only for projects inside a Google Cloud Organization; authorization limited to org members; outsiders get `org_internal`. Restricted Workspace scopes "may need admin configuration". Source: https://support.google.com/cloud/answer/15549945
- No verification needed for internal use, and no 7-day expiry stated for Internal (the 7-day rule is described for external Testing). Source: restricted-scope page above and oauth2 page above.
- Catch: the project must belong to the university's org, i.e. IT must create or host it.

### (c) Unverified external app, in production
- Shows an "unverified app" screen and is capped at 100 new users over the project's lifetime, which cannot be reset. Source: https://support.google.com/cloud/answer/15549945 and https://support.google.com/cloud/answer/7454865
- No 7-day expiry once In production. Other expiry causes: unused 6 months, user revokes, and a password change for tokens with Gmail scopes. Limit is 100 refresh tokens per account per client ID. Source: oauth2 page above.
- For 4-5 users this is workable, but users click through a warning, and the university admin can still block it (section 2).
- Also noted: "Personal mode" (single creating account, no cap, no 7-day expiry, cannot be changed later) exists. Source: https://support.google.com/cloud/answer/15549945. Not suitable for several users.

## 2. Workspace admin controls

Source for this section: https://knowledge.workspace.google.com/admin/apps/control-which-apps-access-google-workspace-data (redirect target of https://support.google.com/a/answer/7281227)

- Admin console > Security > Access and data control > API controls (needs Service Settings privilege).
- Per-app states: Trusted (all services incl. restricted), Specific Google data (admin-chosen scopes), Limited (unrestricted services only), Blocked (no Google service).
- "Unconfigured third-party apps" policy: allow all (default), allow sign-in basics only, or allow none. Does not affect apps already set Trusted/Limited/Specific.
- Service restriction: setting Gmail to Restricted means only Trusted or Specific-data apps can use it. For Gmail an admin can restrict only high-risk scopes (e.g. send). Restricting revokes tokens of untrusted apps.
- User experience: told the app is blocked, with a default or custom admin message. Where permitted, users can request access; requests appear under "Apps pending review".
- Ask IT to: mark the app Trusted (or "Specific Google data" with gmail.compose) by OAuth client ID, via Configure new app. Give IT the client ID and scope.
- A blocked or restricted app can also surface as `admin_policy_enforced` on token refresh. Source: oauth2 page above.

## 3. Size limits

- drafts.create has two endpoints: `POST https://gmail.googleapis.com/upload/gmail/v1/users/{userId}/drafts` (media upload) and `.../gmail/v1/users/{userId}/drafts` (metadata-only). The reference states NO maximum size. Source: https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.drafts/create
- Upload types: simple (`media`, suggested for roughly 5 MB or less, no metadata), multipart (metadata plus media, media part labelled `message/rfc822`), resumable (recommended for most apps, chunks multiples of 256 KB). Source: https://developers.google.com/workspace/gmail/api/guides/uploads
- The "35 MB API upload limit": UNVERIFIED. I could not find it on any current Google page I fetched. Do not hard-code it.
- The 25 MB figure: Gmail help says personal accounts are limited to 25 MB; for work/school accounts the admin sets separate sending and receiving limits. Over-limit attachments become Google Drive links. Source: https://support.google.com/mail/answer/6584
- The Gmail MCP create_draft tool docs say combined attachments cannot exceed 25 MB (that is a different surface from REST). Source: https://developers.google.com/workspace/gmail/api/reference/mcp/tools_list/create_draft
- Base64: the non-upload path needs `message.raw` as base64URL of the RFC 2822 message. Source: https://developers.google.com/workspace/gmail/api/guides/drafts. Google does not say whether the 25 MB counts encoded size. UNVERIFIED. By arithmetic, MIME base64 inflates about 4/3, so 22 MB raw is about 29-30 MB on the wire, which may exceed 25 MB.
- Practical: use resumable/multipart upload, not JSON `raw`, for big batches; expect the 22 MB case to be at risk. Test with a real ~22 MB draft before relying on it.
- Quota: drafts.create costs 10 units per call. Source: https://developers.google.com/workspace/gmail/api/reference/quota

## 4. Fallbacks if the API is blocked

- mailto: cannot carry attachments. RFC 6068 defines no attachment mechanism, `body` is for short text only, and MIME headers in the URI MUST be ignored. Source: https://www.rfc-editor.org/rfc/rfc6068
- .eml file: I found no Google page on opening .eml in Gmail web. Gmail web does not open .eml as a draft: UNVERIFIED. Works with desktop clients (Apple Mail, Thunderbird, Outlook) that open .eml as an editable message: not checked against primary sources here.
- Drive links: Gmail replaces over-limit attachments with a Drive link (https://support.google.com/mail/answer/6584). Workspace admin sets work-account limits. Behavior for API-created drafts is UNVERIFIED.
- Other fallback: zip/download bundle plus a mailto: with subject and body prefilled; user attaches by hand.

## What this means for Dues

- Use `gmail.compose` (restricted) with a draft-only code path. Cheapest compliant route: keep the app in Testing or Internal; no verification or CASA needed for either.
- Best fit: Internal, if IT will host the Cloud project in the university org and mark the client ID Trusted. No external warning screen. Second best: Testing with 5 listed users, accepting weekly re-consent. An unverified In-production app (100-user lifetime cap, warning screen) works too but is the worst UX.
- Plan for the admin to say no: send IT the client ID and scope, and keep the zip plus mailto fallback ready.
- Build the draft via resumable or multipart upload; do not rely on a 35 MB figure. Verify a ~22 MB batch actually drafts, and fall back to splitting across drafts or Drive links above about 18 MB raw (base64 headroom against 25 MB).
