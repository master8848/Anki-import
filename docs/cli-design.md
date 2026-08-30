# CLI design

Entry point: `packages/cli/src/index.ts` → `run.ts` (dispatch) →
`commands/*` (argv wiring only, no business logic). `args.ts` parses,
`help.ts` owns version/help text, `errors.ts` renders AnkiConnect
failures.

## Command table

All commands accept the global flags. `BIN_NAME` is `anki-import`
(`anki-xml` is an alias bin). `--help` per command prints the usage
lines below.

| Command | Usage | Behavior |
|---|---|---|
| `doctor` | `doctor [--url <url>]` | Runs AnkiConnect diagnostics: reachability, API version ≥ 6, decks, models, add-ons, MathJax. Failing checks carry ordered `hints`. Exit 1 when any check fails. |
| `open` | `open` | Launches the Anki desktop app for the current platform (macOS: `open -a Anki`, Windows: `start "" "Anki"` or anki.exe, Linux: `anki`). Detached, non-blocking. Exit 1 when the spawn fails; hints name the manual command. |
| `validate` | `validate <file> [--deck NAME] [--model NAME]` | Parses + validates without contacting Anki. Exit 1 on validation/parse errors. |
| `plan` | `plan <file> [--stream] [--deck NAME] [--model NAME]` | Dry-run preview against the live collection: add / update / duplicate / unchanged counts and per-note detail. Never mutates. |
| `diff` | `diff <file> [--stream] [--deck NAME] [--model NAME]` | Per-note field diffs vs the collection plus deck presence diff (`missing` / `extra`). |
| `import` | `import <file> [--dry-run] [--stream] [--batch-size N] [--deck NAME] [--model NAME]` | Creates notes only. Rejects notes with `id=` (update targets — "use 'sync'"). Writes a checkpoint when notes were created (or `--checkpoint` given). Exit 1 on validation errors or partial failure (`failed.length > 0`). |
| `sync` | `sync [<file>] [--dry-run] [--checkpoint <id>]` | With a file: plan then apply — creates AND updates, writes a checkpoint. Without a file: drift report comparing the most recent checkpoint (or `--checkpoint <id>`) against the collection. |
| `rollback` | `rollback <checkpoint-id> [--dry-run]` | Deletes the notes recorded in a checkpoint, then deletes the checkpoint file (unless `--keep-checkpoint`). |
| `checkpoint` | `checkpoint list` · `checkpoint create <id> --note-ids 1,2,3 [--deck NAME]` | Lists checkpoints (sorted by created date) or creates one from explicit note ids. |
| `watch` | `watch <file> [--yes] [--stream]` | Watches a file (fs.watch, 300 ms debounce); on change: plan → show summary → confirm (`[y/N]`, auto-apply with `--yes` or `--json`) → apply via `applyPlan`. Ctrl+C stops. |
| `tags` | `tags list` · `tags add <tag> --note-ids 1,2,3 \| --query "deck:X"` · `tags remove <tag> ...` | Lists collection tags; adds/removes a tag from notes selected by `--note-ids` or a `--query` search. |
| `models` | `models` | Lists note types with their field names. |
| `stats` | `stats [--deck <name>]` | Collection totals (decks, models, notes, cards, per-deck counts) or one deck's card counts. |
| `media` | `media store <file> [--as <name>]` · `media list` · `media retrieve <name> [--out <path>]` · `media delete <name>` | Store/list/retrieve/delete files in the Anki media folder. |
| `benchmark` | `benchmark <file> [--stream]` | Measures parse+validate throughput: cards, memory delta (MB), time (s), cards/sec. |
| `mcp` | `mcp` | Runs the MCP server over stdio (see mcp-design.md). |

## Flags

**Global** (`args.ts` `GlobalFlags`): parsed before the command.

| Flag | Meaning |
|---|---|
| `--url <url>` | AnkiConnect URL (default `http://127.0.0.1:8765`) |
| `--json` | Machine-readable JSON on stdout; silences the logger (stdout purity) |
| `--quiet` | Errors only |
| `--verbose` | Debug-level logging |
| `--debug` | Include stack traces on fatal errors |
| `--dry-run` | Validate + plan only; never write |
| `--help`, `-h` | Help (command-specific when a command is present) |
| `--version`, `-V` | Prints `anki-import v0.0.4` |

**File / import flags** (collected into `rest`; consumed per command):

| Flag | Commands | Meaning |
|---|---|---|
| `--stream` | import, plan, diff, benchmark, watch | Stream-parse large XML files (bounded memory) |
| `--batch-size <n>` | import, plan, diff, sync, watch | Notes per AnkiConnect request (default 500) |
| `--no-auto-create-deck` | import, sync, watch | Don't create missing decks during apply |
| `--allow-duplicate` | import, plan, diff, sync, watch | Pass `allowDuplicate` to AnkiConnect; plan counts those notes as duplicates |
| `--checkpoint <id>` | import, sync, watch | Checkpoint id for this operation |
| `--deck <name>` | validate, import, plan, diff, sync | Fill empty decks with this value |
| `--model <name>` | validate, import, plan, diff, sync | Fill empty model types with this value |
| `--yes` | watch | Apply without asking (implied by `--json`) |
| `--query "deck:X"` | tags | Select notes by Anki search query |
| `--as <name>` | media store | Store under a different filename |
| `--out <path>` | media retrieve | Write to a different path |
| `--note-ids 1,2,3` | checkpoint create, tags | Explicit note ids |
| `--keep-checkpoint` | rollback | Keep the checkpoint file after rollback |

