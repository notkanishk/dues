# Tracker: stack choice (researched 2026-11-20)

## Recommendation

**One TypeScript app: Next.js 16 (App Router) on Node 24 LTS, Drizzle ORM, openid-client, pg-boss, docxtemplater, web-push, Vitest + Playwright. Postgres 18, Gotenberg 9 sidecar, Caddy in front.**

| Layer | Pick (version checked 2026-11-20) |
|---|---|
| Framework | Next.js **16.4.6** (2026-11-09) https://github.com/vercel/next.js/releases/tag/v16.4.6 |
| Runtime | Node **24 LTS** (24.22.3); move to 26 LTS (26.13.1) later. https://nodejs.org/en/about/previous-releases . Bun 1.4.5 only as package manager/scripts if wanted (Syndra habit). |
| DB / ORM | Postgres **18.7** (19.0 shipped 2026-11-19; wait for 19.1) https://www.postgresql.org/support/versioning/ . Drizzle **0.45.4** stable, pinned; v1.0.0-rc.5 exists https://github.com/drizzle-team/drizzle-orm/releases |
| Auth | **openid-client 6.9.0** (confidential client + PKCE, own Postgres session table) https://github.com/panva/openid-client/releases/tag/v6.9.0 |
| Jobs | **pg-boss 12.38.2**, cron + retries, no Redis, in a second container from the same image https://github.com/timgit/pg-boss/releases/tag/12.38.2 |
| docx / PDF | **docxtemplater 3.71.1 + pizzip** (MIT-or-GPLv3 core), then Gotenberg **9.9.1** https://github.com/gotenberg/gotenberg/releases/tag/v9.9.1 |
| Push | **web-push 4.0.0** (new ESM major, 2026-11-10; pin 3.x if it bites) https://github.com/web-push-libs/web-push/releases/tag/v4.0.0 |
| Tests | Vitest 5.1.1, Playwright 1.65.1, real Postgres in tests |
| Reuse | Syndra's React/Tailwind 4 design system, TanStack Query, Vitest habits, Zitadel knowledge |

**Runner-up: Syndra pattern** (Go 1.27 backend + Next.js UI, River 0.51.2 jobs, zitadel/oidc v3.52.0). Best RAM and best code reuse, but two codebases, and Go has no mature formatting-preserving docx templater.

## Comparison table

Ratings are my judgment from the cited facts below (1 = poor, 5 = best). RAM figures are UNCONFIRMED everywhere.

| Option | Zitadel OIDC | docx templating | Web Push | Jobs w/o Redis | PWA | One-person upkeep | Syndra reuse |
|---|---|---|---|---|---|---|---|
| (a) TS: Next.js 16 + Drizzle (pick) | 4 openid-client | 5 docxtemplater | 4 web-push | 4 pg-boss | 5 manifest built in, Serwist | 4 one language, one repo | 5 same React/Next/DS |
| (a2) TS: React Router 8 / TanStack Start / SvelteKit | 4 same lib | 5 same | 4 same | 4 same | 3 DIY, no first-party guide found | 4 | 3 to 1 (DS is React; Svelte = none) |
| (b) Go + Next (Syndra clone) | 5 zitadel/oidc RP | 2 no mature lib found | 3 webpush-go last release Jan 2025 | 5 River | 4 via Next | 3 two languages, two builds | 5 |
| (c) Go + templ/HTMX | 5 | 2 | 3 | 5 | 3 | 3 | 2 (DS is React) |
| (d) Python Django (or FastAPI) | 3 authlib, UNCONFIRMED | 4 docxtpl | 4 pywebpush | 4 procrastinate | 2 DIY | 4 Django batteries | 1 |
| (e) Rails 8 / Phoenix LiveView | 3 / 3 UNCONFIRMED | 2 / 1 UNCONFIRMED | 3 / 3 UNCONFIRMED | 5 Solid Queue / 5 Oban | 2 / 2 | 3 / 2 (new language) | 1 |

Main trade-offs of the pick: heavier runtime than Go; Next.js churns fast (16.x patch releases roughly weekly); Drizzle is pre-1.0 stable; web-push just went ESM-major. In exchange: one language end to end, schema types flow to forms, the best-fit docx tool, and direct reuse of Syndra UI.

## Cited details

