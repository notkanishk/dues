#!/usr/bin/env bash
# Seam (b): the production compose file comes up healthy and /api/health answers.
# Builds the image, runs deploy/compose.yaml the way dues-deploy does (own project name, throwaway .env),
# checks 200, stops Postgres and checks 503, then removes the containers, networks and volume.
# Works against any DOCKER_HOST. The web port is published on 127.0.0.1:$SMOKE_PORT; with a remote
# DOCKER_HOST, forward that port first (ssh -L) so HEALTH_URL reaches it.
set -euo pipefail
cd "$(dirname "$0")/.."
PROJECT="${SMOKE_PROJECT:-dues-scratch-smoke}"
IMAGE="${SMOKE_IMAGE:-dues-scratch-app:smoke}"
PORT="${SMOKE_PORT:-53000}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:${PORT}/api/health}"

dir=$(mktemp -d -t dues-smoke)
cp deploy/compose.yaml "$dir/compose.yaml"
pw=$(openssl rand -hex 16)
cat > "$dir/.env" <<ENV
POSTGRES_USER=dues
POSTGRES_PASSWORD=$pw
POSTGRES_DB=dues
DATABASE_URL=postgres://dues:$pw@postgres:5432/dues
ENV
printf 'DUES_IMAGE=%s\n' "$IMAGE" > "$dir/.image.env"
cat > "$dir/compose.override.yaml" <<YAML
services:
  web:
    ports: !override
      - "127.0.0.1:${PORT}:3000"
YAML
dc() { docker compose -p "$PROJECT" --project-directory "$dir" -f "$dir/compose.yaml" -f "$dir/compose.override.yaml" --env-file "$dir/.image.env" "$@"; }
cleanup() { dc down -v --remove-orphans >/dev/null 2>&1 || true; rm -r -- "${dir:?}"; }
trap cleanup EXIT

[[ "${SMOKE_SKIP_BUILD:-}" == 1 ]] || docker build -q -t "$IMAGE" . >/dev/null
dc up -d --wait --wait-timeout 180
dc ps --format '{{.Service}} {{.Health}}'

code() { curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$HEALTH_URL" || true; }
got=$(code); [[ "$got" == 200 ]] || { echo "FAIL: health $got, want 200" >&2; dc logs --tail 30 >&2; exit 1; }
echo "ok: health 200 with the stack up"

dc stop postgres >/dev/null
got=$(code); [[ "$got" == 503 ]] || { echo "FAIL: health $got with Postgres stopped, want 503" >&2; exit 1; }
echo "ok: health 503 with Postgres stopped"
