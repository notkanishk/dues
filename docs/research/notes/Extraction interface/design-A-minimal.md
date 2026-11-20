# Design A: minimal interface (one function, seen from two sides)

Constraint: 1–3 entry points across both paths. Result: **three operations, one data type.**

Core idea: extraction is one function, `Document → Extraction`. A provider is that function *called by Dues* (pull). A Claimant's Claude Code is the same function *inverted* (push): Dues hands out the argument (`pending`) and receives the return value (`propose`). The async path is then not a second interface: the provider runner is just another driver that calls `pending`, then `extract`, then `propose`, exactly as Claude Code does with its own eyes in place of `extract`.

## 1. Interface

```
Extraction = { contract: 1, kind: {value, confidence},
               fields: { amount_paise, date, counterparty, reference, bill_no, ... },   // each {value, confidence, evidence?} or absent
               extractor: { name, model, version } }          // design.md §3, plus `model`

extract(document) → Extraction                                 // Extractor Seam (§3), unchanged; outbound
pending(actor) → [{ documentRef, checksum, mime, fetchUrl, have: [extractor.name] }]
propose(actor, document: {ref} | {bytes, filename}, extraction)
        → Recorded{ documentRef, state: "proposed" | "agreed" | "differs" | "settled", differs: [field] }
```

`pending` and `propose` are the Interface of **Intake** (replacing the internal Extractor chaining behind `handleDocument`). `extract` stays the Extractor Seam.

**Invariants**
- `propose` never writes money state. It stores the Extraction and has Books re-decide through `LogDocument`; the Claimant confirms in the app (D7, assistant-api "nothing confirmed by the assistant").
- One stored Extraction per `(document, extractor.name, model, version)`. Same key again replaces it; nothing duplicates (D4 natural key; no idempotency header needed). `{bytes}` is de-duplicated by checksum (`Paperless.findByChecksum`).
- `actor`, `via` and the timestamp are stamped by the server, never taken from input. `extractor` is self-declared by the driver and recorded as such in the audit log.
- Scoping is the Actor (D6): `pending` lists only the Actor's documents; a foreign `ref` is `not_found`. Admin and `via: intake` pass the filter.
- After the Claimant confirms, `propose` returns `settled` and changes nothing (still audited).
- Confidence in the merged proposal is computed by Intake from agreement between stored Extractions plus validators; a driver's own `confidence` is only a tie-breaker. Handwritten → always needs the Claimant.
- Amounts are integer paise; an unreadable document is a valid Extraction (`kind: unknown`), not an error.

**Ordering**: none required of the caller. `propose{bytes}` before the paperless webhook, after it, or twice, all converge (Books serialises per Claimant, D5). `pending` is optional: a driver that already holds the file skips it.

**Error modes**: `not_found`, `invalid` (schema: floats, bad date), `contract_mismatch`, `unavailable` (paperless or provider down; safe to retry). `extract` keeps its two: `unavailable`, `contract_mismatch`.

## 2. Usage

**(a) Claimant files with their Claude Code.** One-time: add the Dues remote MCP server; OAuth through Zitadel yields a token Actor with scope `extraction` (two tools only: `pending`, `propose`). Then: "file the bills in ~/Bills". Claude Code reads each PDF/image itself, calls `propose({bytes, filename}, extraction)` with `extractor: {name: "claude-code", model: "sonnet-…"}`. Dues uploads to paperless under the Claimant, records the Extraction, Books logs or matches. For bills already shared from the phone, Claude Code calls `pending`, fetches via `fetchUrl` (the existing owner-checked download proxy), and proposes. `Recorded.differs: ["bill_no"]` lets it tell the Claimant where it and the server provider disagree. The Claimant opens Dues and confirms.

**(b) Upload processed async.** Webhook enqueues `intake(documentId)` (unchanged). The job is a driver with `via: intake`: for each configured provider not in `have`, `propose(ref, adapter.extract(document))`. If Claude Code later proposes the same document, state becomes `agreed` or `differs`; no special case.

**(c) BharatCode expires.** Before: `EXTRACTION_PROVIDERS=[{name:"bharatcode", baseUrl, model:"glm-5.3-flash", keyEnv, privacy:"external"}]`. Calls start failing → `unavailable` → pg-boss retries with backoff; documents are already logged ("couldn't read" path), nothing lost. Maintainer edits config to `{name:"gpu", baseUrl:"http://gpu.internal/v1", model:"gemma-4-31b", privacy:"internal"}` and restarts. Unsettled documents lack `gpu` in `have`, so the sweep extracts them again; settled ones are never re-run; old Extractions keep their `bharatcode` stamp in the audit log. No code change.

## 3. What the Implementation hides

Behind `propose`/`pending` (Intake): paperless upload and checksum de-dup, owner → Claimant resolution, storing Extractions, agreement and validator scoring, thresholds, merging into one proposal, building `LogDocument`, write-back, provider selection by privacy class, the job runner and sweep.
Behind `extract` (Adapter): prompt, json_schema, image rendering, two-view runs, retries, model id/version discovery.

## 4. Dependencies and Adapters

| Seam | Adapters | Verdict |
|---|---|---|
| `extract` (true external / remote-but-owned) | **one** OpenAI-compatible Adapter (BharatCode and vLLM are two *configurations* of it), rules, canned fake | Real: three Adapters. No per-provider Adapter until a provider is not OpenAI-compatible. |
| Intake Interface (`pending`/`propose`) | called in-process by the job; exposed by MCP and by the Assistant API HTTP route | Not a Seam with Adapters: MCP and HTTP are transports (deletion test: nothing else changes). Claude Code is a driver, never faked as a dependency; tests call `propose` with a constructed Actor. |
| Paperless | HTTP, in-memory fake | Existing, real. |
| Books, Postgres | real Postgres in tests | Local-substitutable; no port. |

Test surface: `propose` scenarios against fake Paperless + real Books (repeat, out of order, two extractors agree/differ, foreign Actor, after confirm); the corpus contract suite against every `extract` Adapter.

## 5. Trade-offs

- **Leverage is high** at `propose`: every extractor that will ever exist (Claude Code, a provider, a human-run script, a future batch re-read) enters through one operation that carries authorization, idempotency, audit stamp and agreement scoring. Agreement between extractors, the strongest measured signal, falls out for free instead of being a feature.
- **Locality**: provider change touches config only; scoring changes touch Intake only.
- **Thin spots**: `pending` is little more than a query; kept because without it Claude Code cannot work on phone-shared documents. `propose` overloads `{ref} | {bytes}`: one entry point, two preconditions to learn.
- **Cost**: Books' `LogDocument` must accept a repeat with a revised merged Extraction and update only unconfirmed fields (today a repeat returns the original result). That is the one change outside Intake.
- **Trust**: `extractor.model` from Claude Code is unverifiable; only the Actor is. Acceptable because the Claimant confirms anyway and could type the values by hand.
- **Privacy**: each provider entry carries `privacy: internal | external`; Intake's runner skips external providers unless `EXTRACTION_ALLOW_EXTERNAL` is set. **This contradicts document-intake's "MUST NOT send a document to an external service"; using BharatCode needs that requirement amended by the owner.** The Claude Code path sends a Claimant's own documents from their own machine under their own subscription: their choice, not Dues'; Dues only serves the owner their own file.
- **Skipped**: headless `claude -p` server-side, a plugin/skill package, per-provider Adapters, a provider-registry Module. Add when a non-OpenAI-compatible provider or a non-MCP driver actually appears.
