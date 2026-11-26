#!/usr/bin/env bash
# Install and register a GitHub Actions self-hosted runner as the unprivileged `runner` user.
# Run as root after bootstrap.sh. The one-hour registration token arrives on stdin, never as an argument:
#   gh api -X POST repos/<owner>/<repo>/actions/runners/registration-token --jq .token \
#     | ssh root@<host> 'bash runner.sh <owner>/<repo> <version> <sha256>'
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "run as root" >&2; exit 1; }
REPO="${1:?owner/repo}"; VER="${2:?runner version, e.g. 2.338.2}"; SHA="${3:?sha256 of the linux-x64 tarball}"
source /etc/dues/host.env
NAME="dues-${DUES_ENV}"
DIR=/home/runner/actions-runner
read -r TOKEN
[[ -n "$TOKEN" ]] || { echo "no registration token on stdin" >&2; exit 1; }

if [[ ! -x "$DIR/config.sh" ]]; then
  tgz="actions-runner-linux-x64-${VER}.tar.gz"
  tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
  curl -fsSL -o "$tmp/$tgz" "https://github.com/actions/runner/releases/download/v${VER}/${tgz}"
  echo "${SHA}  $tmp/$tgz" | sha256sum -c -
  install -d -o runner -g runner -m 0750 "$DIR"
  tar -xzf "$tmp/$tgz" -C "$DIR" && chown -R runner:runner "$DIR"
  "$DIR/bin/installdependencies.sh" >/dev/null
fi

if [[ ! -f "$DIR/.runner" ]]; then
  # Default labels (self-hosted, Linux, X64) plus the environment label workflows target.
  sudo -u runner "$DIR/config.sh" --unattended --url "https://github.com/${REPO}" --token "$TOKEN" \
    --name "$NAME" --labels "$NAME" --work _work --replace
fi
unset TOKEN

cd "$DIR"
[[ -f .service ]] || ./svc.sh install runner >/dev/null
./svc.sh start >/dev/null || true
./svc.sh status | grep -E "Active:" || true
