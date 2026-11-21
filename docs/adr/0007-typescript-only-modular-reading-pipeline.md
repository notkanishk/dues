# TypeScript only, with a modular reading pipeline (PageText, Locator, validators)

Status: Accepted, 2026-11-21. Owner, 21 Nov 2026: "lock in typescript for now. make the architecture modular so that we can swap out different modules and sources for different functions such as text extraction, boxing, comparing, etc".

Dues is one TypeScript app: Next.js 16 on Bun. Any other language, and any GPU model, joins only as an HTTP Adapter behind an existing port, never in-process. This replaces the earlier clause "a Python worker if the gate fails" (design Open Question 1, `openspec/config.yaml`). The reading pipeline is split into parts that can each be swapped: **PageText** (words with boxes from a page; a Seam), the **Locator** (finds a value among those words; a pure Module), the **Extractor** (ADR 0006, unchanged) and the **validators** (pure functions that compare proposal, readings and located boxes). The rule from the design stands: one Adapter is a hypothetical Seam, two make a real one, pure Modules need no Seam. Detail: design §3a.

## Stack

Latest stable releases as of 21 Nov 2026 (owner: "use the latest versions of all"), pinned exactly in the lockfile and image tags, and raised deliberately rather than floated:

| Piece | Version |
|---|---|
| Runtime, package manager, script runner | Bun 1.4.5 (fallback runtime: Node 26.13 LTS) |
| Web framework | Next.js 16.4.6, React 19.3.1 |
| Language | TypeScript 7.0.2 |
| Database | Postgres 19.0; `pg` 8.23.1; Drizzle ORM 0.45.4, drizzle-kit 0.31.11 |
| Jobs | pg-boss 12.38.2 |
| Contract | Zod 4.6.7 (JSON Schema generated from it) |
| Tests | Vitest 5.1.1 (`--pool=threads`), Playwright 1.65.1 |
| Identity | openid-client 6.9.1 |
| Push | web-push 4.0.0 |
| Assistant API | `@modelcontextprotocol/sdk` 1.32.2 |
| Claim form | docxtemplater 3.71.1 with PizZip 3.3.0; Gotenberg 9.9.1 |
| Images and PDF text | sharp 0.35.5; `@embedpdf/pdfium` 2.15.1 |
| OCR | onnxruntime-node 1.31.1 with PP-OCRv6 (denormal weights zeroed); `@gutenye/ocr-node` 1.4.9 if it fits the worker |

**Web framework and runtime (owner, 21 Nov 2026: "nextjs and bun").** Next.js 16 (`docs/research/notes/Tracker stack choice/stack_choice.md`) on Bun. Known Bun risks, checked in task 1.7: `node:crypto` is only partly implemented (web-push VAPID signing), Next.js on Bun is supported by Bun rather than by Next.js's primary target, and onnxruntime-node memory grows per page in one Bun process (the OCR worker already runs a worker per few pages). Anything that fails runs on Node 26 LTS instead; the Module map does not change (design D10).

**Bun compatibility (task 1.7, 21 Nov 2026, Bun 1.4.5, fictional data).** Under `bun --bun` these pass: the Next.js 16 standalone server (SSR page and a route handler reading Postgres via Drizzle), web-push 4.0.0 (ES256 VAPID verified, aes128gcm payload round-trips), pg-boss 12 (including a retry), Drizzle 0.45 and drizzle-kit migrate, openid-client (discovery, PKCE, token exchange, ID token), `@embedpdf/pdfium` char boxes (0 delta against Node), onnxruntime-node PP-OCRv6 small, and docxtemplater (same `document.xml` as Node; the zip bytes differ). **No production piece needs Node.** Vitest's default forks pool fails under Bun (`child.channel?.unref is not a function`); tests run with `--pool=threads`. OCR peak memory is about 25 to 30% higher on Bun than on Node (about 0.9 GB against 0.7 GB per worker-per-page), so the OCR worker keeps one page per worker.

**Recheck on the pinned versions (task 1.8, 21 Nov 2026).** Every check above passes again on Bun 1.4.5 and on Node 26.13, plus three more: a TypeScript 7.0.2 typecheck (`next build` runs TS 7 itself and catches type errors, so `ignoreBuildErrors` is not needed; a stale `tsconfig.tsbuildinfo` gives false errors, so CI clears it and runs `next build` before `tsc`), a Gotenberg 9.9.1 conversion of the filled form (valid one-page PDF), and an MCP SDK 1.32.2 server inside a Next.js route handler (`initialize`, `tools/list` and a tool call). OCR memory on Bun is about 33% above Node per worker. The only fallback remains Vitest's forks pool (`--pool=threads`). `sharp` was installed but not exercised; its first use is covered by its own task tests.

## Considered Options

- **TypeScript plus a Python worker** (the earlier leading candidate): rejected; the box bake-off found no field where Python wins by more than 1 to 2 values of 38 (below), and a second language costs an image, a lockfile and a test runner.
- **Python for OCR only**: rejected for the same reason; it stays possible as an HTTP Adapter.
- **Model grounding boxes as the primary locator** (a vision model returns boxes): rejected; about 70% land in the right place, and about 150 s a bill.
- **A vision-language OCR model in-process**: rejected; none beats PP-OCRv6 on CPU, and they cost tens of seconds to minutes a page (`docs/research/notes/OCR models 2026/models.md`).

## Evidence

Box bake-off, 21 Nov 2026: 38 single-invoice real bills (14 text PDFs, 24 raster). Data stays private; only aggregate counts are recorded here.

- **Field locations** (total / date / bill number / GSTIN located, out of 38 / 38 / 30 / 26):
  - TypeScript text layer plus PP-OCRv6 small: 34 / 28 / 28 / 26.
  - Best Python (PP-OCRv6 medium through RapidOCR): 35 / 30 / 28 / 26.
  - Old baseline (paperless's text layer, strict matcher): 26 / 25 / 24 / 17.
- **Text layer parity:** `@embedpdf/pdfium` character boxes equal pypdfium2's on 38 PDFs (0.0000 pt delta), at about 0.01 s a page.
- **Values read on raster bills** (out of 77): 66 for TypeScript PP-OCRv6 small, 67 for Python medium, against 40 for paperless's Tesseract.
- **Model grounding boxes:** about 70% in the right place; too slow; not a primary option.
- **Speed and memory:** with `intraOpNumThreads` 2 the same model ran 5x faster than with default threads on a 6-core container. In Node, memory grows with every page in one process.
- **No vision-language OCR model beats PP-OCRv6 on CPU** (models.md; no Indian-bill benchmark exists, so this is reasoned from other data).

## Consequences

- **Swap rule.** Any change of PageText Adapter, Extractor provider, Locator or validator list passes the gold-set gate: a script in `evals/` runs any PageText x Extractor x Locator combination against a gold set kept outside the repo and prints the per-field table. The swap must not score below the current one on any field. Only aggregate numbers are recorded.
- Paperless keeps two jobs: the archive file and the checksum. Its OCR text no longer grounds values and its word positions no longer give boxes; this updates the Consequences of ADR 0006.
- PP-OCR runs in a worker with a thread cap and bounded memory. The ONNX files need their denormal weights zeroed first; their licence is checked before shipping.
- A GPU or non-TypeScript OCR service (for example Nemotron OCR v2 or PaddleOCR-VL) is added as an `http-ocr` PageText Adapter, with no change to callers.
- The Claim form filler is docxtemplater (design §6).
