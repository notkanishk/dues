---
status: proposed (blocked until the NAS has snapshots, an off-site backup and healthy disks; app launches on paperless local disk until then)
---

# Documents live on a dedicated TrueNAS dataset over NFS, reachable only by the app hosts

All Claimants' documents (paperless originals/archive and generated claim forms) live in one dedicated dataset on the NAS (`nas.example.org`), exported over NFS only to the Proxmox host that runs the paperless and tracker LXCs, mapped to a single service UID (no maproot root), and bind-mounted into those LXCs. Per-Claimant visibility is enforced by the app, not by file permissions. We chose this over SMB because the consumers are Linux containers, not people, and over the existing general SMB share / per-user home folders (Syndra's NAS add-on model) because documents of one Claimant must never be browsable by others from a client machine.

## Considered Options

- **SMB with a dedicated service account**: workable, but adds a credential to manage inside containers for no benefit over a host-restricted NFS export.
- **Per-Claimant SMB home folders**: rejected; mounts on client machines bypass the app's access rules and the audit log.
- **Keep documents on paperless's local disk (local-zfs)**: rejected long term (small rootfs, single host), but this is the fallback until the NAS is safe.

## Consequences

- Blocked until the NAS has periodic snapshots, an off-site backup and healthy disks. Until then documents stay on local disk with their own backup.
- Creating the dataset and export is a write to TrueNAS and needs the maintainer's explicit OK.
- The maintainer's Mac folder (ADR 0002) is never an NFS/SMB mount; Claude keeps it in sync through the app and paperless APIs.
