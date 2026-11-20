#!/bin/sh
# PROTOTYPE, throwaway
set -e
cd "$(dirname "$0")"
(cd ts && bun run run.ts)
(cd py && uv run python run.py)
(cd ts && bun run run.ts --parse-only)
uv run --project py python score.py
