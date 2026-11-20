#!/bin/sh
# PROTOTYPE, throwaway: run the parsing experiment in Docker on the tracker LXC.
set -e
cd /opt/prototypes/parsing-experiment
echo "== build-ts $(date -u +%FT%TZ)"
docker build --progress=plain -t pe-ts ts > build-ts.log 2>&1
echo "== build-py $(date -u +%FT%TZ)"
docker build --progress=plain -t pe-py py > build-py.log 2>&1
docker image ls --format "{{.Repository}}:{{.Tag}} {{.Size}}" | grep pe-
TS="docker run --rm -v $PWD:/work -w /work/ts pe-ts sh -c"
echo "== ts $(date -u +%FT%TZ)"
$TS "ln -sfn /deps/node_modules node_modules && bun --version && bun run run.ts"
echo "== py $(date -u +%FT%TZ)"
docker run --rm -v $PWD:/work -w /work/py pe-py uv run --no-sync python run.py
echo "== ts-parse $(date -u +%FT%TZ)"
$TS "bun run run.ts --parse-only"
echo "== score $(date -u +%FT%TZ)"
docker run --rm -v $PWD:/work -w /work pe-py uv run --no-sync --project py python score.py
echo "== done $(date -u +%FT%TZ)"
