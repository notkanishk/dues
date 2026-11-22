# Claude Code checks: behaviour decisions (owner, 21–22 Nov 2026)

Grilled in three rounds by the designer; the owner answered each round. Visuals are not decided here; they go to the owner as side-by-side options. Context and cites: `brief.md`.

## Round 1

1. **MCP is the only door.** No token-based Assistant API, maintainer included (owner: "no token based use. only mcp. later we can have claude code run on the lxc itself as well"). Claude Code running on the server as a reader is a later branch.
2. **When it runs.** The Claimant starts it in a sit-down session, any time between a Bill being logged and confirmed. The provider still reads on arrival. Never a gate: review works without it.
3. **A second Reading only adds care.** Readings that differ make the field a stop showing both values (R's numbered candidates). Agreement removes no stop and never confirms. Where the provider could not read, Claude Code's Reading fills the values like any single Reading.
4. **Only the Claimant starts a run, in Claude Code.** Dues sends no push, adds no attention item, has no button. Owner: "this needs to be as frictionless as possible for the end user". The one mention: on a "Couldn't read" bill, for a connected Claimant, one line with the sentence to type.
5. **First version: Bills already in Dues**, as a batch of everything unread. No upload from the terminal, no payment confirmations, no single-bill re-read.
6. **Settings is the one home** for the connection. Nothing about Claude Code shows elsewhere at rest.
7. **Own consent, in plain words**, apart from the external-reading opt-in: Claude Code sends the pages of your bills to Anthropic under your own account; it can read your unconfirmed bills and propose values; it cannot confirm a bill, or build or send a Claim; disconnect any time in Settings. Zitadel has no per-application consent screen, so Dues shows its own page around the sign-in redirect.

## Round 2

1. **MCP reads only, for everyone**, maintainer included. The Assistant API spec and its maintainer helpers (back-fill, sync) are withdrawn; they return later as their own decision with their own consent words.
2. **Connect and first run are one move: copy, paste, Allow.** Settings shows one line; pasting it installs the plugin (remote MCP server plus a skill) and starts the first reading; the browser opens on Dues' consent page (after sign-in if needed); Allow; the terminal carries on. That computer is not asked again until Disconnect. Shape of the line: `claude plugin install <plugin> --marketplace <repo> -y && claude "read my bills"`. A pre-registered client ID or a Client ID Metadata Document is used, so Zitadel's dynamic registration stays closed. Unverified: whether the browser opens by itself on the first tool call; if not, the skill prints one sign-in link.
3. **The one sentence is "read my bills".** It replaces "file my pending bills" (nothing is filed). Near wordings still work; there is no second command.
4. **A run reads only Bills the Claimant has not confirmed.** Confirmed Bills are never re-read; Undo confirm puts one back. A Reading that lands after confirmation (a mid-run race) is silent history, as specced.
5. **A run ends with one plain line and one link**, printed, never auto-opened. It reports only what needs care. The link opens review R on the first Bill in review, in the queue's own order, covering the whole queue; sign-in returns to the same Bill. Lines:
   - "7 bills read. 2 have values to check. Review: <link>"
   - "No new bills to read. 3 are waiting for your review: <link>"
   - "No bills to read. Nothing for you to do."
   - "6 of 7 read. 1 couldn't be read; type its values in review: <link>"
6. **Dues never shows "in progress".** Each Reading lands on its Bill; Settings shows the last read with date and count. A Bill open on screen never changes under the hand; if a differing Reading arrives for it, one line says so and the field becomes a stop before it can be confirmed. Re-running resumes, since repeats are safe.
7. **The reader is named only when Readings differ.** Each candidate on a differing stop says who read it ("your Claude Code"). A value both agree on carries no mark. The model name stays in the audit log. "Claude Code" otherwise appears only in Settings and on the consent page.

## Round 3

1. **One connection per Claimant.** Settings shows connected since and the last read (date, count). One Disconnect ends it on every computer at once, server side: Dues records a cut-off time and its MCP server refuses tokens issued before it (`claude mcp remove` alone does not revoke). Readings already made stay. No run log for the Claimant; the audit log holds it. After Disconnect: "Disconnected. Your Claude Code can no longer read your bills. Readings it already made stay."
2. **Consent page: "Allow" and "Don't allow".** After Allow: "Connected. Go back to your terminal." After Don't allow: "Not connected. Nothing was shared. Nothing for you to do." Terminal: "Dues wasn't connected. Nothing was read. Say 'read my bills' to try again."
3. **Only total, date, bill number and GSTIN stop when Readings differ**, compared after Dues' conversion (money as money, dates as dates, bill numbers ignoring spaces and case). Vendor and description never stop on a difference: the value found on the page is shown, the other is kept on record (Readings and audit log; there is no Claimant-facing history view).
4. **Differing total: choice 1 is the value that equals the Payment or is found on the page.** If both or neither has that evidence, there is no default: Enter chooses nothing, the line reads "Choose 1 or 2", and the Claimant presses 1 or 2 or types. Date and bill number keep R's ordering. (Adds a no-default case to approved R.)
5. **"Two readings agree"** shows only on a total that already stops, on a printed bill, when the two readers are of different model families. Never on a date, bill number, handwritten bill, or a field that does not stop. Handwritten bills need no new "why" line.
6. **A failed run shows nothing in Dues.** The terminal says what happened, what was kept and the next step:
   - "Dues isn't connected on this computer. Nothing was read. Connect: <link>"
   - "Couldn't reach Dues. Nothing was changed. Try again in a while."
   - "This Dues plugin is out of date. Nothing was read. Update it: <line>"
   A run cut short by Claude Code itself (usage limit, closed window) gets Claude Code's own message. What was read is always kept.
7. **Phone:** review treats a differing stop exactly as on a laptop, in one column. Settings shows status and Disconnect; not connected shows "Connect from your computer." with no line to copy.

## Still open

- Claude Code on the server (LXC) as a reader (owner's later branch).
- A copy pass over every line above.
- The Claim builder screen (separate flow).
- Visuals, next: Settings connection (not connected, connected, just disconnected, phone); consent page (question, after Allow, after Don't allow); review R differing-values stop (reader named, with and without default, "Two readings agree", Reading arrives while open); review R "Couldn't read" line for a connected Claimant. Terminal lines shown as a copy sheet.
