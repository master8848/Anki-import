# CLI reference

The `anki-xml` command-line interface.

## Synopsis

```
anki-xml [global options] <command> [subcommand options]
```

`global options` come before or after the subcommand; most are
position-independent. `subcommand options` follow the subcommand
and vary by command.

## Global options

Every command accepts these:

| option                       | default                   | meaning                                                              |
|------------------------------|---------------------------|----------------------------------------------------------------------|
| `--url <url>`                | `http://127.0.0.1:8765`   | AnkiConnect endpoint                                                 |
| `--json`                     | (off)                     | Emit machine-readable JSON envelope                                  |
| `--json-legacy`              | (off)                     | Emit legacy JSON shape (raw payload, pre-v1)                         |
| `--format <fmt>`             | `default`                 | Output format: `default` or `ndjson` (one record per line)           |
| `--dry-run`                  | (off)                     | Validate; never contact AnkiConnect                                  |
| `--quiet`                    | (off)                     | Summary only (no per-op detail)                                      |
| `--no-color`                 | (off)                     | Strip ANSI color from output                                         |
| `--profile <name>`           | (none)                    | Use a named profile from `.anki-xmlrc`                              |
| `--config <path>`            | (none)                    | Use a custom config file                                             |
| `--batch-id <id>`            | (none)                    | Wrap writes in a named atomic batch                                  |
| `--rollback-on-partial`      | (off)                     | Auto-rollback the batch on any failure                               |
| `--idempotency-key <key>`    | (none)                    | Skip if this key already completed successfully                      |
| `--help`, `-h`               |                           | Print usage and exit                                                 |
| `--version`, `-v`            |                           | Print version and exit                                               |

Run `anki-xml --help` for the canonical list.

## Exit codes

| code | meaning |
|---|---|
| 0 | success — every operation completed cleanly |
| 1 | partial failure (some succeeded, some failed) |
| 2 | fatal — file unreadable, malformed XML, no AnkiConnect, etc. |

## Configuration precedence

Resolved at startup, lowest priority first:

1. Built-in defaults
2. `$XDG_CONFIG_HOME/anki-xml/config.toml` (global)
3. `./.anki-xmlrc` (project-local)
4. `--config <path>` (explicit override)

CLI flags override config when both are present (except for `--url`
which config wins over the default — CLI flag wins over config).
See [`src/config.ts`](../src/config.ts).

## `import <file>` walkthrough

Read `<file>`, parse the XML, validate every `<note>`, then post
the valid ones to Anki via AnkiConnect.

If any note fails validation, the whole batch is rejected and the
process exits with status `1`. If everything succeeds, exits `0`.

### Per-command options

| option                    | default                | meaning                                                                |
|---------------------------|------------------------|------------------------------------------------------------------------|
| `--auto-create-deck`      | on                     | Create any missing decks before posting notes                          |
| `--no-auto-create-deck`   |                        | Skip deck creation; abort the import if a deck is missing              |
| `--allow-duplicate`       |                        | Allow duplicate notes (default: reject)                                |
| `--resume-from <name>`    |                        | Skip notes already captured in this checkpoint (network-drop recovery)|

### Examples

```bash
# Validate before sending.
anki-xml import ./cards.xml --dry-run

# Use a non-default AnkiConnect endpoint.
anki-xml import ./cards.xml --url http://localhost:8765

# Strict mode: don't create missing decks.
anki-xml import ./cards.xml --no-auto-create-deck

# Resume from a prior checkpoint after a network drop.
anki-xml import ./cards.xml --resume-from pre-batch

# Atomic batch — rollback on partial failure.
anki-xml import ./cards.xml --batch-id nightly --rollback-on-partial

# Idempotent retry — safe to run again.
anki-xml import ./cards.xml --idempotency-key "$(date +%Y%m%d)"

# CI-mode JSON envelope for the agent loop.
anki-xml import ./cards.xml --json --quiet
```

### Validation is atomic

The file is validated before deck creation or `addNotes`. If one
note is invalid, no valid subset is sent; fix the reported errors
and run the file again. After a valid request reaches AnkiConnect,
the API can still report per-note failures (for example, duplicates).

## `--auto-create-deck`

This flag is **on by default**. With it on, the tool calls
`createDeck` on AnkiConnect for every unique deck name referenced
by the validated notes, **before** posting the notes. This is what
makes the import "just work" for a fresh file on a fresh Anki
install.

### Why this exists

Without auto-create, importing a file that references
`deck="AI Import::Vocab"` would fail with:

```
fatal: AnkiConnect error: 'deck was not found: AI Import::Vocab'
```

even though the XML is structurally correct. You'd then have to open
Anki and create the deck by hand, or shell out to AnkiConnect's
`createDeck` from somewhere else.

### Why it's safe to leave on

AnkiConnect's `createDeck` is **idempotent**: it returns the
existing deck's id when called for a deck that already exists.
Calling it for the same deck 1, 5, or 1000 times has the same
effect as calling it once.

It's also **parent-aware**: calling `createDeck('A::B::C')` will
create `A`, `A::B`, and `A::B::C` in one call. The CLI always calls
`createDeck` per unique deck name (deduplicated), so you get
exactly the set of decks the file references.

### When to turn it off

`--no-auto-create-deck` is useful for:

- **CI / strict workflows** — if the deploy pipeline assumes the
  Anki deck was provisioned elsewhere, a missing-deck error is the
  right signal.
- **Forensic / read-only modes** — you want to verify a file would
  import against a known-deck Anki state, and any "missing deck"
  should fail loudly.

### Behavior in `--dry-run`

`--dry-run` does not contact AnkiConnect at all, so the auto-create
behavior is irrelevant — the tool just reports what *would* have been
sent.

## Examples in practice

```bash
# First-time import: brand new deck auto-created.
$ anki-xml import ./new-deck.xml
Reading ./new-deck.xml ...
Created: 5
All notes created successfully.

# Re-import: deck creation is idempotent, but note creation is not.
# allowDuplicate=false means existing notes are reported as failures.
$ anki-xml import ./new-deck.xml
Reading ./new-deck.xml ...
Created: 0
Failed: 5

# Multi-deck file: every deck (and parent) created in one call.
$ cat multi-deck.xml
<anki deck="Top">
  <note type="Basic" deck="Top::A"><front>1</front><back>1</back></note>
  <note type="Basic" deck="Top::B"><front>2</front><back>2</back></note>
</anki>
$ anki-xml import ./multi-deck.xml
Created: 2
All notes created successfully.
# Anki now has: Top, Top::A, Top::B (Top was implicitly created).

# Strict mode: missing deck is fatal.
$ anki-xml import ./unknown-deck.xml --no-auto-create-deck
fatal: AnkiConnect error: 'deck was not found: DoesNotExist'
exit=2
```

## Audit log

Every write command records a JSONL entry in
`$XDG_DATA_HOME/anki-xml/audit.log` (default
`~/.local/share/anki-xml/audit.log`):

```json
{"timestamp":"2024-01-15T12:34:56Z","command":"import","status":"ok","noteIds":[1,2,3],"args":{...}}
{"timestamp":"2024-01-15T12:35:01Z","command":"update","status":"ok","noteIds":[42],"op":"op:abc12345"}
```

The `op` field is the idempotency operation id when `--idempotency-key`
was set. Idempotency state lives in the same file, keyed by op id.

Run `anki-xml audit-log` to inspect.