---
name: anki-import
description: Import, query, and update Anki flashcards via the anki-xml CLI against AnkiConnect. Use when the user asks to "add cards to Anki", "import flashcards", "bulk-create notes", "build a deck", "read my Anki collection", "update existing notes", "remove notes", "migrate notes to a new deck", "search my Anki", "snapshot before changes", "rollback Anki changes", or wants to write an XML file of notes and push it to a running Anki instance. Do NOT use for manual Anki editing, GUI workflows, or non-Anki flashcard systems.
metadata:
  author: master8848
  version: "0.1.0"
  argument-hint: <path-to-cards.xml> [--operation import|update|delete|query]
---

# anki-import

Drive an Anki collection from an agent loop using the `anki-xml` CLI
against [AnkiConnect](https://foosoft.net/projects/anki-connect/).
The CLI is batch-oriented, deterministic, idempotent, and recoverable —
the perfect shape for autonomous authoring.

## Pre-flight (always)

Before any mutation, run the doctor. If it fails, stop and surface the
fix to the user; do not silently retry.

```bash
anki-xml doctor
```

What `doctor` checks (and the fix for each):

| # | Check | Fix when it fails |
|---|---|---|
| 1 | AnkiConnect reachable | Start Anki; confirm AnkiConnect add-on is installed |
| 2 | AnkiConnect API version ≥ 5 | Update AnkiConnect |
| 3 | Collection has at least one deck | Create one in Anki, or use `--auto-create-deck` on import |
| 4 | Collection has at least one model | Install a model add-on, or use a built-in type |
| 5 | AnkiConnect can query add-ons | Update AnkiConnect (needs 2.1.55+) |
| 6 | MathJax add-on (`1610307553`) installed | `anki-xml addon install 1610307553`, or switch to `[latex]...[/latex]` |

If `anki-xml` is not on `$PATH`, decide per the user's environment:

```bash
# npm / npx (preferred — no install needed)
npx -y anki-xml doctor

# Build from source (requires Bun ≥ 1.3)
git clone https://github.com/master8848/Anki-import && cd Anki-import
bun install && bun run build:npm
node ./dist/cli.js doctor
```

## The five-loop pattern

Use this for any "create notes from generated content" task. It is
the documented agent workflow in `docs/ai-cookbook.md`.

```bash
# 1. Generate content (the agent's job) — write <anki> XML to a file.
# 2. Validate locally — no network, fastest feedback.
anki-xml validate ./cards.xml --json --quiet

# 3. Dry-run against AnkiConnect — confirms duplicates, schema drift.
anki-xml import ./cards.xml --dry-run --json --quiet

# 4. Snapshot the affected notes for rollback.
anki-xml checkpoint create pre-batch --ids "$IDS"

# 5. Commit.
anki-xml import ./cards.xml --json --quiet
```

A wrapper that does steps 2–5 with proper exit codes lives at
[`scripts/safe-import.sh`](scripts/safe-import.sh). Use it when the
content is already on disk.

## XML schema (one file = one batch)

Every file is a single `<anki>` element. Field tags differ by note
type. The full matrix is in [`references/xml-schema.md`](references/xml-schema.md).

Minimal example:

```xml
<anki deck="AI Import::Spanish">
  <note type="Basic" tags="greetings">
    <front>Hola</front>
    <back>Hello</back>
  </note>
</anki>
```

A larger example covering every built-in note type lives at
[`examples/all-note-types.xml`](examples/all-note-types.xml).

## The command surface (34 commands)

Full reference: [`references/commands.md`](references/commands.md). The
mental map by intent:

| Intent | Commands |
|---|---|
| Discover the schema | `models`, `fields`, `tags`, `decks` |
| Inspect existing notes | `search`, `note-info`, `sample`, `preview` |
| Validate before writing | `validate`, `plan`, `schema-validate`, `diff` |
| Mutate | `import`, `update`, `tag`, `untag`, `delete`, `rename-deck`, `delete-deck`, `move-notes`, `suspend`, `unsuspend`, `bury`, `sync` |
| Recover | `checkpoint`, `rollback`, `audit-log`, `--idempotency-key`, `--resume-from` |
| Lifecycle | `migrate`, `profile`, `addon`, `completion` |

## Global flags worth knowing

The `--json --quiet` pair is the default for agent loops: envelope
output, silent on success, exit code on failure.

| Flag | Meaning |
|---|---|
| `--url <url>` | AnkiConnect endpoint (default `http://127.0.0.1:8765`) |
| `--json` | Emit the v1 JSON envelope (`version`, `command`, `ok`, `data`, `error`) |
| `--json-legacy` | Emit the raw payload (skip the envelope) — for `jq` pipelines |
| `--format ndjson` | Stream one record per line — for large results |
| `--dry-run` | Validate; never contact AnkiConnect |
| `--quiet` | Summary only; no per-op detail |
| `--batch-id <id>` | Wrap writes in a named atomic batch |
| `--rollback-on-partial` | Auto-rollback the batch on any failure |
| `--idempotency-key <k>` | Skip if this key already succeeded |
| `--resume-from <name>` | Skip notes already captured in a checkpoint |
| `--profile <name>` | Use a named URL profile from `$XDG_CONFIG_HOME/anki-xml/` |

## Read the envelope

Every `--json` output is wrapped in a v1 envelope:

```json
{
  "version": 1,
  "command": "validate",
  "ok": true,
  "args": { "file": "/tmp/draft.xml" },
  "data": { "valid": true, "noteCount": 2, "errors": [], "warnings": [] },
  "meta": { "duration_ms": 4, "timestamp": "2024-...", "version": "0.0.1" }
}
```

Failure shape — switch on `error.code`, never on `error.message`:

```json
{
  "version": 1,
  "command": "import",
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation errors: 1 note(s) failed",
    "details": { "errors": [...] }
  }
}
```

Stable error codes to branch on: `VALIDATION_ERROR`, `ANKICONNECT_ERROR`,
`FILE_NOT_FOUND`, `DUPLICATE`, `SCHEMA_MISMATCH`, `CHECKPOINT_NOT_FOUND`,
`PERMISSION_DENIED`.

## Common flows

### Bulk-update from a search

```bash
ids=$(anki-xml search "serendipity" --deck "English" --json --json-legacy \
  | jq -r '.hits[].noteId' | paste -sd,)
[ -n "$ids" ] && anki-xml update --ids "$ids" --field Extra="see also: <i>happy chance</i>"
```

### Stream a large result set

`search` supports `--limit`. For very large collections, page in chunks
of 100 with `--json-legacy` and `jq`:

```bash
offset=0
while :; do
  ids=$(anki-xml search "phrase" --limit 100 --json --json-legacy \
        | jq -r --argjson off "$offset" '.hits[$off:].noteId' | paste -sd,)
  [ -z "$ids" ] && break
  anki-xml update --ids "$ids" --field Foo="bar"
  offset=$((offset + 100))
done
```

### Snapshot before changes, rollback on failure

```bash
# Pre-batch
anki-xml checkpoint create pre-batch --ids "$IDS"

# Do the work
anki-xml update --ids "$IDS" --field Front="new text"

# If something breaks
anki-xml rollback --to pre-batch --dry-run   # preview
anki-xml rollback --to pre-batch              # restore
```

### Atomic batch with auto-rollback

```bash
anki-xml import ./cards.xml \
  --batch-id nightly \
  --rollback-on-partial \
  --json --quiet
```

If any note fails, the whole batch is rolled back; nothing partially
written.

### Idempotent retry

```bash
anki-xml import ./cards.xml --idempotency-key "deck-spanish-2024-01" --json --quiet
# Re-running with the same key is a no-op, not a duplicate.
```

### Resumable after a crash

```bash
anki-xml import ./cards.xml --resume-from pre-batch --json --quiet
# Skips notes already captured in the `pre-batch` checkpoint.
```

## Anti-patterns

Don't do these — they look reasonable but break the loop:

- **Don't loop `import` over individual notes.** The CLI is batched;
  per-note imports serialize badly and lose the per-file atomicity.
- **Don't grep `error.message`.** Switch on `error.code`; messages are
  human-readable and may change.
- **Don't pipe the JSON envelope into `jq` without `--json-legacy`**
  (or `.data` first). The envelope is great for agents, awkward for
  `jq` pipelines.
- **Don't pass `--allow-duplicate` blindly.** It exists for the rare
  re-import case; the default rejects duplicates so a corrected second
  run doesn't collide with a partially successful first run.
- **Don't change the model or deck of an existing note via `update`.**
  Use `rename-deck`/`move-notes` and a migration for model changes.
- **Don't run writes without `doctor` first** in a fresh environment.
  Most "Anki isn't responding" errors are AnkiConnect not loaded.

## What lives where

- `docs/commands.md` — full command reference with flags
- `docs/usage.md` — XML schema for every built-in note type
- `docs/ai-cookbook.md` — five-loop recipe and error-code table
- `docs/ai-integration.md` — agent workflow guide
- `examples/` — runnable XML samples for every note type
- `scripts/safe-import.sh` — the five-loop in one shell call