Unknown flags raise `CliError` ("Unknown flag --x"); value flags
without a value raise "Flag --x requires a value". Boolean flags also
accept `--flag=value` form via the `rest` map (`flagBool` treats
`"true"` as true).

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Success (including dry-runs, help/version, plan/diff with a clean result, watch stopping on SIGINT) |
| `1` | Validation failure, doctor failure, parse failure (`XML_PARSE_ERROR`), partial import failure, checkpoint/rollback errors, tags selection errors, deck-not-found in `stats` |
| `2` | Usage errors (`CliError`), fatal errors, unknown commands, AnkiConnect errors (rendered by `printAnkiConnectError`), file-not-found |

## JSON envelopes

`--json` prints exactly one JSON document to stdout; all logs go to
stderr (logger level clamped to `error`). `ok` is the root key; errors
always carry a stable `code`.

**Error envelopes:**

```json
{ "ok": false, "error": { "code": "VALIDATION_ERROR", "errors": [...], "warnings": [...] } }
{ "ok": false, "error": { "code": "XML_PARSE_ERROR", "message": "...", "line": 3, "column": 5 } }
{ "ok": false, "error": { "code": "USAGE_ERROR", "message": "..." } }
{ "ok": false, "error": { "code": "FATAL", "message": "..." } }
{ "ok": false, "error": {
    "code": "ANKICONNECT_ERROR",
    "message": "...",
    "cause": "refused",
    "hints": ["Start the Anki app ...", "Install the AnkiConnect add-on ..."],
    "suggestion": "anki-import doctor"
} }
```

`ANKICONNECT_ERROR` carries `cause` (stable: `refused | timeout | http |
bad-json | network | ok | unknown`), ordered `hints`, and a `suggestion`
— see `packages/anki/src/errors.ts` for the hint texts and
`packages/cli/src/errors.ts` for the envelope.

**Success shapes** (per command, from the command sources):

- `doctor` → the raw `DoctorResult`: `{ url, checks: [{name, ok, detail, hints, suggestion?}], ok }`
- `validate` → `{ ok, noteCount, errors, warnings }`
- `plan` → `{ ok: true, add: [{number, deck, model, fields}], update: [{id, number, changedFields}], remove, duplicates: [{number, deck}], unchanged }`
- `diff` → `{ ok: true, notes: [NoteDiff...], decks: { missing, extra } }`
- `import` → `{ ok: true, dryRun, validCount, created, failed: [{noteNumber, reason}], noteIds, checkpointId, warnings }`
- `sync <file>` → `{ ok: true, dryRun, plan: {add, update, duplicates, unchanged}, applied }` (`applied: {created, updated, failed, checkpointId}`; omitted under `--dry-run`)
- `sync` (no file) → `{ ok: true, checkpoint, drift: [{id, exists}], missing }` — or `{ ok: true, checkpoint: null, drift: [] }`
- `rollback` → `{ checkpoint, deleted, dryRun }`
- `checkpoint list` → `{ checkpoints: [...] }`; `checkpoint create` → the `Checkpoint` object
- `tags list` → `{ tags }`; `tags add|remove` → `{ ok: true, tag, noteIds }`
- `models` → `{ models: [{name, fields}] }`
- `stats` → `CollectionStats` (`{decks, models, notes, cards, perDeck}`) or `{ deck, counts }`
- `media` → `{ ok: true, filename }` / `{ ok: true, filename, out }` / `{ media: [...] }`
- `benchmark` → `{ cards, memoryMb, timeSec, rate, stream }`

## Design principles

- **No business logic in commands** (constraint #2): `commands/*` only
  read flags, call `@anki-xml/core` (or leaf packages), and render —
  exit code or JSON.
- **`--json` changes output only** (constraint #8): no code path
  branches on `--json` to change behavior; the logger is silenced so
  stdout carries a single JSON document.
- **Stable error codes** (constraint #9): `VALIDATION_ERROR`,
  `XML_PARSE_ERROR`, `ANKICONNECT_ERROR`, `USAGE_ERROR`, `FATAL` —
  branch on `code`, never on `message`. `ANKICONNECT_ERROR` adds
  `cause`/`hints`/`suggestion` for agents.
- **Stdout purity**: logger `info`/`debug` go to stdout but are
  suppressed under `--json`/`--quiet`; `error`/`warn` always go to
  stderr. `--version`, help, and JSON output are the only stdout writers.

## Example sessions

```bash
# 1. Diagnose first — always
anki-import doctor
[ok] anki-connect-reachable: AnkiConnect reachable at http://127.0.0.1:8765
[ok] anki-connect-version: API version 6 is supported (we speak v6)
...

# 2. Plan before writing (no mutation)
anki-import plan cards.yaml
+ add note 1 (Japanese / Basic)
+ add note 2 (Japanese / Basic)
Plan: 2 add, 0 update, 0 duplicate, 0 unchanged

# 3. Import with a checkpoint
anki-import import cards.yaml
Imported 2 notes.

# 4. Fix a mistake: roll back the whole import
anki-import rollback import-<timestamp>
Rolled back 2 notes from import-<timestamp>

# 5. Keep a deck in sync as the XML changes
anki-import watch cards.xml --yes
Watching cards.xml — Ctrl+C to stop.
Change detected: cards.xml
Plan: 1 add, 1 update, 0 duplicate, 0 unchanged
Applied: 1 created, 1 updated, 0 failed.

# Agent-facing variant (single JSON document on stdout)
anki-import plan cards.yaml --json
```