### Core platform facts
- Next.js latest stable 16.4.6, 2026-11-09, not a prerelease: https://api.github.com/repos/vercel/next.js/releases/latest
- Next.js deploys as a Node.js server or Docker with all features; static export is limited; Bun is listed as a verified adapter: https://nextjs.org/docs/app/getting-started/deploying (last updated 2026-08-06)
- Docker `output: "standalone"` gives a minimal image: https://github.com/vercel/next.js/tree/canary/examples/with-docker
- Self-hosting: put a reverse proxy in front; the cache is on local disk and fine for a single instance; code can run at server start via `register` (instrumentation): https://nextjs.org/docs/app/guides/self-hosting (updated 2026-10-15)
- Self-hosting guide: run a single instance, so none of the multi-instance cache or encryption-key caveats apply: same URL.
- Node: v26 "Lithium" LTS (first released 2026-05-05, 26.13.1), v24 "Krypton" LTS (24.22.3), v25 EOL, v27 alpha. LTS gets about 30 months of fixes: https://nodejs.org/en/about/previous-releases
- Bun 1.4.5 released 2026-11-19: https://github.com/oven-sh/bun/releases/tag/bun-v1.4.5 . Bun says Next.js works with it and that Node-package failures are treated as bugs: https://bun.com/docs/runtime/nodejs-compat . Bun's node:crypto is only partially implemented (missing some ciphers/curves): same URL. That matters for web-push/VAPID, so prefer Node in production.
- Bun running Next: `bun --bun next ...`: https://bun.com/docs/guides/ecosystem/nextjs
- Postgres 18 supported to 2030-11-14, 17 to 2029-11-08, 19 first release 2026-11-19: https://www.postgresql.org/support/versioning/
- Gotenberg 9.9.1 (2026-11-20): https://api.github.com/repos/gotenberg/gotenberg/releases/latest . It is a Docker API that converts Office files via LibreOffice to PDF; quick-start image `gotenberg/gotenberg:9`: https://raw.githubusercontent.com/gotenberg/gotenberg/main/README.md
- Zitadel latest v4.20.5 (2026-11-18): https://github.com/zitadel/zitadel/releases/tag/v4.20.5

### TypeScript alternatives to Next.js
- React Router latest 8.5.2 (2026-11-18): https://github.com/remix-run/react-router/releases/tag/react-router%408.5.2
- TanStack Start docs say "TanStack Start is stable"; React Server Components are experimental: https://tanstack.com/start/latest/docs/framework/react/overview . Latest TanStack Router release 2026-11-19: https://github.com/TanStack/router/releases/tag/release-2026-11-19-1024
- SvelteKit repo is active (adapter-node 6.0.5, 2026-11-18): https://github.com/sveltejs/kit/releases
- Why not these: all would work with the same auth, jobs, docx and push libraries. Next.js wins only on reuse of Syndra's React stack and DS (Syndra ui/package.json: next 15.5.29, react 19.2.9, tailwind 4.3.5, @tanstack/react-query 5.107.1, vitest 4.1.12, typescript 5.9.3, built on oven/bun 1.4.4 image; local file). Runner-up inside TS: React Router 8 framework mode (smaller, Vite-based, less magic). Its PWA and push story: UNCONFIRMED.
- Reuse caveat: Syndra is on Next 15.5.29, one major behind 16.4.6. Whether Syndra's `ds-bundle` works unchanged on 16 is UNCONFIRMED; test on day one, or start on Next 15.5.x and upgrade later.

### ORM / query layer
- Drizzle: latest non-prerelease 0.45.4 (2026-10-08); no 1.0 stable; v1.0.0-rc.5 on 2026-10-21: https://api.github.com/repos/drizzle-team/drizzle-orm/releases?per_page=8
- Kysely 0.29.9 (2026-11-12), still 0.x: https://github.com/kysely-org/kysely/releases/tag/v0.29.9 . Fine alternative if you want plain SQL builder plus separate migrations.
- pg-boss ships Drizzle and Kysely adapters, so a job can be enqueued inside the same DB transaction as a state change: https://raw.githubusercontent.com/timgit/pg-boss/master/README.md

