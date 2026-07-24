# CLI Command Design

This document is the design specification for new CLI commands beyond the
current five (`import`, `decks`, `stats`, `search`, `update`). It is the
source of truth for command surface area, options, JSON shapes, and exit
codes. No code has been implemented yet; this is a design specification.

Implementation order is in [`roadmap.md`](./roadmap.md).

## Selection Rationale

Before detailing each command, here is what was **considered and rejected**:

| Candidate | Rejected because |
|---|---|
| `fmt` | XML formatting would change CDATA boundaries, comment placement, attribute order. Auto-formatting risks corrupting CDATA content. |
| `lint` | Functionally a strict mode of `validate`. Having both confuses the CLI surface. `validate --strict` is enough. |
| `normalize` | Equivalent to `export` + re-import. Already covered. |
| `schema` | The schema is fixed at 5 built-in models. A runtime introspection command is overkill; the `fields` command (designed below) is sufficient. |
| `query` | Already a sub-flag of `search --query`. A separate top-level command would duplicate. |

**Accepted commands** (14):

```
validate          pre-flight parse + structural validation, no network
plan              pre-flight parse + validate + canAddNotes, no mutations
export            collection → XML
diff              file vs collection, per-field comparison
delete            remove notes
sync              file ↔ collection reconciliation
tag               add/remove tags (bulk)
tags              collection tag inventory
cards             suspend/unsuspend/bury card scheduling
notes             get/inspect individual notes
media             upload, retrieve, list, delete media files
doctor            health check of CLI + AnkiConnect + config
config            multi-profile + persistent settings
completion        shell completion scripts
```

## Conventions Applied Across All Commands

**Global flags (every command):**

```
--url URL          AnkiConnect URL (default: http://127.0.0.1:8765)
--json             structured JSON output (read commands)
--no-color         strip ANSI from human output
--quiet            suppress per-item lines, emit summary only
-h, --help         per-command help
```

**Output format:**

- Default: human-readable text, colorized when stdout is a TTY.
- `--json`: `{version: 1, command: "...", data: ...}` envelope (P2.8).
- Errors: `{version: 1, command, ok: false, error: {code, message, location?}}`.

**Exit codes (unchanged):**

```
0  success (every requested operation completed)
1  partial failure (some operations failed, others succeeded)
2  fatal (AnkiConnect unreachable, malformed CLI input, missing argument)
```

**Atomicity policy:**

| Command | Default | `--allow-partial` | `--atomic` |
|---|---|---|---|
| `import` | atomic (existing) | n/a | n/a |
| `update` | per-note (existing) | default | opt-in |
| `delete` | per-note | default | opt-in |
| `tag` | per-note | default | opt-in |
| `cards suspend/unsuspend/bury` | per-note | default | opt-in |
| `sync` | per-note | default | opt-in |
| `media upload` | per-file | default | opt-in |

`--dry-run` is supported on every command that touches state.

---

## 1. `validate` — Parse and validate an XML file (no network)

```
anki-xml validate <file.xml> [--json] [--strict] [--quiet]
```

The cheapest possible feedback loop. Runs `parseDocument` + `validateNotes`
without contacting AnkiConnect.

```bash
anki-xml validate cards.xml --json
# {
#   "version": 1,
#   "command": "validate",
#   "data": {
#     "file": "cards.xml",
#     "valid": true,
#     "noteCount": 47,
#     "errors": [],
#     "warnings": [],
#     "decks": ["AI Import::Spanish"]
#   }
# }
```

Exit codes: 0 = no errors, 1 = validation errors, 2 = file/parse errors.

---

## 2. `plan` — What would `import` do?

```
anki-xml plan <file.xml> [--json] [--no-preflight] [--allow-duplicate] [--quiet]
```

Runs `parseDocument` + `validateNotes` + `canAddNotes`. Reports what would
be created and what would be rejected.

```bash
anki-xml plan cards.xml --json
# {
#   "version": 1, "command": "plan",
#   "data": {
#     "file": "cards.xml", "parsed": 47,
#     "wouldCreate": 45, "wouldReject": 2,
#     "errors": [{"noteNumber": 12, "code": "Duplicate", "existingNoteId": 1500000000042}],
#     "decksToCreate": ["AI Import::Spanish::Grammar"]
#   }
# }
```

Exit codes: 0 = all would succeed, 1 = some would reject, 2 = fatal.

---

## 3. `export` — Collection → XML

```
anki-xml export [--deck NAME] [--tag T] [--query Q] [--limit N] [--output FILE] [--json]
```

Reads notes from the collection and writes them as a `<anki>` document.

```bash
anki-xml export --deck "AI Import::Spanish" --include-ids > roundtrip.xml
```

