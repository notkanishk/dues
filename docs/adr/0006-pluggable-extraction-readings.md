# Pluggable extraction: Readings from pulled providers and pushed Claude Code

Bills are read by vision-language models, not by OCR plus rules (an experiment on 42 real bills: rules 21% fully right; GLM-5.3 Flash, Claude Sonnet and Haiku 79–82%; models fail on different bills). Two kinds of reader feed one contract. **Providers** are pulled by Dues after upload through one OpenAI-compatible Adapter; each provider is a configuration row `{name, baseUrl, model, keyEnv, privacy: internal|external}` in an ordered list, so BharatCode today and Gemma on the makerspace GPU tomorrow differ only in config. **Claude Code** is pushed by the Claimant: a Dues plugin (an MCP connection plus one skill) lets their own Claude Code, on their own subscription, read their pending bills and submit what it read. Every reader returns values exactly as printed with their labels; Dues alone converts to paise and dates, runs validators and computes confidence. Each submission is stored as an append-only **Reading**; the proposal the Claimant confirms is a fold over all Readings of a document, and agreement between model families raises confidence. Readings only ever propose; confirmed values and Bills on submitted Claims are never overwritten.

## Considered Options

- **OCR + rules extractor** (the original design): rejected on accuracy (21%); dropped entirely, "Couldn't read" covers a total outage.
- **A route planner per document kind and handwriting** (flexible design B): rejected for now; one ordered list filtered by privacy is enough with one or two providers.
- **Dues calling the Claimant's Claude Code**: impossible (it runs on their machine); Claude Code calls Dues instead, as another driving Adapter beside the web UI.
- **Provider-reported confidence**: rejected; not comparable across models.

## Evidence

Prototype on 42 real bills (aggregates only; data stays private), GLM vision model: text PDF as text layer plus 100 dpi image gave 0 broken fields and 55% fewer prompt tokens than the text layer plus a 200 dpi image; text only, a 1280 px cap (broke GSTINs), crop, 2048 px upscale, region bands, and paperless OCR text for raster images were dropped (no gain or worse). The second-reading triggers caught only 5 of 8 bills with a wrong key field (the keep rule needed ≥ 80%). Agreement across model families works for totals but not for dates and bill numbers (6 cases where both agree on the wrong value). Detail: design §3.

## Consequences

- Paperless adds nothing before the model. After it: OCR text grounds values (ambiguous numeric date does not count, total > 0, bill number label risk), archive-PDF word positions give highlight boxes (located: totals 26 of 38, date 24, bill number 21 located and right, GSTIN 17; photos and handwriting often not, shown as "not located"), and its checksum catches duplicates. Its own date is not a Reading (15 right, 6 wrong, 17 none).
- Agreement between families raises confidence but never replaces confirmation by the Claimant (ADR 0009).
- External providers send document content outside the internal network. Each provider is marked `internal` or `external`; external ones are used for a Claimant's documents only if that Claimant has opted in (off by default). A Claimant using their own Claude Code makes that choice themselves.
- A provider that answers `refused` (expired or revoked key, plan ended) is skipped until reconfigured; the next provider in the list takes over.
- Books accepts a revised extraction for a document and updates only unconfirmed fields.
- The model name Claude Code reports is self-declared; the same Claimant plus the same model family counts as one vote.