### Auth (Zitadel)
- openid-client 6.9.0 (2026-11-13): https://github.com/panva/openid-client/releases/tag/v6.9.0 . README: runs on Node, Bun, Deno and others (Node 20+ baseline); maintainer holds OpenID RP conformance certifications (Basic, FAPI 1.0/2.0); PKCE S256 examples; takes a client secret in discovery; v6 gets security fixes and features: https://raw.githubusercontent.com/panva/openid-client/main/README.md
- Better Auth 1.7.27 (2026-11-20; very frequent releases): https://github.com/better-auth/better-auth/releases/tag/v1.7.27 . Its generic-oauth plugin supports `discoveryUrl`, PKCE (default true), `mapProfileToUser`, `getUserInfo`, and even cites a Zitadel scope: https://raw.githubusercontent.com/better-auth/better-auth/main/docs/content/docs/plugins/generic-oauth.mdx . Good, but it owns users/sessions tables and moves fast. Kept as a fallback.
- Roles scopes: ask for `urn:zitadel:iam:org:project:role:{rolekey}` to get the roles claim, or `urn:zitadel:iam:org:projects:roles` for per-project claims; add the project audience scope `urn:zitadel:iam:org:project:id:{projectid}:aud`: https://zitadel.com/docs/apis/openidoauth/scopes
- Claim page: the roles claim sits in userinfo, ID token (when requested/configured) and JWT access tokens; its example shows an array wrapping a role-keyed object, not a bare object; a complement-token Action can reshape it: https://zitadel.com/docs/apis/openidoauth/claims . Verify the real token shape in dev before writing the authorizer.
- Go: zitadel/oidc v3.52.0 (2026-11-10), maintained by Zitadel, RP certified for basic and config profiles, PKCE supported: https://github.com/zitadel/oidc/releases/tag/v3.52.0 and https://raw.githubusercontent.com/zitadel/oidc/main/README.md . coreos/go-oidc v3.21.0: https://github.com/coreos/go-oidc/releases/tag/v3.21.0

### Background jobs
- pg-boss 12.38.2 (2026-11-10), bug-fix release: https://api.github.com/repos/timgit/pg-boss/releases/latest . Needs Node 22.12+ (or Bun) and Postgres 13+; cron and RRULE scheduling, exponential-backoff retries, SKIP LOCKED: https://raw.githubusercontent.com/timgit/pg-boss/master/README.md
- River (Go) 0.51.2 (2026-11-09), still 0.x: https://github.com/riverqueue/river/releases/tag/v0.51.2
- Solid Queue is Rails 8's default, DB-backed, no Redis, recurring tasks in `config/recurring.yml`: https://guides.rubyonrails.org/active_job_basics.html
- Oban (Elixir) 2.24.0 (2026-08-25): https://github.com/oban-bg/oban/releases/tag/v2.24.0
- procrastinate (Python) 3.12.0 (2026-11-19): https://github.com/procrastinate-org/procrastinate/releases/tag/3.12.0
- Node-side pg-boss needs its own process or `register()` hook; a separate worker container is cleaner. It avoids the in-process-with-Next caveats.

### docx templating (7-column form)
- docxtemplater: core dual-licensed MIT or GPLv3: https://raw.githubusercontent.com/open-xml-templating/docxtemplater/master/LICENSE.md . Repo active (pushed 2026-10-15, not archived), tags up to v3.71.1: https://api.github.com/repos/open-xml-templating/docxtemplater/tags?per_page=3 . Some features are paid modules (Image, HTML, Table, Styling, Footnotes, others): https://raw.githubusercontent.com/open-xml-templating/docxtemplater/master/README.md
- Table row loop: put `{#rows}` in the first cell and `{/}` in the last cell of one template row; the row repeats; `paragraphLoop: true` is the recommended option: https://docxtemplater.com/docs/tag-types/ . Install is `docxtemplater` plus `pizzip`: https://docxtemplater.com/docs/get-started-node/
- Why it fits "preserve formatting exactly": it edits the docx XML in place and only replaces tags, so the template's table styles stay (my reasoning; not directly stated in the fetched pages). Test: round-trip your real form and diff the unzipped XML.
- Python docxtpl: LGPL-2.1, pushed 2026-07-07, tags to v0.20.2: https://api.github.com/repos/elapouya/python-docx-template and https://api.github.com/repos/elapouya/python-docx-template/tags?per_page=2
- Go: lukasjarosch/go-docx, MIT, last push 2024-07-31 (stale): https://api.github.com/repos/lukasjarosch/go-docx . Go would likely need raw XML edits. Other Go libraries (unioffice licensing, etc.): UNCONFIRMED.
- docx-templates (npm) 4.15.0, 2025-12-03: https://github.com/guigrpa/docx-templates/releases/tag/v4.15.0 . Alternative if docxtemplater's module licensing worries you.
- PDF conversion: Gotenberg, same for every stack. Your FUNCTIONAL.md already plans to test LibreOffice output against a Word-exported PDF (item 3, 3a).

