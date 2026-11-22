# Brief: the Claimant's own Claude Code checks their bills

For the designer. Gathered from the spec on 2026-11-21; nothing invented. Where the spec is silent it says so, and the silence is listed as an Open question (§5). Paths are relative to the repo root; `design.md` = `openspec/changes/dues-core-architecture/design.md`; `intake` = `openspec/changes/dues-core-architecture/specs/document-intake/spec.md`; `FUNC` = `docs/spec/FUNCTIONAL.md`.

**The flow to shape.** A Claimant connects their own Claude Code (their own Anthropic subscription) to Dues. Claude Code reads their bills; the Claimant reviews, confirms, and later builds a Claim. Owner wants it elegant, intuitive, posh.

## 1. Lifecycle as specced today

**Expense** (FUNC 78-88): `draft` (Amazon pick or Back-fill, not yet confirmed) -> `open` -> `settled`; `closed` by discard, personal, duplicate or written off. Shared payment confirmations (W1) and bills (W4) skip `draft` and open the Expense at once (FUNC 84). Status is derived, never set by hand except `closed`.

**Bill** (FUNC 90-105): `expected` -> fulfilled -> `ready` (needs Fulfilled and a document) -> `claimed` -> `reimbursed`; `cancelled` before fulfilment. A second axis sits beside status: `review` is `in review` until the Claimant confirms every field, then `confirmed`; any value change or Undo confirm sends it back (FUNC 55, 96-98, 102-103; ADR 0009 line 3). Only `ready` Bills go on a Claim, and a Bill in review is blocked (FUNC 101).

**Claim** (FUNC 107-116): `draft` -> `submitted` -> `reimbursed`; recall returns to `draft`. Built from `ready` Bills (W7, FUNC 182-186). Name is assigned when the package is built, e.g. 2026/November1 (FUNC 60).

**Where Readings, confirmation and review sit**
- A document arrives by phone share, upload, mail rule or folder drop (W1 FUNC 126-128; W4 FUNC 155-157; `intake` 137-142). Dues classifies it, extracts, and logs the Expense or Bill immediately (FUNC 129, 157-160).
- Extraction produces Readings (ADR 0006 line 5). The folded proposal is what the Claimant reviews field by field on screen R (design.md 107, 118; Bill review UX `design.md` section 7 line 696).
- Confirmation is the one gate before a Claim: "Readings only propose; the Claimant confirms" (GLOSSARY 64; AGENTS 22; PRODUCT 30).
- Claim building follows confirmation: select `ready` Bills, duplicate check, form PDF plus package, the Claimant sends the email and marks `submitted` (FUNC 182-186; ADR 0003 line 8; `claims` spec 98-112).

## 2. The Claude Code path: what is decided

**Concept.** Dues cannot call a Claimant's Claude Code (it runs on their machine); Claude Code calls Dues, as another driving Adapter beside the web UI (ADR 0006 line 11; design.md 96, 223). It is "the same function turned around": it asks what is pending and hands back what it read (design.md 96).

**Transport and shape.** A Dues plugin: an MCP connection plus one skill, "file my pending bills" (ADR 0006 line 5; design.md 171; tasks 125). Tools: `documents_to_read`, `read_document`, `submit_extraction`, `upload_url` (design.md 171; tasks 124). `read_document` returns page images; `upload_url` is a one-shot 5-minute PUT link for a local file (design C, `Extraction interface/design-C-claimant-first.md` 34). The SDK and an MCP server inside a Next.js route handler were checked (ADR 0007 lines 22, 31). The brief noted Claude Code supports remote MCP over HTTP with OAuth, plugins and skills (`Extraction interface/brief.md` 12).

**Auth.** MCP authorised through Zitadel, OAuth, scope `extraction` (`intake` 197-198; design.md 171). Design C: the token cannot confirm, submit a Claim or read Expenses (C 30). First tool call opens the browser for sign-in (C 38).

**Read and write rights.**
- Sees and submits only the Claimant's own documents; another Claimant's document is "not found" (`intake` 198, 204-206; tasks 124).
- Never confirms, never submits a Claim, never sends anything (assistant-api spec 18-27 for the API; C 30 for MCP). Every suggestion waits for the Claimant.
- Writes only Readings, plus an optional upload of a local file (design.md 167; C 34).
- Repeat submissions are safe: a Reading is unique on (document, extractor name, model, version) and a repeat is the same Reading (design.md 107; `intake` 175).

