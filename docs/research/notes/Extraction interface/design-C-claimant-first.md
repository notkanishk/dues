# Design C: Claimant-first extraction (2026-11-21)

Constraint: the commonest caller is a Claimant with Claude Code open. One install, one sentence ("file my pending bills"); the provider path does the rest unattended. Nothing here has been built or run; items marked SPIKE are unverified.

Core idea: **every producer submits the same as-printed JSON to one operation.** A provider Adapter and a Claimant's Claude Code differ only in transport. Normalising, validating, comparing and deciding all sit behind that operation, so a new producer costs a transport and nothing else.

## 1. Interface

Intake is deepened (no new Module). Its Interface becomes three operations plus one port.

```
RawExtraction = { contract: 2, kind, handwritten, legibility,
                  invoices: [{ pages, bill_no, order_ref, date, total, counterparty,
                               seller_gstin, reference, instrument, description, … }] }
                // every field { label, printed } or null: the schema of recommendation §1.5
ExtractorIdentity = { name, model, version }          // e.g. openai-compatible / glm-5.3-flash / <prompt hash>
Agreement = { field → agrees | differs | only_one | failed_check }

Intake.submitExtraction(actor, documentId, raw, by) → Recorded{agreement, reviewUrl} | Rejected{reason}
Intake.documentsToRead(actor)        → [{documentId, Reference?, pageCount, readBy: ExtractorIdentity[]}]
Intake.pages(actor, documentId)      → {images: png[≤4], textLayer?}
Intake.handleDocument(documentId)    → unchanged signature; now = route → Extractor.extract → submitExtraction

port Extractor.extract({images, textLayer, schema}) → RawExtraction | unavailable | contract_mismatch
```

- **Invariants.** A submission is a proposal: it reaches Books only as `LogDocument{documentId, extraction, by}`, and Books decides. It never overwrites a value the Claimant entered or confirmed, and never touches a Bill on a submitted Claim (`locked`). Values travel as printed; only Intake converts to paise and ISO dates, so every producer gets the same parser and validators. `by`, the Actor, the token and the time are written to the audit log with the event. For a Claimant's Claude Code, `by.model` is self-reported and recorded as such. An unreadable document is a valid submission (`kind: unknown`). Confidence is computed from validators and Agreement, never taken from the producer.
- **Idempotency.** Natural key `(documentId, by.name, by.model, by.version)`: a repeat returns the first result. A different extractor on the same document adds a second proposal, never a second Expense or Bill (D4, D5 hold: Books reconciles under the per-Claimant lock).
- **Ordering.** None required. Claude Code may arrive before, after or instead of the provider. Two that agree raise the field to accepted-pending-confirmation; two that differ raise a Check showing both values.
- **Authorization.** `actor` comes only from `Claimants.authenticate`. Foreign documents are `not_found` (D6). The MCP token carries scope `extraction` only: it cannot confirm, submit a Claim or read Expenses.
- **Error modes.** `not_found`, `locked`, `validation{path}`, `contract_mismatch`; from the port, `unavailable`. Nothing else.
- **Config (the swap surface).** `extractors: [{name, baseUrl, model, keyEnv, privacy: internal|external}]` and `route: [names in order]`. Intake picks the first routed entry whose `privacy` the document's class allows (`external` needs the deployment flag and the Claimant not having opted out).

**MCP tools** (a fourth driving Adapter, one tool per operation, no rules): `documents_to_read`, `read_document` (returns page images), `submit_extraction` (input schema = RawExtraction), `upload_url` (one-shot, 5-minute PUT URL for a local file, straight to `Paperless.upload` as the Claimant). The Assistant API stays as it is: maintainer-only, personal token, Back-fill and sync. MCP is for every Claimant, OAuth through Zitadel, and exposes extraction only.

## 2. Usage

**(a) Claimant with Claude Code.** Once: `claude plugin marketplace add <ORG>/dues-plugin && claude plugin install dues`. The plugin holds `.mcp.json` (`https://dues.example.org/mcp`, HTTP) and one skill carrying the field rules of recommendation §1.4. First tool call opens the browser for Zitadel sign-in. Then the Claimant types "file my pending bills". The skill calls `documents_to_read`; for each, `read_document`, reads the pages on the Claimant's subscription, calls `submit_extraction`; for files in the current folder it calls `upload_url`, `curl -T`, then the same. It ends with "7 read, 5 agree with the server, 2 need a look: <reviewUrl>". The Claimant confirms in the app and builds the Claim there. Headless is the same thing: `claude -p "file my pending bills" --output-format json`.

