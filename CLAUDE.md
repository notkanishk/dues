Read [`AGENTS.md`](AGENTS.md) first; it holds every rule for this repo.

Claude Code specifics:
- Planning runs through OpenSpec (`openspec/`); start a change with `openspec` before writing code for it.
- Infrastructure changes (Zitadel, NAS, Caddy, firewall, Proxmox) are made one at a time, each with the maintainer's explicit OK and a config backup first.
