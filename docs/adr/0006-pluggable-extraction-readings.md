# Pluggable extraction: Readings from pulled providers and pushed Claude Code

Bills are read by vision-language models, not by OCR plus rules (an experiment on 42 real bills: rules 21% fully right; GLM-5.3 Flash, Claude Sonnet and Haiku 79–82%; models fail on different bills). Two kinds of reader feed one contract. **Providers** are pulled by Dues after upload through one OpenAI-compatible Adapter; each provider is a configuration row `{name, baseUrl, model, keyEnv, privacy: internal|external}` in an ordered list, so BharatCode today and Gemma on the makerspace GPU tomorrow differ only in config. **Claude Code** is pushed by the Claimant: a Dues plugin (an MCP connection plus one skill) lets their own Claude Code, on their own subscription, read their pending bills and submit what it read. Every reader returns values exactly as printed with their labels; Dues alone converts to paise and dates, runs validators and computes confidence. Each submission is stored as an append-only **Reading**; the proposal the Claimant confirms is a fold over all Readings of a document, and agreement between model families raises confidence. Readings only ever propose; confirmed values and Bills on submitted Claims are never overwritten.

## Considered Options

- **OCR + rules extractor** (the original design): rejected on accuracy (21%); dropped entirely, "Couldn't read" covers a total outage.
- **A route planner per document kind and handwriting** (flexible design B): rejected for now; one ordered list filtered by privacy is enough with one or two providers.
- **Dues calling the Claimant's Claude Code**: impossible (it runs on their machine); Claude Code calls Dues instead, as another driving Adapter beside the web UI.
- **Provider-reported confidence**: rejected; not comparable across models.

## Consequences

- External providers send document content outside the internal network. Each provider is marked `internal` or `external`; external ones are used for a Claimant's documents only if that Claimant has opted in (off by default). A Claimant using their own Claude Code makes that choice themselves.
- A provider that answers `refused` (expired or revoked key, plan ended) is skipped until reconfigured; the next provider in the list takes over.
- Books accepts a revised extraction for a document and updates only unconfirmed fields.
- The model name Claude Code reports is self-declared; the same Claimant plus the same model family counts as one vote.
