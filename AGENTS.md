# Dues — agent orientation

Dues tracks money makerspace members spend for the lab, from payment to university reimbursement, for every Claimant. It is spec-first: no code exists yet that the spec does not describe.

## Read before you write

| Question | Where |
|---|---|
| What do the words mean? | [`GLOSSARY.md`](GLOSSARY.md): Expense, Bill, Claim, Open amount, Payback… Use these terms exactly, in code too. |
| What must it do? | [`docs/spec/FUNCTIONAL.md`](docs/spec/FUNCTIONAL.md): entities, state machines, workflows W1–W9, reminders |
| Why is it built this way? | [`docs/adr/`](docs/adr/) |
| What was researched or tried? | [`docs/research/`](docs/research/); throwaway prototypes on branch `prototype/explorations` |

**The spec is authoritative over the code.** Where they disagree, say so; that is a bug in one of them.

## Working rules

- **Skills first.** Every task runs through the matching `mattpocock-skills` skill: `grilling` for open decisions, `domain-modeling` when a term or ADR changes, `tdd` for any behaviour, `prototype` for throwaway questions, `research` for facts, `code-review` before merge, `writing-for-agents` for this file.
- **Glossary live.** A term resolved in conversation goes into `GLOSSARY.md` at once; implementation detail stays out of it.
- **Test-first.** A behaviour change starts with a failing test; money paths and state transitions always have one.
- **Money is integer paise.** Moments are UTC `timestamptz`; business dates are plain `date`; display uses the Claimant's IANA zone (FUNCTIONAL §10).
- **Suggest, then confirm.** The app proposes matches and merges; a person confirms. Nothing about money changes silently.
- **Prototypes live off `main`.** Throwaway code is committed to a `prototype/<topic>` branch; `main` keeps only the validated decision and a pointer to that branch.
- **Subagents name their model**, by the kind of work:
  - **haiku**: finding, listing, locating, mapping, gathering facts.
  - **sonnet**: building from a precise brief, research, audits that need judgement, tests, UI wiring, fixes.
  - **opus**: code review before merge; hard or sensitive coding (auth, access control, money paths, migrations, concurrency, anything touching production).
  - **fable**: thinking, deciding and designing only: architecture (including sensitive architecture: auth model, money model, data ownership, security boundaries), trade-offs, design answers. Fable sends scouting to haiku or sonnet with a narrow brief and a compact answer format, and keeps the conclusions.
- **Briefs for parallel helpers.** Several helpers on one job share a brief at `.claude/briefs/<job>.md`: hard rules, what to read first (absolute paths), setup (own git worktree at a named commit), how to work, the commit trailer for their model. Each prompt then names only that helper's items.
- **Verify, then fix, then review.** Findings are checked against the code (read-only) before anyone fixes them; fixes land in small commits; opus reviews the branch before it merges.

## Public repo hygiene

This repository is public. Real claims, invoices and infrastructure live in `private/` (gitignored) and never leave it.

- Hosts, IPs, domains, container IDs and security posture appear only as placeholders (`<APP_HOST>`, `dues.example.org`); the real mapping is `private/DEPLOY.local.md`.
- Example data is fictional: invented shops, bill numbers and amounts.
- People appear by role (Claimant, Approver, the maintainer), never by name, email or employee code.
- Before every commit, scan the staged diff for the above.
