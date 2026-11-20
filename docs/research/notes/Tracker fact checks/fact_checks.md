# Fact checks: paperless-ngx 3.2.1 reimbursement tracker

Researched 2026-11-20. Read-only. Source code read at tag `v3.2.1` (raw.githubusercontent.com/paperless-ngx/paperless-ngx/v3.2.1/...). docs.paperless-ngx.com returned HTTP 403 to the fetcher, so the docs were read from the identical markdown in the repo at the same tag (`docs/*.md`), which is the primary source of the published site. Latest upstream release at research time is v3.5.1 (2026-11-18); 3.2.1 is older, so behaviour below is as of 3.2.1 unless noted.

Base for all repo links: `https://github.com/paperless-ngx/paperless-ngx/blob/v3.2.1/`

## Answers

1. OIDC + Zitadel: HIGH confidence on config, callback URI, auto-signup, default permissions, token generation and upload ownership (all read from 3.2.1 source). MEDIUM on Zitadel roles-as-groups (claim is an object, not a list; works by code reading only, not tested). Zitadel gotchas: MEDIUM.
2. Phone apps: HIGH on facts listed (repos/manifests read). Best fit for "share image from payment app, one tap, right user, OIDC-only account": **Swift Paperless (iOS)** (OIDC + share extension accepting images) and **Less Paper (iOS, plu/less-paper)** also fits. On Android no app with confirmed OIDC login + image share exists; best is **Paperless NGX Uploader (gmag11)** using a pasted personal API token. MEDIUM-HIGH.
3. Payment apps share image vs text: LOW. Only Google Pay and Paytm have an official Share button confirmed; none of the six official sources states image vs text. Device test is the final check.

## 1. paperless-ngx 3.x + Zitadel OIDC

