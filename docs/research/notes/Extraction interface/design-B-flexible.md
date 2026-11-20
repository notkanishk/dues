# Design B: flexible extraction (Readings in, one Proposal out)

Constraint: maximise flexibility (ensembles, routing by kind and privacy class, per-Claimant opt-in, fallbacks, new provider types, Claude Code as just another extractor) while staying deep.

Idea: every extractor, whether Dues calls it (provider API) or it calls Dues (Claude Code, a human), ends in the same fact: a **Reading** (one extractor's Extraction of one document). A **Proposal** is a pure fold over a document's Readings. Routing is data. New terms for the GLOSSARY: Reading, Proposal, Route.

## 1. Interface

One new Module, **Extraction**, between Intake and the existing Extractor Seam (design.md §3, unchanged contract plus one error mode).

```
request(documentId, opts?: {force})            → void          // plan and enqueue; safe to repeat
submit(actor, documentId, reading)             → Proposal      // any push extractor
proposal(actor, documentId)                    → Proposal | not_found
pending(actor)                                 → DocumentRef[] // documents whose plan still wants a push extractor

Reading  = { extraction: Extraction /* §3 JSON, contract: 1 */,
             extractor: { name, model, version, attested: bool }, documentChecksum, at }
Proposal = { revision, kind, fields: { [f]: { value, confidence, agreedBy: extractor[], dissent? } },
             state: "waiting" | "settled" | "needs_human", readings: ReadingRef[] }
Route    = { when: { kind?, source?, handwritten? }, steps: ExtractorName[][], quorum: 1 | 2 }  // config
ExtractorConfig = { name, type: "openai-compatible" | "rules" | "push", endpoint?, model?,
                    privacy: "internal" | "external" | "claimant-device", family }             // config
```

Invariants
- A Reading is append-only and unique on `(documentId, extractor.name, model, version, documentChecksum)`; a repeat `submit` returns the current Proposal and stores nothing (D4).
- A Proposal is a commutative fold: any arrival order of the same Readings gives the same Proposal. `revision` only grows.
- Confidence is computed, never taken across extractors: agreement between Readings of different `family` plus validators (recommendation.md §1.7). Two Readings of one family count as one vote (Sonnet repeats its own misreads). `handwritten: full` caps every field at 0.50 and sets `needs_human`.
- Privacy is enforced in the planner, not in Routes: an `external` extractor is never called for a document whose Claimant has not opted in, whatever the config says. `claimant-device` extractors run only by the Claimant's own act.
- Extraction never writes money state. It hands Proposals to Intake, which issues `LogDocument` (first revision) or `ReviseExtraction` (later ones) to Books; Books decides and the Claimant confirms (D5, D7). Fields the Claimant confirmed are never overwritten.
- `submit` takes an Actor (D6); a foreign document is `not_found`. A push Reading has `attested: false` (model name is self-reported) and is shown as such in the audit log.

Ordering: `request` any time after the document exists; `submit` any time, before or after server Readings, even after confirmation (then it is audit only).

Error modes. `submit`: `not_found`, `contract_mismatch`, `stale_document` (checksum differs). Extractor port: `unavailable` (retry), `contract_mismatch`, and new `refused` (401/402/403: expired or revoked; retry is useless, the extractor is marked down and an admin is told). An unreadable document remains a valid Reading, not an error.

## 2. Usage

**(a) Claimant files with their Claude Code.** Once: the Claimant adds the Dues remote MCP server (HTTP, OAuth; token scoped to that Claimant, scope `extraction`) and installs the Dues skill, which carries the prompt and the §3 JSON schema. Filing: Claude Code reads bills from a local folder, calls `upload_document` (existing upload path → paperless) or `pending_documents` for ones already uploaded, reads the image itself, calls `submit_reading`. Dues stores the Reading, folds it with any server Reading (agreement lifts confidence; dissent is shown), Intake sends `LogDocument`/`ReviseExtraction`, and the Claimant confirms in the app. Claude Code cannot confirm, submit a Claim, or see another Claimant's documents.

**(b) Upload processed async.** Webhook → `intake(documentId)` job → `Extraction.request(id)`. Planner: Claimant opted in to external → Route default `steps: [["glm"], ["rules"]]`, quorum 1. Runner calls the `openai-compatible` Adapter (`extract`), stores the Reading via the same path as `submit`, Proposal `settled`, Intake sends `LogDocument`. Claimant not opted in → `glm` is filtered out; plan runs `rules` and leaves the document in `pending` for Claude Code or the human path.

**(c) BharatCode expires.** The Adapter returns `refused`; the extractor is marked down; the planner re-plans every `waiting` document on the next step (`rules`, low confidence, so nothing is dropped). Admin changes config: add `gemma` (`type: openai-compatible`, vLLM endpoint, `privacy: internal`), put it first in the Route. No code change, no data loss: existing Readings and Proposals stand. Optional `request(id, {force})` re-reads old low-confidence documents; the new Reading has a new unique key, so nothing duplicates.

## 3. Hidden behind the Seam

The planner (pure: `plan(routes, document facts, consent, readings so far, extractor health) → next extractors | settled | needs_human`, re-run after every Reading, which is how routing by kind works when kind is only known after a first pass); the opt-in and privacy filter; extractor health and back-off; fan-out as pg-boss jobs with singleton keys; Reading storage and de-duplication; the fold (agreement, family independence, validators, handwriting cap); the revision counter; prompts, image rendering and JSON-schema handling inside each Adapter.

## 4. Dependencies and Adapters

| Seam | Adapters | Status |
|---|---|---|
| Extractor port (`extract`, pull) | `openai-compatible` (BharatCode and vLLM Gemma differ only by config), `rules`, canned fake | Real (three) |
| Push (`submit`) | MCP Driving Adapter for Claude Code; tests call `submit` directly | Real, and the MCP Adapter is thin transport like the Assistant API |
| Anthropic API, local OCR specialist | none yet | Hypothetical: add an Adapter type when one is wanted, not before |
| Human as extractor | none; the Claimant's correction is Books' confirm, not a Reading | Hypothetical; only needed if someone other than the Claimant keys bills in |
| Books, Postgres | real Postgres in tests | Local-substitutable, no Seam |
| Paperless | existing HTTP Adapter + in-memory fake | Real (existing) |

Tests cross the Interface only: fake Extractor Adapters scripted per document (answer, `unavailable`, `refused`), real Postgres, then assert on `proposal()` and on the commands Intake sent. Property test: shuffled Reading order gives one Proposal. The planner is tested as a pure function through an internal Seam.

## 5. Trade-offs

- **High Leverage**: four operations cover push and pull, one or many extractors, every provider type. Privacy, fallback and agreement have Locality: one planner, one fold. A new OpenAI-compatible provider is config only.
- **Thin**: Routes are a small policy language in config; a wrong Route fails at run time, so it needs a validator and a dry-run. The `openai-compatible` Adapter is the only thing that truly varies today; ensembles and kind-routing serve a single-provider system on day one.
- **Cost to Books**: a second command, `ReviseExtraction`, because a Proposal can change after `LogDocument`. This widens Books' Interface and is the price of late Readings (Claude Code after the server pass).
- **Trust**: push Readings are unattested; a Claimant's Claude Code agreeing with itself must not count as two votes (same Actor + same family = one vote).
- **Complexity**: one more table (Readings), a planner, a health record, a revision protocol. If only "one provider, swappable by config" plus "Claude Code submits" is needed, the planner and Routes are speculative; `submit` and the Reading/Proposal fold are the parts that earn their keep either way.
