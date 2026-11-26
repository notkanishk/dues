# Paperless-ngx AI / LLM / vision add-ons and forks: facts

Research date: 2026-11-21. Read-only web research. Nothing installed, no SSH.
Sources are primary (GitHub API/raw files, upstream README/release notes) unless marked otherwise. Anything not confirmed on a primary source is marked **UNCONFIRMED** (see last section).

Abbreviations: CS = community-scripts/ProxmoxVE, `ct/` = container install script.

## 1. Comparison table

| Project | What it does | LLM providers | OpenAI-compatible base URL? | Vision OCR (LLM replaces tesseract text)? | Custom fields? | Auto vs review | Licence | Last release (date) | Community-script path |
|---|---|---|---|---|---|---|---|---|---|
| **paperless-ngx built-in AI** (upstream core, 3.x) | Opt-in AI suggestions (title, date, tags, correspondent, doc type), document chat, LLM index (RAG), "Apply AI Suggestions" workflow action | Remote OpenAI-compatible APIs (`openai-like`) and Ollama | Yes: `PAPERLESS_AI_LLM_ENDPOINT` with backend `openai-like` | No LLM vision OCR documented. Azure AI remote OCR listed in v3.0.0 notes | Not mentioned in usage docs (UNCONFIRMED) | Suggestions shown for review; workflow action writes automatically (fills empty fields unless overwrite) | Upstream licence not checked (UNCONFIRMED) | v3.5.1, 2026-11-18 ([release](https://api.github.com/repos/paperless-ngx/paperless-ngx/releases/latest)) | `ct/paperless-ngx.sh` is the core app, not an AI add-on |
| **paperless-gpt** (icereed) | LLM tagging/title/correspondent/type/date/custom fields; LLM vision OCR; searchable PDF/hOCR | `openai`, `ollama`, `googleai`, `mistral`, `anthropic` (`LLM_PROVIDER`) | Yes: `LLM_PROVIDER=openai` + `OPENAI_BASE_URL` | Yes: `OCR_PROVIDER` = `llm` (vision), `azure`, `google_docai`, `docling` (`DOCLING_URL`), `mistral_ocr` | Yes: writes custom fields (Append / Update / Replace modes) | Automatic on tags (`AUTO_TAG`, `AUTO_OCR_TAG`); manual review UI with Apply | MIT | v0.31.0, 2026-10-14 | `ct/paperless-gpt.sh` (bare metal, Go binary) |
| **paperless-ai** (clusterzx), v4 | Auto title/tags/correspondent/date/custom fields; RAG "Ask your archive"; document chat; optional PaddleOCR | `openai`, `anthropic`, `ollama`, `azure`, `custom` (OpenAI-compatible); Gemini, DeepSeek, OpenRouter, LiteLLM, vLLM etc. via custom | Yes: `AI_PROVIDER=custom` + `CUSTOM_BASE_URL` | No LLM vision OCR. OCR is local PaddleOCR (`OCR_ENABLED`, `OCR_MODE`) | Yes: `ACTIVATE_CUSTOM_FIELDS` + `CUSTOM_FIELDS` (JSON). Per-field prompts not documented | Automatic (`SCAN_INTERVAL` polling or Paperless webhook); review page with history/undo | MIT | v4.3.1, 2026-11-19 | `ct/paperless-ai.sh` (bare metal, Node 22) |
| **paperless-ai-next** (admonstrator; repo now shown as `admonstrator/zettelrobbe`) | Fork of paperless-ai: AI tagging, OCR rescue queue, custom fields, MFA, guided setup | Not verified | Not verified | Not verified | Listed in repo description | Not verified | MIT (per GitHub API) | Not checked (UNCONFIRMED) | **Not in CS** (no matching `ct/` file) |
| **papra** (papra-hq) | Document management; AI is a future item in README only | None | n/a | n/a | n/a | n/a | AGPL-3.0 (per README) | Not checked | `ct/papra.sh` (bare metal, Node 26) |
| **docspell** (eikek) | Document management (not AI-researched) | Not researched | n/a | n/a | n/a | n/a | Not checked | Not checked | `ct/docspell.sh` (Debian .deb packages) |
| **docling-serve** (docling-project) | Document conversion API service (not a paperless add-on by itself) | n/a | n/a | Docling is an OCR backend for paperless-gpt (`DOCLING_URL`) | n/a | n/a | MIT (per secondary listing) | v1.38.2 per listing (UNCONFIRMED) | **UNCONFIRMED**: `ct/docling-serve.sh` returned 404 on CS main |

Community-script resource defaults (from `ct/*.sh` `var_*` lines, all Debian 13, unprivileged=1):

| CS script | CPU | RAM (MB) | Disk (GB) | Install method |
|---|---|---|---|---|
| `ct/paperless-ngx.sh` | 2 | 3072 | 12 | Bare metal, systemd, `/opt/paperless`, uv + Python 3.13 |
| `ct/paperless-ai.sh` | 4 | 4096 | 20 | Bare metal in LXC, Node 22, systemd |
| `ct/paperless-gpt.sh` | 3 | 2048 | 7 | Bare metal in LXC, Go binary, systemd |
| `ct/papra.sh` | 2 | 2048 | 10 | Bare metal, Node 26 built from source |
| `ct/docspell.sh` | 4 | 4096 | 16 | Debian .deb packages, systemd |

## 2. Per-project notes

### 2.1 Community-scripts entries (item 1)

Scan method: GitHub API listing of `ct/` (paginated, ~120 names per page, all pages read), filtered for paperless, docling, papra, docspell, ai, llm, ocr, gpt, doc.
- Listing: https://api.github.com/repos/community-scripts/ProxmoxVE/contents/ct
- Matches found:
  - `ct/paperless-ngx.sh`
  - `ct/paperless-ai.sh`
  - `ct/paperless-gpt.sh`
  - `ct/papra.sh`
  - `ct/docspell.sh`
  - AI/LLM server candidates (not paperless-specific, could be OpenAI-compatible backends): `ct/localai.sh`, `ct/litellm.sh`, `ct/vllm.sh`, `ct/anythingllm.sh`, `ct/cliproxyapi.sh`
- Not found in `ct/`: `paperless-ai-next`, `paperless-ai` fork variants, `docling-serve` (no `ct/docling-serve.sh` on main), `docling`.
- Scripts were read from raw: e.g. https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/ct/paperless-ngx.sh

**`ct/paperless-ngx.sh`** (https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/ct/paperless-ngx.sh)
- Defaults: `var_cpu=2`, `var_ram=3072`, `var_disk=12`, `var_os=debian`, `var_version=13`, `var_unprivileged=1`; tags `document;management`.
- Bare metal (systemd units paperless-consumer, -webserver, -scheduler, -task-queue; `/opt/paperless`; `uv`, Python 3.13).
- Upstream: `paperless-ngx/paperless-ngx` release tarball (`paperless*tar.xz`); `ie13/jbig2enc` tarball.
- Update path: if installed version is 2.x other than 2.20.15, it bridges to v2.20.15 first, then v3. Warns v3 drops encrypted-document support. Migrates v2 config keys on the v3 upgrade.
- Older mirrors suggested a 10 GB disk and a 2 GB RAM default; the current main file is authoritative (see fact above).

**`ct/paperless-ai.sh`** (https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/ct/paperless-ai.sh)
- Defaults: `var_cpu=4`, `var_ram=4096`, `var_disk=20`, `var_os=debian`, `var_version=13`, `var_unprivileged=1`; tags `ai;document`. Access on port 3000.
- Bare metal in LXC; Node 22; systemd unit `paperless-ai.service` running `dist/server/index.js`.
- Upstream: `clusterzx/paperless-ai`.
- Update path: pulls the latest GitHub release. If the service file is still on the old layout, it removes `paperless-rag.service` and rewrites the unit for the Paperless-AI 4 layout (`PAPERLESS_AI_PORT=3000`, `PAPERLESS_AI_DATA_DIR=/opt/paperless-ai/data`). Warns that 3.x settings and history migrate on first start.

**`ct/paperless-gpt.sh`** (https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/ct/paperless-gpt.sh)
- Defaults: `var_cpu=3`, `var_ram=2048`, `var_disk=7`, `var_os=debian`, `var_version=13`, `var_unprivileged=1`; tags `os`. Access on port 8080.
- Bare metal in LXC; Go binary built with `CGO_ENABLED=1`, `CC=musl-gcc`, `-tags musl`; Node 24 for the web app; systemd unit `paperless-gpt`.
- Upstream: `icereed/paperless-gpt` release tarball (`check_for_gh_release` / `fetch_and_deploy_gh_release`).

**`ct/papra.sh`** (https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/ct/papra.sh)
- Defaults: `var_cpu=2`, `var_ram=2048`, `var_disk=10`, debian 13, unprivileged.
- Bare metal, built from source with pnpm, Node 26, systemd `papra`.
- Upstream: `papra-hq/papra`.

**`ct/docspell.sh`** (https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/ct/docspell.sh)
- Defaults: `var_cpu=4`, `var_ram=4096`, `var_disk=16`, debian 13, unprivileged.
- Installs `docspell-restserver` and `docspell-joex` .deb packages from `eikek/docspell` GitHub releases; systemd.
- AI features not checked.

### 2.2 paperless-gpt (icereed/paperless-gpt)

Source: https://raw.githubusercontent.com/icereed/paperless-gpt/main/README.md ; repo API https://api.github.com/repos/icereed/paperless-gpt ; release https://api.github.com/repos/icereed/paperless-gpt/releases/latest

- Description (GitHub API): "Use LLMs and LLM Vision (OCR) to handle paperless-ngx - Document Digitalization powered by AI".
- Repo stats (GitHub API, 2026-11-21): 2846 stars, 206 open issues, MIT, language Go, not archived, pushed 2026-11-19.
- Latest release: v0.31.0 "Workflow Custom Fields", 2026-10-14 (https://github.com/icereed/paperless-gpt/releases/tag/v0.31.0).
- Providers: `LLM_PROVIDER` = `openai`, `ollama`, `googleai`, `mistral`, `anthropic`.
- OpenAI-compatible: `LLM_PROVIDER=openai` with `OPENAI_BASE_URL` (per README). Azure OpenAI via `OPENAI_API_TYPE=azure`.
- OCR (`OCR_PROVIDER`): `llm` (default; `VISION_LLM_PROVIDER`, `VISION_LLM_MODEL`), `azure` (`AZURE_DOCAI_ENDPOINT`, `AZURE_DOCAI_KEY`), `google_docai` (`GOOGLE_PROJECT_ID`, `GOOGLE_LOCATION`, `GOOGLE_PROCESSOR_ID`, `GOOGLE_APPLICATION_CREDENTIALS`), `docling` (`DOCLING_URL`), `mistral_ocr` (no dedicated key variable named).
- Text layer and hOCR output: `CREATE_LOCAL_HOCR`, `CREATE_LOCAL_PDF`, `PDF_UPLOAD`, `PDF_UPLOAD_MODE` (`version` or `new`). Per the README summary, text layer and hOCR currently need Google Document AI.
- Document selection by tag: `MANUAL_TAG` (default `paperless-gpt`), `AUTO_TAG` (default `paperless-gpt-auto`), `AUTO_OCR_TAG` (default `paperless-gpt-ocr-auto`). No env var for a separate "PAPERLESS_GPT" auto tag.
- Write-back: title, tags, correspondent, document type, created date, custom fields. Per-field toggles `AUTO_GENERATE_TITLE`, `AUTO_GENERATE_TAGS`, `AUTO_GENERATE_CORRESPONDENTS`, `AUTO_GENERATE_DOCUMENT_TYPE`, `AUTO_GENERATE_CREATED_DATE` (all default true). `CREATE_NEW_TAGS` default false. `PRESERVE_EXISTING_METADATA` keeps existing correspondent/doc type.
- Custom fields: enabled in Settings; select at least one field. Prompt template `custom_field_prompt.tmpl`. Write modes Append, Update, Replace (Replace clears existing custom fields first). No env var named for field selection. Document Link fields resolve cited references. Per-field prompts not confirmed.
- Review: both. Manual via web UI (generate, edit, Apply); automatic on auto tags. Release v0.8.0 introduced LLM OCR and the separate OCR tag flow (discussion #78).
- Security: no built-in authentication; README says not to expose it to the internet or an untrusted network.
- Licence: MIT.
- Ad-hoc analysis runs a custom prompt over selected documents.

### 2.3 paperless-ai (clusterzx/paperless-ai), v4

Source: https://raw.githubusercontent.com/clusterzx/paperless-ai/main/README.md ; repo API https://api.github.com/repos/clusterzx/paperless-ai ; release https://api.github.com/repos/clusterzx/paperless-ai/releases/latest

- Repo stats (GitHub API, 2026-11-21): 6141 stars, 5 open issues, MIT, language TypeScript, not archived, pushed 2026-11-19.
- Latest release: v4.3.1, 2026-11-19 (https://github.com/clusterzx/paperless-ai/releases/tag/v4.3.1).
- Maintenance statement: README calls it "a hobby project", says large parts of v4 were written with AI coding tools, says code is covered by automated tests, and gives no formal support commitment. An older search snippet said "not maintained"; the current README does not say that (conflict, noted).
- Providers: `AI_PROVIDER` covers OpenAI, Anthropic (Claude), Ollama, Azure OpenAI, and `custom` (OpenAI-compatible). Examples given: DeepSeek, OpenRouter, LiteLLM, vLLM, LM Studio, Gemini, Together, Perplexity. Google and Mistral are not listed as native providers (only as custom examples).
- OpenAI-compatible base URL: yes. `AI_PROVIDER=custom` with `CUSTOM_BASE_URL`, `CUSTOM_API_KEY`, `CUSTOM_MODEL`, `CUSTOM_EXTRA_BODY`. `ANTHROPIC_BASE_URL` is for gateways or proxies only.
- OCR: no vision-LLM OCR. Optional local PaddleOCR: `OCR_ENABLED`, `OCR_MODE` (`manual`, `missing`, `poor`, `always`), `OCR_WRITE_BACK`, `OCR_LANGUAGE`, `OCR_QUALITY`, `OCR_DEVICE` (`auto`, `cpu`, `cuda`). OCR text replaces Paperless text only when its quality score is higher. A `latest-cuda` image exists.
- Write-back toggles: `ACTIVATE_TITLE`, `ACTIVATE_TAGGING`, `ACTIVATE_CORRESPONDENTS`, `ACTIVATE_DOCUMENT_TYPE`, `ACTIVATE_DOCUMENT_DATE`, `ACTIVATE_CUSTOM_FIELDS`. OCR text can also be written back.
- Document selection: `TAGS` trigger tags with `PROCESS_PREDEFINED_DOCUMENTS` and `REMOVE_TRIGGER_TAGS`; `EXCLUDE_TAGS`; polling via `SCAN_INTERVAL`; or a Paperless "Document Added" workflow webhook to `/api/webhook/document` with an `x-api-key` header. `DISABLE_AUTOMATIC_PROCESSING` exists.
- Review: automatic processing, plus a manual review page and a history with undo. README does not say results can be held for review before writing.
- Custom fields: `ACTIVATE_CUSTOM_FIELDS` plus `CUSTOM_FIELDS` (JSON, 3.x format). Prompt controls: `SYSTEM_PROMPT`, `USE_PROMPT_TAGS`, `PROMPT_TAGS`, `USE_EXISTING_DATA`. Per-field prompts not documented.
- RAG ("Ask your archive"): `RAG_ENABLED` (or `RAG_SERVICE_ENABLED`). Hybrid keyword and vector search; streamed answers citing sources. Embeddings via `RAG_EMBEDDING_PROVIDER` / `RAG_EMBEDDING_MODEL`: local default `Xenova/multilingual-e5-small` (~120 MB), Ollama, OpenAI-compatible/Azure, or none (keyword only). `RAG_QUERY_EXPANSION` for smart search terms. A per-document "document chat" is in the Tools list.
- Auth: setup wizard, 2FA, OpenID Connect SSO (`OIDC_*`, `OIDC_ALLOWED_GROUPS`, `PASSWORD_LOGIN`). API access via `x-api-key`. Secrets `API_KEY`, `JWT_SECRET`. `TRUST_PROXY` needed behind a reverse proxy. README warns the setup wizard is open to anyone until the first account exists, and says to keep it on a local network. `NODE_TLS_REJECT_UNAUTHORIZED=0` disables all certificate checks (testing only).
- Licence: MIT.

### 2.4 paperless-ai-next (fork of paperless-ai)

Source: https://api.github.com/repos/admonstrator/paperless-ai-next (the API response was for `admonstrator/zettelrobbe`, so the repo appears renamed).
- Description: "A next-generation fork of Paperless-AI for Paperless-ngx with AI tagging, an OCR rescue queue, document queues, rescan history, MFA, guided setup, and custom fields."
- Stats: 295 stars, 16 open issues, MIT, JavaScript, not archived, pushed 2026-11-20.
- Not in the CS `ct/` listing.
- Docker Hub `admonstrator/paperless-ai-next` has a lite image (no RAG) and a full image (RAG) per search snippet (UNCONFIRMED, secondary).

### 2.5 papra and docspell (checked for AI, not paperless add-ons)

- papra (https://raw.githubusercontent.com/papra-hq/papra/main/README.md): AI is a future item only ("Coming maybe one day"). Tagging rules and content extraction are in the README, no LLM or OCR feature named. Licence AGPL-3.0.
- docspell: not checked for AI features (UNCONFIRMED).

### 2.6 docling-serve

- CS: the `ct/docling-serve.sh` raw URL on CS main returned 404. A third-party index page (https://community-scripts.org/scripts/docling-serve) lists "Docling Serve" as a container install, status TESTING, app version 1.38.2, architectures x86-64 and ARM64, upstream `docling-project/docling-serve` (MIT). CPU, RAM, disk, and OS are not shown. Treat CS packaging as UNCONFIRMED.
- Upstream: docling-project/docling-serve, MIT (per the index page; not re-checked on GitHub).
- Relevance: paperless-gpt can use Docling as its OCR provider (`OCR_PROVIDER=docling`, `DOCLING_URL`).

### 2.7 Upstream paperless-ngx: built-in AI (item 3)

Primary sources:
- Release v3.0.0, 2026-07-22: https://api.github.com/repos/paperless-ngx/paperless-ngx/releases/tags/v3.0.0 (html: https://github.com/paperless-ngx/paperless-ngx/releases/tag/v3.0.0). Release summary (paraphrased from the body): tantivy search replacing Whoosh, file versions, sharelink bundles, Tasks UI; AI features include Paperless AI, Azure AI remote OCR, Ollama embeddings, and configurable LLM timeouts. Breaking: drops Python 3.10.
- Configuration docs: https://raw.githubusercontent.com/paperless-ngx/paperless-ngx/main/docs/configuration.md
  - `PAPERLESS_AI_ENABLED` (default false), `PAPERLESS_AI_LLM_BACKEND` (`openai-like` or `ollama`), `PAPERLESS_AI_LLM_MODEL`, `PAPERLESS_AI_LLM_API_KEY`, `PAPERLESS_AI_LLM_ENDPOINT`, `PAPERLESS_AI_LLM_CONTEXT_SIZE` (default 8192), `PAPERLESS_AI_LLM_REQUEST_TIMEOUT` (default 120), `PAPERLESS_AI_LLM_OUTPUT_LANGUAGE`, `PAPERLESS_AI_LLM_ALLOW_INTERNAL_ENDPOINTS` (default true), `PAPERLESS_AI_LLM_EXTRA_PARAMS`, `PAPERLESS_AI_LLM_EMBEDDING_BACKEND` (`openai-like`, `huggingface`, `ollama`), `PAPERLESS_AI_LLM_EMBEDDING_MODEL`, `PAPERLESS_AI_LLM_EMBEDDING_API_KEY`, `PAPERLESS_AI_LLM_EMBEDDING_ENDPOINT`, `PAPERLESS_AI_LLM_EMBEDDING_CHUNK_SIZE` (default 1024).
  - The configuration page was read only to character 100000 (the final 231 characters were unread).
- Usage docs: https://raw.githubusercontent.com/paperless-ngx/paperless-ngx/main/docs/usage.md
  - AI-enhanced suggestions (title, dates, tags, correspondents, doc types) are opt-in and do not replace classifier suggestions.
  - Document chat from the toolbar; works best with the LLM index (RAG, off by default).
  - "Apply AI Suggestions" workflow action: fills only empty fields unless overwrite is enabled; can create missing tags, correspondents, doc types. This action writes automatically.
  - Providers: remote OpenAI-compatible APIs and local Ollama.
  - Warns that document content is sent to the configured AI provider.
- Recent releases (GitHub API list, 2026-11-21): v3.5.1 (2026-11-18, chat streaming timing), v3.5.0 (2026-11-17, chat reference tweaks), v3.4.2 (2026-11-03), v3.4.0 (2026-10-29, AI chat UX tweaks), v3.3.3 (2026-10-19, suggestions button no longer tied to AI enabled), v3.3.1 (2026-10-12, LLM index uses effective content), v3.3.0 (2026-10-06, passthrough extra params for LLMs), v3.2.1 (2026-09-20).
- Latest release: v3.5.1, 2026-11-18 (https://api.github.com/repos/paperless-ngx/paperless-ngx/releases/latest).
- Whether 2.x had any AI features: not confirmed on a primary source (see UNCONFIRMED).

Secondary sources (not primary, for orientation only): https://wz-it.com/en/blog/paperless-ngx-ai-setup/ (3.0.0 date and AI feature list), https://deepwiki.com/paperless-ngx/paperless-ngx/8-ai-and-llm-integration (not fetched).

Forks of paperless-ngx with AI: a search found no fork of paperless-ngx itself that adds AI. Search results are mostly add-ons (paperless-gpt, paperless-ai) and forks of paperless-ai (paperless-ai-next). Secondary search results only; not exhaustive.

## 3. UNCONFIRMED

- `docling-serve` community-script packaging: CS `ct/docling-serve.sh` returned 404; packaging known only from a third-party index page (https://community-scripts.org/scripts/docling-serve). CPU, RAM, disk, OS not shown.
- CS JSON metadata for all entries: `json/` and `frontend/public/json/` paths returned 404; metadata not read from primary source. Resource defaults above come from the `ct/*.sh` files.
- Whether any paperless-ngx 2.x release had built-in AI: no primary source checked.
- Date paperless-ngx AI landed in the dev branch (PR #10319, 2026-01-13): secondary source only (https://wz-it.com/en/blog/paperless-ngx-ai-setup/ and a second setup guide). Not checked on GitHub.
- paperless-ngx built-in AI: whether it does custom fields, and whether it does vision OCR. Not mentioned in the usage or configuration docs read.
- paperless-ngx upstream licence: not checked (believed GPL-3.0 but not verified here).
- paperless-ngx docs site (docs.paperless-ngx.com): returned 403; GitHub raw docs used instead. The published site may differ.
- paperless-ngx fresh install via CS: whether the fresh-install path installs v3 latest. Only the update path was read (bridge to v2.20.15 is for 2.x installs).
- paperless-gpt: whether it supports webhooks or only tag polling; per-field custom field prompts; whether `mistral_ocr` needs extra keys.
- paperless-ai (clusterzx): whether results can be held for review before write-back; "custom fields expect string values" (third-party guide only); whether `CUSTOM_FIELDS` JSON format is the v4 format.
- paperless-ai-next: current repo name (API redirected to `zettelrobbe`), release date, licence beyond the API field, and Docker Hub image variants.
- Star counts and last-release dates for paperless-ai-next (AlternativeTo's 51 stars is an older third-party listing, not used).
- papra AI status beyond README (no code check). docspell AI features: not researched.
- Community-script defaults could change on CS main after 2026-11-21; values above are as read that day.
- Claims from search snippets not checked on primary sources: paperless-gpt hOCR details beyond the README summary; paperless-ai RAG requirements beyond the README summary.