### 1.1 Configuration
- Install allauth OIDC app and provider JSON. Verbatim example (Keycloak) from `docs/advanced_usage.md` section "OpenID Connect and social authentication" (lines ~1093-1121):
  ```
  PAPERLESS_APPS="allauth.socialaccount.providers.openid_connect"
  PAPERLESS_SOCIALACCOUNT_PROVIDERS='{"openid_connect": {"APPS": [{"provider_id": "keycloak","name": "Keycloak","client_id": "paperless","secret": "<CLIENT_SECRET>","settings": { "server_url": "https://<KEYCLOAK_SERVER>/realms/<REALM>/.well-known/openid-configuration"}}]}}'
  ```
  https://github.com/paperless-ngx/paperless-ngx/blob/v3.2.1/docs/advanced_usage.md#L1093
  For Zitadel substitute `provider_id: "zitadel"` and `server_url: "https://<zitadel-host>/.well-known/openid-configuration"` (allauth appends `/.well-known/openid-configuration` itself if missing: `OpenIDConnectProvider.wk_server_url`, https://codeberg.org/allauth/django-allauth/src/branch/main/allauth/socialaccount/providers/openid_connect/provider.py).
- Per-app `settings` keys (allauth docs, https://docs.allauth.org/en/latest/socialaccount/providers/openid_connect.html): `server_url`, `fetch_userinfo`, `oauth_pkce_enabled` (default off), `token_auth_method` (`client_secret_basic` | `client_secret_post`), `uid_field`, `openid_configuration_overrides`.
- Env var behaviour, from `docs/configuration.md` and `src/paperless/settings/__init__.py` (lines 326-347):
  - `PAPERLESS_SOCIAL_AUTO_SIGNUP` default False ("Attempt to signup the user using retrieved email, username etc"). docs/configuration.md#L747; settings L331. With False, allauth shows its own signup form on first login; set True for silent creation.
  - `PAPERLESS_SOCIALACCOUNT_ALLOW_SIGNUPS` default True. docs/configuration.md#L755; settings L327-330.
  - `PAPERLESS_DISABLE_REGULAR_LOGIN` default False; "does not disable the Django admin login nor logging in with local credentials via the API" (so `/api/token/` with a local password still works). docs/configuration.md#L828; enforced in `CustomAccountAdapter.pre_authenticate`, src/paperless/adapter.py.
  - `PAPERLESS_REDIRECT_LOGIN_TO_SSO` default False; JS redirect to first SSO provider. docs/configuration.md#L835.
  - `PAPERLESS_URL`: e.g. `https://paperless.domain.com`, no trailing slash, no path. Sets ALLOWED_HOSTS/CORS/CSRF. docs/configuration.md#L468. Also `PAPERLESS_ACCOUNT_DEFAULT_HTTP_PROTOCOL` defaults `https` and is used when "generating URLs, e.g. login callback URLs" (docs/configuration.md#L806). Behind a TLS proxy make sure the scheme is https or the redirect_uri sent to Zitadel will be http.
  - `PAPERLESS_ACCOUNT_EMAIL_VERIFICATION` defaults `optional`, forced to `none` if no email server configured (settings L361-368).
  - Docs require setting `settings.token_auth_method` if the IdP needs a specific token endpoint auth method (docs/configuration.md#L742).

### 1.2 Callback / redirect URI to register in Zitadel
- Format: `https://<host>/accounts/oidc/<provider_id>/login/callback/` where `<provider_id>` is the `provider_id` in the JSON. Source: allauth docs "`/accounts/oidc/{id}/login/callback/` where `{id}` is the configured app's `provider_id`" (https://docs.allauth.org/en/latest/socialaccount/providers/openid_connect.html); `get_callback_url` reverses `openid_connect_callback` with `provider_id` (allauth provider.py above). Note the trailing slash.
- Zitadel requires registered redirect URIs to match exactly, and non-https only with Dev Mode on: https://zitadel.com/docs/guides/manage/console/applications ; https://zitadel.com/docs/guides/integrate/login/oidc/login-users
- Paperless itself does not document the URI; derived from allauth. (Confirm by hitting the Login button once and reading the `redirect_uri` in the browser URL.)

### 1.3 User creation and default permissions
- Users are created on first OIDC login only if signups are open (`SOCIALACCOUNT_ALLOW_SIGNUPS` true, default) and, for no-prompt creation, `PAPERLESS_SOCIAL_AUTO_SIGNUP=true`. `CustomSocialAccountAdapter.is_open_for_signup`, src/paperless/adapter.py.
- Default permissions: "By default, new users are not granted any permissions, except those inherited from any group(s) of which they are a member." docs/usage.md#L410. Groups for social signups come from `PAPERLESS_SOCIAL_ACCOUNT_DEFAULT_GROUPS` (comma list, groups must already exist; applied on signup; combined with `PAPERLESS_ACCOUNT_DEFAULT_GROUPS`). docs/configuration.md#L797; `CustomSocialAccountAdapter.save_user`.
- IMPORTANT for uploads: `post_document` rejects users lacking `documents.add_document` with 403 "Insufficient permissions" (src/documents/views.py L3449, class `PostDocumentView` at L3443). So the default group must carry "Add Document" (and view own docs works by ownership).
- Fresh install quirk: if no non-system users and no documents exist, the first account created becomes superuser (`CustomAccountAdapter.save_user`). Only applies to the very first account.
- Group sync from claim: `PAPERLESS_SOCIAL_ACCOUNT_SYNC_GROUPS=true`; claim name default `groups`, override with `PAPERLESS_SOCIAL_ACCOUNT_SYNC_GROUPS_CLAIM`; groups must already exist and match by name; synced on every login with `groups.set(..., clear=True)` so it REPLACES membership (including default groups). docs/configuration.md#L762-L778; src/paperless/signals.py `handle_social_account_updated` (reads `extra_data[claim]`, falling back to `extra_data["userinfo"][claim]` or `["id_token"][claim]`; a bare string is wrapped into a list). Docs also say add the claim's scope to `SCOPE`, e.g. `{"openid_connect":{"SCOPE": ["openid","profile","email","groups"]...`. Extra: `..._SYNC_SUPERUSER_GROUP` and `..._SYNC_STAFF_GROUP` exist in 3.2.1 (docs/configuration.md#L775-L795).
- Zitadel caveat (UNCONFIRMED by test): Zitadel exposes roles in claim `urn:zitadel:iam:org:project:roles` as a JSON object (role key -> {orgId: domain}), not a list ("When roles are asserted, ZITADEL does this by providing the `id` and `primaryDomain` below the role", https://zitadel.com/docs/apis/openidoauth/claims). paperless does `Group.objects.filter(name__in=social_account_groups)`; with a dict that iterates keys, so it should work with `PAPERLESS_SOCIAL_ACCOUNT_SYNC_GROUPS_CLAIM=urn:zitadel:iam:org:project:roles`, but this is inferred from code, not documented. Simpler/safer: skip sync and use `PAPERLESS_SOCIAL_ACCOUNT_DEFAULT_GROUPS`.

### 1.4 Personal API token for an OIDC-only user, and upload ownership
- UI: "You can create (or re-create) an API token by opening the 'My Profile' link in the user dropdown ... and clicking the circular arrow button." docs/api.md#L28-L33. Endpoint behind the button: `POST /api/profile/generate_auth_token/` (`GenerateAuthTokenView`, `permission_classes=[IsAuthenticated]`, deletes old token, creates new, returns key). src/paperless/views.py L383-L398; route src/paperless/urls.py L229-L240. Works with a session login, so an OIDC-only user can use it. The profile dialog does not gate the token field on a usable password; only the password-change inputs are gated on `hasUsablePassword()` (src-ui/src/app/components/common/profile-edit-dialog/profile-edit-dialog.component.html L33-L78, .ts L59/L108). Token use: `Authorization: Token <token>` (docs/api.md#L35-L45).
- `/api/token/` (username+password) will not work for a user with no local password; use the profile token. (Inference from the endpoint's name, UNCONFIRMED by test.)
- Ownership on upload: `PostDocumentView.post` builds `DocumentMetadataOverrides(..., owner_id=request.user.id, ...)` (src/documents/views.py L3487-L3498). Consumer applies it: `if self.metadata.owner_id: document.owner = User.objects.get(pk=self.metadata.owner_id)` (src/documents/consumer.py L927-L930). So uploads via that user's token are owned by that user. The documented optional form fields for `post_document` do not include `owner` (docs/api.md#L185-L214), so the client cannot override it in 3.2.1.
- Headless alternative: allauth exposes `api/auth/` for third-party apps to sign in with social accounts (docs/api.md#L55-L60; `DrfTokenStrategy` in src/paperless/adapter.py returns the DRF token).

### 1.5 Zitadel-specific gotchas
- PKCE: Zitadel recommends PKCE for all app types ("regardless of the app type we recommend using Proof Key for Code Exchange (PKCE)"), only S256. https://zitadel.com/docs/guides/integrate/login/oidc/login-users . For a Web app type Zitadel offers PKCE, Code (client secret), JWT, Post; PKCE recommended https://zitadel.com/docs/guides/manage/console/applications . allauth defaults PKCE off (`oauth_pkce_enabled`), and `token_auth_method` is optional. Practical choice: Zitadel app type Web, auth method "Code" (client_secret_basic) with `"token_auth_method":"client_secret_basic"`, or set `"oauth_pkce_enabled": true` with PKCE auth method. Exact working combination UNCONFIRMED (no test).
- Scopes: allauth default scope is `openid profile email` (provider.py `get_default_scope`). Zitadel: `openid` mandatory; role scopes `urn:zitadel:iam:org:project:role:{rolekey}` or enable assert-all-roles on the project. https://zitadel.com/docs/apis/openidoauth/scopes
- email_verified: allauth maps `email_verified` into the EmailAddress `verified` flag (`extract_email_addresses`). Zitadel emits `email_verified` "when requested" in userinfo, and in the ID token only for response_type `id_token` (https://zitadel.com/docs/apis/openidoauth/claims). allauth by default calls userinfo (`fetch_userinfo` default True in views.py L82), so keep that on. Zitadel Console has "User Info inside ID Token" and "User Roles inside ID Token" options for the app (https://zitadel.com/docs/guides/manage/console/applications).
- `preferred_username` is used as paperless username, `email` as email (`extract_common_fields`). Zitadel's `preferred_username` is usually `user@domain` style login name, so usernames will look like emails. UNCONFIRMED against a live Zitadel.
- Zitadel Dev Mode needed if redirect is http (e.g. testing without TLS).

## 2. Phone uploader apps

Source list: paperless-ngx wiki "Related Projects" (user-maintained; docs/usage.md#L190 "Mobile upload" points to it, "the current Paperless-ngx team does not explicitly endorse" them): https://github.com/paperless-ngx/paperless-ngx/wiki/Related-Projects . Dates from GitHub API at research time.

| App | Platform | Last release / last push | Share-sheet | Auth | OIDC-only account? |
|---|---|---|---|---|---|
| Swift Paperless (paulgessinger) https://github.com/paulgessinger/swift-paperless | iOS | v1.10.4, 2026-10-20; push 2026-11-19 | Yes, iOS Share Extension; activation rule accepts `public.image` and `com.adobe.pdf`, max 10 attachments (ShareExtension/Info.plist) | Username/password, token, and OIDC (docs/oidc.md: needs Paperless 3.0+, provider must allow PKCE public client with no secret, redirect URI `x-paperless://oidc-callback`; TOTP supported) | Yes, designed for it |
| Less Paper (plu) https://github.com/plu/less-paper | iOS/iPadOS | v3.0.10+398, 2026-11-06; push 2026-11-20 | Yes, "share sheet extension for getting documents in from anywhere" (README) | OIDC via system browser; redirect URI `atlp://oidc-callback`, public PKCE exchange, no secret (README "Single sign-on (OIDC)"); also client certs, custom headers | Yes. Share-extension accepted file types UNCONFIRMED |
| Less Paper (AptumTek) / Paperparrot / others | iOS | Not checked (Paperparrot repo last push 2023-06-09) | n/a | n/a | UNCONFIRMED |
| Paperless NGX Uploader (gmag11) https://github.com/gmag11/Paperless_ngx_uploader | Android (F-Droid/IzzyOnDroid) | 1.8.5, 2026-09-30; push 2026-10-20 | Yes, `SEND`/`SEND_MULTIPLE` for `*/*` plus `text/plain`, plus "Open with" for pdf/jpeg/png/tiff/gif/webp (AndroidManifest.xml, README) | Per-server username/password or token; README: "if your instance uses OpenID—an access token" | Yes via pasted profile API token (no in-app OIDC flow). Upload as that token's user |
| Paperless Mobile (astubenbord) https://github.com/astubenbord/paperless-mobile | Android | v4.5.0, 2026-04-16 (latest stable); v5.0.0-alpha tags exist; push 2026-11-15 | Yes, `SEND`/`SEND_MULTIPLE` for `image/*`, pdf, doc, docx etc. (android/app/src/main/AndroidManifest.xml); README "Upload existing documents by sharing files" | Username/password (plus 2FA, mTLS). OIDC: feature request #374 still open; bug #385 "Login not possible ... with OIDC" closed | Not confirmed working. Token-only login UNCONFIRMED. Also needs Users View and UISettings View permissions (README L142) |
| Waraq (mhakmi) https://github.com/mhakmi/waraq | Android | tag v0.3.1; closed testing on Google Play; push 2026-10-31 | Imports "files ... shared from other apps" (README architecture) | Username/password or API token via `POST /api/token/` flow (README) | Token option likely; UNCONFIRMED. Early-stage, 1 star |
| ScanToPaperless (garo) | Android | v0.0.3, 2025-09-12 | Scanner only, not share target (README) | URL + personal API token | Token works, but no share |
| Paperless Share (qcasey) | Android | Listed under "Former Projects" in the wiki | n/a | n/a | Not recommended |

### Recommendation
- Share an image from a payment app, one tap, correct user, OIDC-only account:
  - iOS: Swift Paperless. Share extension accepts images, signs in via the same Zitadel provider, and uploads under that user (server sets owner from the authenticated token, see 1.4). Zitadel app must allow a second redirect URI or, more likely, a separate public/PKCE client with `x-paperless://oidc-callback`. NOTE: this conflicts with the paperless web client being a confidential client. Swift Paperless docs say the client "must" be a public PKCE one, and per its docs login goes through the paperless-configured provider; whether a confidential client with secret works is UNCONFIRMED. Fallback: Less Paper has the same requirement.
  - Android: Paperless NGX Uploader (gmag11). Generate token in My Profile, paste into the app once, then Share -> uploader. Accepts any image. One tap after the first-run setup (it may show tag selection first; default tags configurable).
- Neither app shows a "choose user" step; the user is whoever owns the token / OIDC session.

## 3. Indian payment apps: Share button and image vs text

None of the official pages say whether Share produces an image or text/link.

| App | Share button on success / details screen? | Image or text? | Source / status |
|---|---|---|---|
| Google Pay (India) | Yes: "To share details about a particular transaction, at the bottom of the transaction details page, click Share." Statements can also be shared (PDF). | UNCONFIRMED | https://support.google.com/pay/india/answer/7430307 |
| Paytm | Yes: "tap on the 'Share' option or the three dots on the payment confirmation screen"; also Balance & History -> transaction -> Share (to WhatsApp, Email, SMS) | UNCONFIRMED (page does not mention image/PDF) | https://paytm.com/support/upi/how-to-get-upi-transaction-receipt-on-paytm |
| PhonePe | UNCONFIRMED. Searched phonepe.com; found only merchant report downloads and a support-ticket flow, no consumer receipt share page | UNCONFIRMED | n/a |
| CRED | UNCONFIRMED. A search snippet said cred.club/pay-via-upi advertises "shareable payment receipts"; fetching the page returned only the title, so not verified. cred.club/customer-care has no share steps | UNCONFIRMED | https://cred.club/pay-via-upi (snippet only) |
| BHIM | UNCONFIRMED. NPCI/BHIM sources describe transaction history, download, report issue; the only "share" mentioned is profile QR | UNCONFIRMED | https://www.bhimupi.org.in/faq-s , https://www.npci.org.in/product/bhim |
| A bank's own mobile app (one major bank checked) | UNCONFIRMED. Official transaction-history page lists BHIM UPI -> Manage -> Transaction History only; no share or receipt text | UNCONFIRMED | bank's official help page |

## Unconfirmed / needs device test
- For every payment app: whether tapping Share produces an image (PNG/JPG) in the Android/iOS share sheet or only text/link. Test: tap Share, pick the uploader, confirm the file type it receives (gmag11 accepts `*/*` and `text/plain`; Paperless Mobile and Swift Paperless accept only image/pdf, so a text-only share will not offer them).
- If an app shares only text, fallback is taking a screenshot and sharing it from the gallery.
- PhonePe, CRED, BHIM, bank apps: existence of Share button (not confirmed from a primary source).
- Zitadel: which app auth method works with paperless-ngx (confidential Code/basic vs PKCE), `preferred_username` format, whether the roles claim object syncs groups as inferred.
- Whether Swift Paperless / Less Paper work against a Zitadel client that is confidential for the web UI (need a separate public PKCE client or an extra redirect URI with PKCE allowed).
- Paperless Mobile: token-only or OIDC login (not supported per open issue #374); Android alternative is a pasted token in gmag11's uploader.
- Paperless 3.2.1 vs latest 3.5.1: behaviour read at 3.2.1; the wiki app lists above are from the live wiki and mention 3.x compatibility (Waraq 3.0+, Swift Paperless OIDC needs 3.0+).
- `/api/token/` rejection for passwordless OIDC users (inferred).
