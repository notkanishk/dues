#!/usr/bin/env bash
# Dues host baseline for a Debian 13 Docker LXC (community-scripts "Docker" CT).
# Idempotent: safe to re-run. Run as root on the host:  bash bootstrap.sh
# Host-specific values come from /etc/dues/host.env (never committed):
#   DUES_ENV=dev|prod
#   DNS_SERVER=<resolver IP>                 runner may reach only this LAN address (DNS)
#   APP_PORT=3000
#   APP_ALLOW="<ip or cidr>, ..."            who may reach the app port (the internal proxy, or whole LAN ranges)
#   BLOCK_HOSTS="<ip>"                       optional: nothing on this host may reach these (dev: real paperless)
#   IMAGE_REPO=ghcr.io/<owner>/<repo>        the only image dues-deploy accepts
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "run as root" >&2; exit 1; }
# shellcheck disable=SC1091
source /etc/dues/host.env
: "${DUES_ENV:?}" "${DNS_SERVER:?}" "${APP_PORT:?}" "${APP_ALLOW:?}" "${IMAGE_REPO:?}"
BLOCK_HOSTS="${BLOCK_HOSTS:-}"
log() { printf '\n== %s\n' "$*"; }

log "packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get -yq full-upgrade
apt-get -yq install --no-install-recommends unattended-upgrades nftables sudo curl jq ca-certificates

log "time: UTC (people see local time in the app, not on hosts)"
timedatectl set-timezone Etc/UTC

log "security updates, unattended"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF

log "ssh: keys only"
# Refuse to lock ourselves out: root must already have a key.
[[ -s /root/.ssh/authorized_keys ]] || { echo "no root authorized_keys; not touching sshd" >&2; exit 1; }
cat > /etc/ssh/sshd_config.d/10-dues.conf <<'EOF'
# Dues host policy. Drop-ins load before sshd_config's own lines, so these win.
PermitRootLogin prohibit-password
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitEmptyPasswords no
X11Forwarding no
EOF
sshd -t
systemctl reload ssh

log "deploy user and directory"
id -u runner >/dev/null 2>&1 || useradd --system --create-home --home-dir /home/runner --shell /bin/bash runner
passwd -l runner >/dev/null
# runner is deliberately NOT in the docker group (that group is root-equivalent).
install -d -o root -g root -m 0750 /opt/dues

log "dues-deploy: the one root action CI may take"
cat > /usr/local/sbin/dues-deploy <<'EOF'
#!/usr/bin/env bash
# Usage: dues-deploy <image@sha256:digest> | --check
# Pins the image by digest and (re)starts the stack in /opt/dues. Called by CI via sudo.
set -euo pipefail
source /etc/dues/host.env
cd /opt/dues
if [[ "${1:-}" == "--check" ]]; then echo "ok: $(hostname) ${DUES_ENV}"; exit 0; fi
ref="${1:-}"
[[ "$ref" =~ ^${IMAGE_REPO//./\\.}@sha256:[a-f0-9]{64}$ ]] || { echo "refused: image must be ${IMAGE_REPO}@sha256:<digest>" >&2; exit 2; }
[[ -f compose.yaml ]] || { echo "no /opt/dues/compose.yaml yet" >&2; exit 3; }
printf 'DUES_IMAGE=%s\n' "$ref" > .image.env.next
logger -t dues-deploy "deploying $ref"
# Pull while the old stack still serves: a registry outage fails here with nothing stopped.
docker compose --env-file .image.env.next pull --quiet
# A database copy before anything changes, every deploy; the last 14 are kept.
# Restore: docker compose exec -T postgres pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean < <file>
if docker compose --env-file .image.env.next ps --status running --services | grep -qx postgres; then
  install -d -o root -g root -m 0700 /var/backups/dues
  digest="${ref##*:}"
  f="/var/backups/dues/pre-deploy-$(date -u +%Y%m%dT%H%M%SZ)-${digest:0:12}.dump"
  docker compose --env-file .image.env.next exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > "$f"
  [[ -s "$f" ]] || { rm -f "$f"; echo "backup empty; not deploying" >&2; exit 4; }
  chmod 0600 "$f"
  logger -t dues-deploy "backup $f ($(du -h "$f" | cut -f1))"
  ls -1t /var/backups/dues/pre-deploy-*.dump | tail -n +15 | xargs -r rm -f
fi
mv .image.env.next .image.env
docker compose --env-file .image.env up -d --remove-orphans --wait
docker image prune -f >/dev/null
logger -t dues-deploy "deployed $ref"
EOF
chmod 0755 /usr/local/sbin/dues-deploy
cat > /etc/sudoers.d/dues-deploy <<'EOF'
runner ALL=(root) NOPASSWD: /usr/local/sbin/dues-deploy
EOF
chmod 0440 /etc/sudoers.d/dues-deploy
visudo -cf /etc/sudoers.d/dues-deploy

log "firewall (own table; never flushes Docker's rules)"
block_rules=""
if [[ -n "$BLOCK_HOSTS" ]]; then
  block_rules="ip daddr { ${BLOCK_HOSTS} } drop"
fi
cat > /etc/nftables.conf <<EOF
#!/usr/sbin/nft -f
# Dues host firewall. No "flush ruleset": Docker keeps its own iptables-nft tables.
table inet dues
delete table inet dues
table inet dues {
  set lan4 { type ipv4_addr; flags interval; elements = { 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 100.64.0.0/10, 169.254.0.0/16 } }
  set app_allow { type ipv4_addr; flags interval; elements = { ${APP_ALLOW} } }

  # App port: only the proxy (and listed peers). Covers Docker-published ports (DNAT, forward) and host ports (input).
  chain input {
    type filter hook input priority filter - 10; policy accept;
    iif "lo" accept
    tcp dport ${APP_PORT} ip saddr != @app_allow drop
    meta nfproto ipv6 tcp dport ${APP_PORT} drop
  }
  chain forward {
    type filter hook forward priority filter - 10; policy accept;
    ct status dnat ct original proto-dst ${APP_PORT} ip saddr != @app_allow drop
    meta nfproto ipv6 ct status dnat ct original proto-dst ${APP_PORT} drop
    ${block_rules}
  }
  # CI runner may reach the internet (GitHub) and DNS, never the LAN. Limits a hostile job's reach.
  chain output {
    type filter hook output priority filter - 10; policy accept;
    ${block_rules}
    meta skuid "runner" ip daddr ${DNS_SERVER} meta l4proto { tcp, udp } th dport 53 accept
    meta skuid "runner" ip daddr @lan4 drop
    meta skuid "runner" ip6 daddr { fc00::/7, fe80::/10 } drop
  }
}
EOF
nft -c -f /etc/nftables.conf
nft -f /etc/nftables.conf
nft list table inet filter >/dev/null 2>&1 && nft delete table inet filter   # the empty accept-all table from the default config
systemctl enable --now nftables >/dev/null

log "done: $(hostname) ${DUES_ENV}"