**Readings, storage and fold.**
- Each Reading is append-only: `{documentRef, checksum, extractor{name, model, version}, by: provider|claude-code, actor, raw, at}` (design.md 107).
- Values are returned exactly as printed with labels; Dues alone converts to paise and dates, validates and computes confidence (ADR 0006 line 5; design.md 99-100). Handwritten `2270-00` becomes 2,270.00 (design.md 107; `intake` 193-195).
- The proposal is an order-independent fold over all Readings of a document (design.md 107).

**Confidence and auto-accept.**
- Confidence comes from validators plus agreement between model families, never from the reader (ADR 0006 line 12; design.md 107, 148). Validators: grounded-in-text, arithmetic, GSTIN check digit, UPI reference, cross-family agreement, plausibility (design.md 148).
- Two readers agree: fields "proposed with high confidence". Two differ (700 vs 7,000): flagged, "neither value is accepted automatically" (`intake` 177-183).
- Agreement raises confidence but "never replaces confirmation" (ADR 0006 line 21; design.md 114). No threshold or auto-confirm rule exists in the spec. The Claimant never sees a confidence score, a percentage, or the words "AI" or "verified" (PRODUCT 30, 56; DESIGN 344).

**Handwritten rules.** A handwritten bill always needs the Claimant's confirmation, whatever the agreement (`intake` 189-191; design.md 107). Design C: Claude Code "must never be the only reason a handwritten bill is accepted" (C 65). Measured: Claude Sonnet repeats handwriting misreads (C 66; `Extraction interface/brief.md` 14).

**Cross-family agreement.** The model name Claude Code reports is self-declared; same Claimant plus same model family counts as one vote (ADR 0006 line 25; `intake` 208-210). Agreement works for totals but not dates and bill numbers: 6 cases where both agree on the wrong value (ADR 0006 line 16; design.md 114).

**Late and repeat Readings.** A Reading after the Claimant confirmed the total stays history only (`intake` 185-187). Books accepts a revised extraction and updates only unconfirmed fields (ADR 0006 line 24; tasks 70).

**Claude-optional guarantee.** The app works fully without it (ADR 0003 line 3; FUNC 12; assistant-api spec 4, 14-16). If no reader works the Expense or Bill is still logged and the Claimant types the values: "Couldn't read" (FUNC 133; design.md 101, 168; Bill review UX `design.md` 159).

**Privacy.** A Claimant using their own Claude Code makes that data choice themselves (ADR 0006 line 22). Design C (not a decision): the OAuth consent screen "must say so" (C 67).

**Status.** Spec only. Phase 5 (design.md 360; tasks 124-125). Spikes first: Zitadel as MCP authorisation server (DCR or pre-registered client), image size limits in MCP results, the `upload_url` hop (tasks 125; C 68). Unbuilt and unverified.

## 3. The async provider path, and how the two relate

- Dues pulls: paperless webhook -> job -> `handleDocument` runs the configured providers (design.md 167, 225, 250; `intake` 3-16). A provider is a config row `{name, baseUrl, model, keyEnv, privacy: internal|external}` in an ordered list; swapping is configuration only (ADR 0006 line 5; design.md 103; `intake` 170-172).
- External providers are used only if that Claimant opted in; off by default, changeable any time, audited (`intake` 159-164; `identity-access` spec 105-114; ADR 0006 line 22).
- `refused` (expired or revoked key) skips that provider until reconfigured; the next takes over (ADR 0006 line 23; `intake` 166-168). If all fail: "Couldn't read" (design.md 101).
- Today's provider is an external vision model; tomorrow an internal GPU model (`Extraction interface/brief.md` 13). Measured on 42 bills: totals right 97-100%, the full set about 80% (PRODUCT 37).
- Both feed one contract (`RawExtraction`, frozen) and one store: provider and Claude Code Readings fold together (ADR 0006 line 5; design.md 96, 107). Claude Code may arrive before, after or instead of the provider (C 29). Provider Readings never wait on Claude Code, and `documents_to_read` lists documents still unread, including those the provider left "couldn't read" (C 42; design.md 167 `have: [extractor]`).
- A provider-only bill and a Claude Code bill use the same review screen; the difference is which Readings stand behind each value.