Exit codes: 0 = success, 1 = some notes failed to fetch, 2 = Anki unreachable.

---

## 4. `diff` — File vs collection

```
anki-xml diff <file.xml> [--against-deck D] [--json] [--summary-only]
```

For each note in the file, looks up the corresponding note in the collection
and emits a per-field comparison.

Exit codes: 0 = no differences, 1 = differences found, 2 = fatal.

---

## 5. `delete` — Remove notes

```
anki-xml delete (--id N | --ids "1,2,3" | --file f.xml | --query Q) [--yes] [--json] [--atomic]
```

Three input modes mirroring `update`: single id, comma-separated ids, or a
file of `<note id="…">` elements.

Exit codes: 0 = all deleted, 1 = some failed, 2 = fatal.

---

## 6. `sync` — File ↔ collection reconciliation

```
anki-xml sync <file.xml> [--strategy create|update|upsert|mirror] [--interactive] [--dry-run] [--json]
```

Reconciliates a file with the collection. `mirror` deletes collection notes
not in the file.

```bash
anki-xml sync cards.xml --strategy mirror --dry-run --json
# Shows plan before executing
```

---

## 7. `tag` / `untag` — Mutate tags

```
anki-xml tag --add "t1, t2" (--id N | --ids "..." | --file f.xml | --query Q) [--json]
anki-xml tag --remove "t3" (--id N | --ids "..." | --file f.xml | --query Q) [--json]
```

Adds or removes tags on existing notes. `--add` is additive; `--remove` is
subtractive.

---

## 8. `tags` — Collection tag inventory

```
anki-xml tags [--query Q] [--limit N] [--json]
```

Lists all tags in use in the collection, with note counts.

---

## 9. `cards` — Card scheduling

```
anki-xml cards suspend|unsuspend|bury (--id N | --ids "..." | --file f.xml | --query Q) [--yes]
```

Card-level operations.

---

## 10. `notes` — Single-note inspection

```
anki-xml notes get --id N [--json]
anki-xml notes fields --type MODEL [--json]
anki-xml notes model [--json]
```

Three subcommands: `get` (single note), `fields` (model field map),
`model` (all models).

---

## 11. `media` — Media files

```
anki-xml media list [--json]
anki-xml media get --name FILE [--output FILE] [--json]
anki-xml media put --name FILE [--source FILE] [--base64 STRING] [--json]
anki-xml media delete --name FILE [--yes] [--json]
```

Wraps AnkiConnect's media API.

---

## 12. `doctor` — Health diagnostics

```
anki-xml doctor [--json] [--verbose]
```

Diagnoses the CLI's environment and its connection to Anki.

Checks:

1. Bun version vs minimum
2. AnkiConnect reachable at `--url`
3. AnkiConnect version
4. Permission to add notes
5. Deck write permission
6. Disk write permission
7. Network round-trip latency

---

## 13. `config` — Profiles + persistent settings

```
anki-xml config show [--json]
anki-xml config get KEY
anki-xml config set KEY VALUE
anki-xml config profile list
anki-xml config profile use NAME
anki-xml config profile add NAME --url URL
anki-xml config profile remove NAME
```

Manages persistent settings at `~/.config/anki-xml/config.json`.

---

## 14. `completion` — Shell completion scripts

```
anki-xml completion bash > /etc/bash_completion.d/anki-xml
anki-xml completion zsh  > "${fpath[1]}/_anki-xml"
anki-xml completion fish > ~/.config/fish/completions/anki-xml.fish
anki-xml completion powershell > $PROFILE
```

Generates static completion scripts.

---

## Cross-Command Composition Patterns

These workflows are documented patterns; not new commands.

### Read-then-write

```bash
# Find notes and tag them
anki-xml search --query 'tag:spanish AND -tag:reviewed' --json \
  | jq -r '.[].noteId' \
  | xargs -I{} anki-xml tag --add reviewed-2025 --id {}
```

### Round-trip

```bash
anki-xml export --deck "AI Import::Spanish" --include-ids > current.xml
# (edit current.xml)
anki-xml sync current.xml --strategy create-or-update
```

### Inspect-then-decide

```bash
anki-xml validate cards.xml
anki-xml plan cards.xml
anki-xml diff cards.xml --against-deck "AI Import::Spanish"
anki-xml sync cards.xml --strategy mirror
```

---

## Status

This document is the design specification. Implementation proceeds from
[`roadmap.md`](./roadmap.md). The first command to ship is `validate`
(roadmap commit 1, P1.2).

References:

- [`roadmap.md`](./roadmap.md) — implementation order
- [`architecture-review.md`](./architecture-review.md) — module boundaries
- [`schema-v2.md`](./schema-v2.md) — XML schema design
- [`ai-integration.md`](./ai-integration.md) — agent integration patterns