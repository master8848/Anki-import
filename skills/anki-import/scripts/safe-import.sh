#!/usr/bin/env bash
# safe-import.sh — the canonical five-loop import for agent workflows.
#
#   1. validate (offline)
#   2. dry-run import (touches AnkiConnect, no mutation)
#   3. (optional) checkpoint pre-existing notes for rollback
#   4. import
#   5. report
#
# Usage:
#   ./safe-import.sh ./cards.xml
#   ./safe-import.sh ./cards.xml --batch-id nightly --rollback-on-partial
#   ./safe-import.sh ./cards.xml --rollback-on-partial
#   JSON=1 ./safe-import.sh ./cards.xml   # force JSON envelope parsing
#
# Exits:
#   0  success
#   1  validation or dry-run failed (fix the file and retry)
#   2  fatal (file missing, anki-xml not on PATH, etc.)
#   3  rollback triggered (only when --rollback-on-partial is set)

set -euo pipefail

file="${1:-}"
if [ -z "$file" ] || [ ! -f "$file" ]; then
  echo "safe-import: missing file argument or file not found: $file" >&2
  exit 2
fi
shift || true

if ! command -v anki-xml >/dev/null 2>&1; then
  echo "safe-import: anki-xml not on PATH. Install with: npm i -g anki-xml" >&2
  exit 2
fi

run() {
  # In JSON mode, envelope goes to stdout; in human mode, to stdout too.
  anki-xml "$@"
}

json="${JSON:-}"

# 1. Validate offline.
if [ -n "$json" ]; then
  if ! run validate "$file" --json --quiet; then
    echo "safe-import: validation failed" >&2
    exit 1
  fi
else
  if ! run validate "$file" --quiet; then
    echo "safe-import: validation failed" >&2
    exit 1
  fi
fi

# 2. Dry-run against AnkiConnect.
if [ -n "$json" ]; then
  if ! run import "$file" --dry-run --json --quiet; then
    echo "safe-import: dry-run failed (duplicates, schema drift, or unreachable Anki)" >&2
    exit 1
  fi
else
  if ! run import "$file" --dry-run --quiet; then
    echo "safe-import: dry-run failed (duplicates, schema drift, or unreachable Anki)" >&2
    exit 1
  fi
fi

# 3 + 4. Commit.
set +e
run import "$file" "$@" $([ -n "$json" ] && echo --json --quiet)
rc=$?
set -e

if [ $rc -eq 0 ]; then
  exit 0
fi

# If --rollback-on-partial was set, anki-xml exits 1 and the envelope's
# error.code is "BATCH_ROLLED_BACK". Surface that distinction to the agent.
if printf '%s' " $* " | grep -q -- '--rollback-on-partial'; then
  echo "safe-import: batch was rolled back; nothing was written" >&2
  exit 3
fi

echo "safe-import: import failed (exit $rc)" >&2
exit $rc