## 4. Surfaces: existing or planned

- **Phone share capture** (W1): share a payment confirmation to the uploader; the only required step (FUNC 124-128; PRODUCT 15). Phone is for capture and quick answers (PRODUCT 40).
- **Needs-description nudge** by Web Push: "logged. What was it for?" with Add details and Later; ignorable (`intake` 144-157; `reminders` spec 87-100). Nothing may depend on a notification being seen (`reminders` 88). Push covers only that nudge and the daily nudge; none exists for Claude Code.
- **Attention list**: typed items, one next action each (FUNC 264-278; design.md 213 Reminders). Includes "Couldn't read this payment" and "Check match".
- **Inbox**: the paperless `inbox` tag and dashboard "oldest first, empty means nothing to do" (FUNC 209). Claimants get no paperless views; "Dues is their only screen" (FUNC 204). A Dues Inbox screen is not specified.
- **Review screen R** (approved 21 Nov 2026): page left, rail right; "Confirm bill - amount" is one key on a clean bill; stops only where doubt is real; phone single column; end screen "All bills reviewed", ready-to-claim count, inert "Build a Claim" (Bill review UX `design.md` 61-65, 164, 696-704). Screen states include "Still reading" and "Couldn't read" (same file 158-159). Prototype: `prototypes/bill-review/index.html?variant=R`.
- **Claim builder** (W7): `ready` Bills selected by default, inline "what for", form, package (FUNC 182-186). No screen design yet.
- **Settings**: external-reading consent (`identity-access` 105-114); notification preference (FUNC 71). Nothing yet for connecting Claude Code.
- **Plugin install and the Claude Code terminal** live outside Dues: Design C's install line and closing summary ("7 read, 5 agree with the server, 2 need a look") are proposals only (C 38).

## 5. Open questions (spec is silent or conflicting)

Connect and setup
1. Where does a Claimant learn about and start the connection: a Settings entry, an empty-state in the Inbox, or inside the review screen? The spec has no Dues-side screen for it.
2. What does the Claimant see in Dues to know they are connected, which plugin or client, and since when?
3. What does the first sign-in consent screen say, and does it state that their bills go to Anthropic (C 67)? Is that separate from the external-reading opt-in?
4. Does the plugin install (`claude plugin install`, C 38) get guided in Dues, or only documented?
5. How does a Claimant without a subscription or without Claude Code (or one who never connects) experience this? Is the feature simply absent, or shown as optional?

Trigger and timing
6. Who triggers a run? Spec: only the Claimant typing "file my pending bills" (`intake` 200-202). Does Dues nudge them to run it (a pending count, a push, an attention item)?
7. At which lifecycle point does it run: only on documents already `inbox`-tagged or logged, or also on local files via `upload_url`? Before or after the provider has read?
8. Is it per document, per batch, or standing? Is there a "re-read this bill with my Claude Code" action on screen R for one doubtful field?
9. Does it also read payment confirmations (W1), or only bills? `RawExtraction` has `kind` (C 12), but the Claude Code scenarios talk only of bills.

What the Claimant sees
10. While it runs, what does Dues show? Screen R has "Still reading" with skeleton bars and a usable total (Bill review UX `design.md` 158); is that the same, or does it name the reader?
11. When it finishes, where do the results appear: the same review queue, a banner, a push? Spec says only "the Claimant confirms the proposals in Dues" (`intake` 202) and `submit_extraction` returns a `reviewUrl` (design.md 167).
12. How is "two readers agree" or "two readers differ" shown without a score, a percentage, or "AI" (PRODUCT 56)? The Claimant-facing words for Claude Code as a reader are unwritten, and so is whether "Claude Code" may be named in UI copy.
13. Does a value read by their own Claude Code carry a mark on screen R (like "placed by you"), or is the reader invisible?
14. Does a clean, both-readers-agree bill still take the one-key confirm, or may the flow skip stops further? (The spec forbids silent change: AGENTS 22.)

