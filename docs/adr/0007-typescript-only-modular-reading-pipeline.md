# TypeScript only, with a modular reading pipeline (PageText, Locator, validators)

Status: Accepted, 2026-11-21. Owner, 21 Nov 2026: "lock in typescript for now. make the architecture modular so that we can swap out different modules and sources for different functions such as text extraction, boxing, comparing, etc".

Dues is one TypeScript app: Next.js 16 on Bun. Any other language, and any GPU model, joins only as an HTTP Adapter behind an existing port, never in-process. This replaces the earlier clause "a Python worker if the gate fails" (design Open Question 1, `openspec/config.yaml`). The reading pipeline is split into parts that can each be swapped: **PageText** (words with boxes from a page; a Seam), the **Locator** (finds a value among those words; a pure Module), the **Extractor** (ADR 0006, unchanged) and the **validators** (pure functions that compare proposal, readings and located boxes). The rule from the design stands: one Adapter is a hypothetical Seam, two make a real one, pure Modules need no Seam. Detail: design §3a.

## Stack

Bun 1.4 (runtime, package manager, script runner), with Node 24 as the fallback runtime for any piece that fails the Bun compatibility check (task 1.7); Next.js 16 (App Router); Drizzle 0.45 on `pg` (Postgres 18); Vitest (unit, db, golden) and Playwright; pg-boss 12; `@modelcontextprotocol/sdk`; `web-push` 4.0.0 (pin 3.x if the ESM major bites); docxtemplater plus Gotenberg; `sharp` plus `@embedpdf/pdfium`; `onnxruntime-node` for OCR; Zod for the RawExtraction contract 2 (JSON Schema is generated from it).

**Web framework and runtime (owner, 21 Nov 2026: "nextjs and bun").** Next.js 16 (`docs/research/notes/Tracker stack choice/stack_choice.md`) on Bun. Known Bun risks, checked in task 1.7: `node:crypto` is only partly implemented (web-push VAPID signing), Next.js on Bun is supported by Bun rather than by Next.js's primary target, and onnxruntime-node memory grows per page in one Bun process (the OCR worker already runs a worker per few pages). Anything that fails runs on Node 24 instead; the Module map does not change (design D10).

**Bun compatibility (task 1.7, 21 Nov 2026, Bun 1.4.5, fictional data).** Under `bun --bun` these pass: the Next.js 16 standalone server (SSR page and a route handler reading Postgres via Drizzle), web-push 4.0.0 (ES256 VAPID verified, aes128gcm payload round-trips), pg-boss 12 (including a retry), Drizzle 0.45 and drizzle-kit migrate, openid-client (discovery, PKCE, token exchange, ID token), `@embedpdf/pdfium` char boxes (0 delta against Node), onnxruntime-node PP-OCRv6 small, and docxtemplater (byte-identical to Node). **No production piece needs Node.** Vitest's default forks pool fails under Bun (`child.channel?.unref is not a function`); tests run with `--pool=threads`. OCR peak memory is about 25 to 30% higher on Bun than on Node (about 0.9 GB against 0.7 GB per worker-per-page), so the OCR worker keeps one page per worker.

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