### Web Push + PWA
- iOS/iPadOS 16.4: Web Push works for Home Screen web apps only; permission must be requested from a direct user gesture; it uses Apple's push service (allow `*.push.apple.com` if you filter): https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- Next.js PWA guide (updated 2026-07-30): built-in `app/manifest.ts`; walks through VAPID keys, `web-push`, service worker `push` and `notificationclick` handlers; iOS needs a manual "Add to Home Screen" hint because `beforeinstallprompt` doesn't work on iOS Safari; Serwist is suggested for offline SW caching; `useOffline` is experimental: https://nextjs.org/docs/app/guides/progressive-web-apps
- web-push 4.0.0 (2026-11-10): ESM migration, dependency cleanup, no stated Node range: https://api.github.com/repos/web-push-libs/web-push/releases/latest
- pywebpush 2.3.0 (2026-07-13): https://github.com/web-push-libs/pywebpush/releases/tag/2.3.0 . webpush-go v1.4.0 (2025-01-02), no newer release: https://github.com/SherClockHolmes/webpush-go/releases/tag/v1.4.0

### Testing
- Vitest 5.1.1 (2026-11-17): https://github.com/vitest-dev/vitest/releases/tag/v5.1.1 . Syndra pins 4.1.12; trivial bump.
- Playwright 1.65.1 (2026-11-13): https://github.com/microsoft/playwright/releases/tag/v1.65.1 . For PWA/mobile viewport tests and a push-subscribe smoke test.
- Suggested layout: pure-function state machines and money math in a no-framework `domain/` folder (fast Vitest unit tests), DB tests against a real Postgres container (Testcontainers: UNCONFIRMED version), parser fixtures from real screenshots' OCR text, Playwright for the 3 or 4 key flows.

### Other stacks (brief)
- Django 6.1.3 current; 5.2 LTS extended support to April 2028; next LTS 6.2 in April 2027: https://www.djangoproject.com/download/ . FastAPI 0.165.0 (still 0.x): https://github.com/fastapi/fastapi/releases/tag/0.165.0 . Python is a good fit for docxtpl, but zero Syndra reuse and a PWA front end still needs JS.
- Rails 8.1.4.1 (2026-11-04): https://github.com/rails/rails/releases/tag/v8.1.4.1 . Phoenix LiveView 1.2.13 (2026-10-20): https://github.com/phoenixframework/phoenix_live_view/releases/tag/v1.2.13 . Both have first-class DB-backed jobs but need a new language and ecosystem for one maintainer; no docx templating story found.
- Go: 1.27.0 released 2026-08-19, 1.27.4 on 2026-11-10; each major is supported until two newer majors ship: https://go.dev/doc/devel/release . templ v0.3.1118 (2026-11-12): https://github.com/a-h/templ/releases/tag/v0.3.1118 . templ/HTMX gives small images but makes a PWA with fast mobile forms and later desktop review screens more manual, and cannot reuse Syndra's React DS.

## UNCONFIRMED

- Real RAM/image sizes for any stack (Next.js on Node vs Bun vs Go). Assumed to fit in a small LXC with Postgres and Gotenberg; measure early (Gotenberg/LibreOffice is likely the largest consumer).
- Whether `ds-bundle` from Syndra works on Next 16 (Syndra is on 15.5.29).
- Exact shape of the Zitadel roles claim in your real tokens (docs example is array-wrapped) and which project setting must be on for roles to appear in the ID token.
- Next.js 15 support window (relevant if you stay on Syndra's version).
- docxtemplater preserves your exact 7-column template formatting (reasoned, not stated; test with the real file). Whether any paid module is needed for it: none expected.
- web-push 4.0.0 stability and engines range (released 10 days ago); VAPID on Node 24 (should work, not confirmed).
- Declarative Web Push on iOS (not covered by the cited WebKit post).
- Drizzle 1.0 stable date; authlib/Django OIDC quality; Go docx libraries beyond go-docx; Rails/Phoenix OIDC and docx options; Testcontainers version; Serwist version; React Router/TanStack/SvelteKit PWA and push guidance.
- Whether Postgres 19 is safe now (just released); this note recommends 18.
