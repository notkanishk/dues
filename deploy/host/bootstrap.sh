#!/usr/bin/env bash
# Dues host baseline for a Debian 13 Docker LXC (community-scripts "Docker" CT).
# Idempotent: safe to re-run. Run as root on the host:  bash bootstrap.sh
# Host-specific values come from /etc/dues/host.env (never committed):
#   DUES_ENV=dev|prod
#   DNS_SERVER=<resolver IP>                 runner may reach only this LAN address (DNS)
#   APP_PORT=3000
#   APP_ALLOW="<ip or cidr>, ..."            who may reach the app port (the internal proxy, or whole LAN ranges)
#   BLOCK_HOSTS="<ip>"                       optional: nothing on this host may reach these (dev: real paperless)
#   REPO_URL=https://github.com/<owner>/<repo>.git   the only source dues-deploy builds (commits on main only)
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "run as root" >&2; exit 1; }
# shellcheck disable=SC1091
source /etc/dues/host.env
: "${DUES_ENV:?}" "${DNS_SERVER:?}" "${APP_PORT:?}" "${APP_ALLOW:?}" "${REPO_URL:?}"
BLOCK_HOSTS="${BLOCK_HOSTS:-}"
log() { printf '\n== %s\n' "$*"; }

log "packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get -yq full-upgrade
apt-get -yq install --no-install-recommends unattended-upgrades nftables sudo curl jq ca-certificates git

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
# Usage: dues-deploy <40-hex commit on main> | --check
# Builds that exact commit on this host and (re)starts the stack in /opt/dues. Called by CI via sudo.
# Runs as root; the CI runner only ever passes a commit id.
set -euo pipefail
source /etc/dues/host.env
cd /opt/dues
if [[ "${1:-}" == "--check" ]]; then echo "ok: $(hostname) ${DUES_ENV}"; exit 0; fi
sha="${1:-}"
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo "refused: give a full 40-character commit id" >&2; exit 2; }
exec 9>/run/dues-deploy.lock; flock -n 9 || { echo "another deploy is running" >&2; exit 5; }
short="${sha:0:12}"; image="dues:${short}"
logger -t dues-deploy "deploying ${sha}"

# 1. Exactly that commit, and only if it is on main.
[[ -d src/.git ]] || git clone --quiet --no-checkout "$REPO_URL" src
git -C src remote set-url origin "$REPO_URL"
git -C src fetch --quiet --prune origin '+refs/heads/main:refs/remotes/origin/main'
git -C src merge-base --is-ancestor "$sha" origin/main 2>/dev/null || { echo "refused: ${sha} is not on main" >&2; exit 2; }
git -C src checkout --quiet --force --detach "$sha"
[[ "$(git -C src rev-parse HEAD)" == "$sha" ]] || { echo "checkout mismatch" >&2; exit 3; }

# 2. Build and pull while the old stack still serves: a failure here stops nothing.
docker image inspect "$image" >/dev/null 2>&1 || docker build --quiet -t "$image" src >/dev/null
install -o root -g root -m 0640 src/deploy/compose.yaml compose.yaml.next
printf 'DUES_IMAGE=%s\n' "$image" > .image.env.next
for img in $(docker compose -f compose.yaml.next --env-file .image.env.next config --images | grep -v '^dues:'); do
  docker pull --quiet "$img" >/dev/null
done

# 3. A database copy before anything changes, every deploy; the last 14 are kept.
if [[ -f compose.yaml ]] && docker compose --env-file .image.env ps --status running --services 2>/dev/null | grep -qx postgres; then
  install -d -o root -g root -m 0700 /var/backups/dues
  f="/var/backups/dues/pre-deploy-$(date -u +%Y%m%dT%H%M%SZ)-${short}.dump"
  docker compose --env-file .image.env exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > "$f"
  [[ -s "$f" ]] || { rm -f "$f"; echo "backup empty; not deploying" >&2; exit 4; }
  chmod 0600 "$f"
  logger -t dues-deploy "backup $f ($(du -h "$f" | cut -f1))"
  ls -1t /var/backups/dues/pre-deploy-*.dump | tail -n +15 | xargs -r rm -f
fi

# 4. Switch, then prove it: every service healthy and /api/health 200 from this host.
#    If not, go straight back to the build that was running (schema changes are additive,
#    so the previous build runs on the new schema) and fail the deploy.
smoke() {
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    curl -fsS -o /dev/null --max-time 5 "http://127.0.0.1:${APP_PORT}/api/health" && return 0
    sleep 3
  done
  return 1
}
up() { docker compose --env-file .image.env up -d --remove-orphans --wait && smoke; }
[[ -f compose.yaml ]] && cp -p compose.yaml compose.yaml.prev
[[ -f .image.env ]] && cp -p .image.env .image.env.prev
mv compose.yaml.next compose.yaml
mv .image.env.next .image.env
if ! up; then
  logger -t dues-deploy "FAILED health after switching to ${sha}"
  docker compose --env-file .image.env ps >&2 || true
  docker compose --env-file .image.env logs --tail=60 web worker >&2 || true
  if [[ -f .image.env.prev ]] && ! cmp -s .image.env .image.env.prev; then
    mv compose.yaml.prev compose.yaml
    mv .image.env.prev .image.env
    if up; then logger -t dues-deploy "rolled back to $(cut -d= -f2 .image.env)"; echo "rolled back to $(cut -d= -f2 .image.env)" >&2
    else logger -t dues-deploy "ROLLBACK ALSO FAILED"; echo "rollback also failed" >&2; fi
  else
    echo "nothing older to roll back to" >&2
  fi
  exit 6
fi

# 5. Keep the five newest builds for quick rollback; cap the build cache.
docker image ls --format '{{.CreatedAt}}\t{{.Repository}}:{{.Tag}}' dues | sort -r | tail -n +6 | cut -f2 | xargs -r docker image rm >/dev/null 2>&1 || true
docker image prune -f >/dev/null
docker builder prune -f --keep-storage 4GB >/dev/null
logger -t dues-deploy "deployed ${sha}"
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
    ct status dnat ct original proto-dst ${APP_PORT} ct original ip saddr != @app_allow drop   # original source: replies come from the container
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
