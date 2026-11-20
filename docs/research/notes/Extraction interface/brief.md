# Brief: pluggable extraction (design it twice)

Repo: this repository (public; placeholders only, no real hosts/people/data).

## Read first
- GLOSSARY.md (domain terms: Expense, Bill, Claim, Claimant, Payment proof, Reference…)
- openspec/changes/dues-core-architecture/design.md — Module map; §3 Extractor (language-agnostic Seam), §5 Intake, D4 idempotency, D5 per-Claimant lock + matching inside Books, D6 authorization at the Actor Seam, D7 Extractor returns confidence not decisions, D8 Books never calls external systems.
- openspec/changes/dues-core-architecture/specs/document-intake/spec.md and specs/assistant-api/spec.md
- docs/research/notes/Local VLM extraction/recommendation.md (vision-direct JSON extraction, validators, confidence from agreement)

## What changed (owner, 2026-11-21)
1. Most Claimants have Claude subscriptions (Sonnet, Opus, Haiku) and Claude Code. The owner wants Claimants to "easily plug Claude Code while filing": their own Claude Code reads their bills and fills Dues, on their subscription. Claude Code runs on the Claimant's machine, so the web app cannot call it; Claude Code must reach Dues (it supports remote MCP servers over HTTP with OAuth, plugins/skills, headless `claude -p --output-format json`, and reads images/PDFs).
2. Server-side async extraction right after upload uses a provider API. Today: BharatCode (`glm-5.3-flash`, OpenAI-compatible chat completions with images and json_schema; flat-rate subscription that may expire soon; external, data may leave India). Tomorrow: Gemma 4 31B on the makerspace GPU (vLLM, OpenAI-compatible, internal), or any other provider. Swapping must be a configuration change, not a code change.
3. Measured on 42 real bills (total+date+bill no all right): GLM-5.3 Flash 79–82% (totals 97–100%, best on scans/handwriting), Claude Sonnet 82% (100% repeatable, but repeats handwriting misreads), Claude Haiku 79–82%, DeepSeek V4.1 Flash 68–71%, local OCR+rules 21%. Models fail on different bills, so agreement between two extractors is a strong confidence signal. Handwritten bills always need a human.

## Invariants any design must keep
- Extraction output is a proposal; Books decides and the Claimant confirms (suggest, then confirm). No extractor writes money state directly.
- Every proposal records which extractor produced it (name, model, version) and when; the audit log shows it.
- Idempotent: re-running or re-submitting for the same document never duplicates.
- Authorization: a Claimant's Claude Code sees and submits only that Claimant's documents (admin excepted); scoped tokens.
- Provider choice may differ by privacy class (internal GPU vs external API); a provider can disappear without data loss or code change.
- Stack: TypeScript app (Next.js), Postgres, pg-boss jobs, paperless-ngx owns files.

## Dependency categories (codebase-design DEEPENING.md)
- Provider APIs (BharatCode, vLLM): true external / remote-but-owned → port + adapters, fake in tests.
- Claimant's Claude Code: an external *driver* that calls in (it is a client of Dues, not a dependency Dues calls).
- Books, Postgres: local-substitutable (real Postgres in tests).