**(b) Async after upload.** paperless webhook → job `intake(documentId)` → `handleDocument` renders pages, picks `bharatcode` from `route`, calls `extract`, then `submitExtraction` as Actor `via: intake`. Books logs the Expense or Bill with the proposal. If the Claimant's Claude Code later reads the same document, Agreement is computed and shown.

**(c) BharatCode expires.** Calls return 401; the Adapter reports `unavailable`; jobs back off; documents are still logged ("couldn't read") and appear in `documents_to_read`, so Claimants' Claude Code keeps things moving. The maintainer edits `route: [gemma-gpu]` and restarts. The inbox sweep re-enqueues every document with no proposal from the current route. No code change, no data lost; old proposals keep their `by`.

## 3. Hidden behind the Seam

Page rendering (200 DPI, 4-page cap) and text-layer extraction; the prompt and `json_schema` request; parsing Indian amounts and day-first dates; validators (arithmetic, GSTIN checksum, reference format, verbatim-in-text-layer); the handwriting cap; routing and privacy class; retry and backoff; the natural idempotency key; mapping a multi-invoice file to several `LogDocument` commands; reconciling proposals (a pure `reconcile(proposals[]) → fields`, inside Books beside Matching); OAuth token → Actor; upload-URL signing.

## 4. Dependencies and Adapters

| Dependency | Category | Adapters | Seam |
|---|---|---|---|
| Provider API | true external / remote-but-owned | `openai-compatible` (BharatCode and vLLM are two config rows of it), `canned` fake | Real: two Adapters. The second *production* Adapter is hypothetical until a non-OpenAI-shaped provider appears |
| Claimant's Claude Code | external driver | MCP Adapter; tests call `submitExtraction` directly | Not a port. The Seam is `submitExtraction`, real because the job and MCP both drive it |
| Books, Postgres | local-substitutable | real Postgres | none (D3) |
| Paperless | existing Seam | HTTP, in-memory fake | unchanged |

Test surface: `submitExtraction` with fixture RawExtractions against real Books (agree, differ, repeat, foreign document, locked Bill, two producers in parallel). The 42-bill corpus runs against the port with recorded provider responses. The MCP Adapter gets one test: tools map one-to-one and a token without the scope is refused.

Skipped: a rules Adapter (21%; "couldn't read" already covers total outage). Add it only if an offline fallback is asked for.

## 5. Trade-offs

- **High Leverage.** One schema serves the provider's `json_schema`, the MCP tool's input schema and the fixtures. One parser and validator set for all producers. A provider swap is a config row. A second opinion from a different model family arrives free, and the brief's measurement says disagreement between models is the best confidence signal available.
- **High Locality.** Trust decisions live in two places only: Intake (normalise, validate) and Books (reconcile, decide). The MCP Adapter and the skill hold no rules that matter if wrong.
- **Thin: the Claimant path is not under Dues' control.** The skill is a prompt on someone else's machine and model; `by.model` is self-reported; quality varies with the Claimant's plan. Acceptable because it only ever proposes on that Claimant's own documents, which they could have typed. It must never be the *only* reason a handwritten bill is accepted.
- **Thin: agreement is weaker than it looks** when the Claimant's Claude Code and the provider share a failure (Sonnet repeats handwriting misreads). The handwriting cap stays regardless of Agreement.
- **Privacy.** A Claimant running Claude Code sends their own documents to Anthropic. That is their choice, made at OAuth consent, and the consent screen must say so. It contradicts document-intake's "MUST NOT send a document to an external service", which needs rewording either way because BharatCode already breaks it.
- **Cost of the easy case.** Dues now runs an OAuth-protected MCP endpoint and ships a plugin. SPIKE: Zitadel as authorization server for Claude Code (dynamic client registration or a pre-registered client ID); image results from `read_document` within Claude Code's MCP output limits; the `upload_url` hop from the skill.
- **Extractor port gets shallower.** With one production Adapter it mostly forwards an HTTP call. It earns its place through the fake, not through variety.