Conflicts and trust
15. When their Claude Code and a provider disagree, how does screen R show two values? Screen R has candidates for `check` (Bill review UX `design.md` 108-116), but that model was designed around one Reading.
16. Late Reading after confirmation: only history (`intake` 185-187). Is the Claimant told, or is it invisible?
17. Handwritten bills: Claude Code can never auto-accept them. Does the Claimant see why, in words?
18. The model name is self-declared: is it shown to the Claimant, or only in audit?

Access, audit, failure
19. How does a Claimant revoke the connection? Revoked PATs are rejected (assistant-api spec 10-12), but OAuth revocation for MCP is not specced, nor session list or expiry.
20. How does a Claimant see what it did? Audit entries exist for confirms and edits (ADR 0009 line 14), and Readings store actor and time (design.md 107); a Claimant-facing history of Claude Code submissions is not specced.
21. Failure modes: subscription lapsed, usage limit hit, run abandoned halfway, image too large for MCP results (tasks 125), Zitadel token expired. What does Dues show and what does the skill say? Spec only covers provider `refused` (ADR 0006 line 23).
22. Does the Claimant's machine need to stay awake? Is there any queue visibility ("12 waiting for Claude Code")?

Spec conflicts to resolve before design
23. FUNC 283 and the assistant-api spec say Claude helpers are "maintainer only", with a personal access token. W1 step 3 (FUNC 128), `intake` 197-198, design.md 171 and tasks 124-125 give MCP to every Claimant. Design C reconciles it: the Assistant API stays maintainer-only; MCP is for every Claimant and exposes extraction only (C 34). Confirm.
24. ADR 0003 line 3 and FUNC 12 say Claude is for browser jobs and the maintainer's convenience, and "nothing in the core path depends on it". The new flow puts Claude Code beside the core path (reading). The guarantee holds only if it stays optional; ADR 0003 may need a note.
25. ADR 0003 line 9 refers to `mockup/DESIGN.md`, which is stale.

## 6. Constraints

**Privacy.**
- Bills go only to approved providers. External ones need the Claimant's opt-in, default off, audited (`intake` 159-164; `identity-access` 105-114).
- The Claimant's own Claude Code is a different case: their own machine, their own subscription, their own choice (ADR 0006 line 22; Design A 66). Dues serves only the owner their own files, through an owner-checked proxy (design.md 227).
- Dues never hands out an unscoped paperless link (design.md 227). No Claimant data in the Extractor contract (design.md 100).
- Foreign documents are "not found", never "forbidden" (assistant-api spec 6-8; `intake` 204-206).

**Public repo hygiene** (AGENTS 33-40). This repo is public. Hosts, IPs and domains appear only as placeholders (`<APP_HOST>`, `dues.example.org`). Example data is fictional: invented shops, bill numbers, amounts. People by role (Claimant, Approver, the maintainer), never by name. Real bills live in `private/` only. Any sample for this flow must be fictional.

**Voice** (PRODUCT 55-56; DESIGN 330-344). Plain, short, sentence case; states facts. Never "confidence", "AI", "verified" or a percentage. Glossary terms exact: Claimant, Expense, Bill, Reading, Claim, Reference (GLOSSARY; PRODUCT 45). Do not say User, Receipt, Batch.

**Accessibility and standing design rules** (PRODUCT 68-78; DESIGN 330-352).
- WCAG 2.2 AA assumed; every flow works from the keyboard alone, one recorded exception (marking a region, ADR 0008 lines 3, 13-14).
- State is never carried by colour alone: a glyph plus two or three words.
- Touch targets at least 44px; `prefers-reduced-motion` honoured; light and dark both first-class.
- Absence shown as absence; no guessed boxes; one focus ring.
- No green, no second accent (DESIGN 343-352, the Don't list).
- Finished work recedes; attention goes to what is open (PRODUCT 74). One glance, one key (PRODUCT 71).
- Suggest, then confirm: nothing about money changes silently (AGENTS 22; PRODUCT 47). Confirmations are undoable until the Bill is on a submitted Claim (ADR 0009).
- UI work goes through the designer at decision points; every visual choice is shown side by side to the owner before it is built (AGENTS 29).
