# Commands

> **Legacy (pre-monorepo).** This page documents the old 31-command
> design surface; several commands shown here (search, update, addon,
> migrate, profile, …) do **not** exist in the current CLI. The
> canonical current surface is `docs/cli-design.md` (16 commands,
> 18 MCP tools). Keep this page read-only — historical only.

`anki-xml` ships **34 commands** grouped by purpose. Every command
accepts the [global flags](#global-flags) below. Per-command `Usage:` and
`Example(s):` appear in `--help`; this page explains the why, the
how, and the trade-offs.

## Command index

```
Read / Query     validate  plan  decks  stats  search  export  diff
                 preview   sample  schema-validate  doctor  open
Write            import  update  tag  untag  delete  rename-deck
                 delete-deck  move-notes  suspend  unsuspend  bury  sync
Schema           models  fields  tags  note-info
Lifecycle        migrate  profile
Recovery         checkpoint  rollback  audit-log
Add-ons          addon
Shell            completion
```

---

## Global flags

These work on every command:

| Flag | Purpose |
|---|---|
| `--url <url>` | AnkiConnect endpoint (default `http://127.0.0.1:8765`) |
| `--json` | Emit machine-readable JSON envelope |
| `--json-legacy` | Emit legacy JSON shape (raw payload, pre-v1) |
| `--format <ndjson \| default>` | Stream one record per line |
| `--dry-run` | Validate; never contact AnkiConnect |
| `--quiet` | Summary only; no per-op detail |
| `--no-color` | Strip ANSI from output |
| `--profile <name>` | Use a named AnkiConnect URL profile |
| `--config <path>` | Use a custom config file |
| `--batch-id <id>` | Wrap writes in a named atomic batch |
| `--rollback-on-partial` | Auto-rollback the batch on any failure |
| `--idempotency-key <key>` | Skip if this key already succeeded |

## Exit codes

| code | meaning |
|---|---|
| 0 | success — every operation completed cleanly |
| 1 | partial failure (some succeeded, some failed) |
| 2 | fatal — file unreadable, malformed XML, no AnkiConnect, etc. |

---

## Read / Query

These commands never mutate the collection.

### `validate <file>`

Parse and structurally validate an XML file without contacting Anki.
Cheapest feedback loop — useful for "is this file safe to commit?"
and AI pre-iteration validation.

```bash
anki-xml validate ./cards.xml              # human-readable
anki-xml validate ./cards.xml --json       # machine-readable
anki-xml validate ./cards.xml --strict     # warnings → errors
```

Warnings: malformed tags (commas, very long tags, control chars).
Exit 0 if no errors, 1 if validation errors, 2 if file/parse errors.

### `plan <file>`

Preflight for an `import`. Validates the file, asks AnkiConnect which
decks exist, uses `canAddNotes` to predict which notes would be
rejected as duplicates. **No mutation.**

```bash
anki-xml plan ./cards.xml                # full preflight (default)
anki-xml plan ./cards.xml --no-preflight # offline plan, no network
anki-xml plan ./cards.xml --json
```

This is the read-before-write primitive for AI loops. See
[`ai-cookbook.md`](./ai-cookbook.md).

### `decks`

List every deck and subdeck with own and descendant card counts.
AI uses this to understand a collection before generating content.

```bash
anki-xml decks                 # human-readable tree
anki-xml decks --json          # flat array
```

Human output:

```
3 decks, 47 total cards

Languages  —  47 cards
  Languages::Spanish  —  25 cards (10 direct)  [#1234567890123]
  Languages::French   —  22 cards (8 direct)
  Languages::German   —  14 cards (6 direct)
```

`--json` is a flat array of `{name, totalCards, ownCards, id?}`.

### `stats`

Count cards by Anki scheduler state. With `--field <name>`, reports
the cardinality of values in that field — the single best signal
for "what should the next deck contain?".

```bash
anki-xml stats --deck "Languages::Spanish"
anki-xml stats --field Front --top 10
```

State buckets:

- `new` + `learn` = **incomplete** (not yet graduated)
- `review` = **completed** (graduated)
- `suspended` / `buried` = paused

`--field` mode uses `notesInfo` to walk every note and tally values
(top N then by name). See [`stats.ts`](../src/stats.ts).

### `search [phrase]`

Full-text search across all notes. Uses Anki's own search engine
(strips HTML, understands `is:new`, `tag:`, `deck:`).

```bash
anki-xml search "hola" --deck "Spanish" --tag "greeting" --limit 5
anki-xml search --query "deck:Spanish is:review"
```

Each result includes `noteId` (use with `update --id`), `cards`,
`modelName`, `tags`, `snippet`, and `plainText` (HTML stripped,
prefixed with `[FieldName]`).

### `export <out.xml>`

Read notes and emit round-trippable XML.

```bash
anki-xml export "deck:Spanish" spanish-deck.xml
```

By default, ids are stripped (exportable + re-importable as new
notes). Pass `--with-ids` to keep ids and treat the result as an
update batch.

### `diff <file>`

Compare a local file against the live collection and emit a
structured `added` / `changed` / `removed` set. By default uses
`guid` from `<note id="...">`; falls back to content fingerprint.

```bash
anki-xml diff ./cards.xml            # human-readable
anki-xml diff ./cards.xml --json     # machine-readable
```

### `preview`

Open Anki's browser on a query. Uses `guiBrowse`. The agent uses
this to get visual confirmation; humans use it for fast lookup.

```bash
anki-xml preview --query "deck:Spanish"
anki-xml preview --query "tag:scratch"
```

### `sample <N>`

Random sample of N notes. Deterministic with `--seed`.

```bash
anki-xml sample 5 --seed 42
anki-xml sample 5 --query "deck:Spanish" --seed 7
```

PRNG: Mulberry32. Without a seed, uses `Math.random()`-based default.

### `schema-validate <file>`

Static validation **plus** a check against the LIVE collection's
schema. Catches drift like a renamed field, a removed model, or a
required field that no longer exists.

```bash
anki-xml schema-validate ./cards.xml
anki-xml schema-validate ./cards.xml --json
```

See [`schema-v2.md`](./schema-v2.md) for the future schema v2 story.

### `doctor`

Pre-flight check: connectivity, version, collection, and required
add-ons. The agent should run this before real work, especially
before generating math-heavy content.

```bash
anki-xml doctor
```

Checks performed (in order):

| # | Check | Fails when |
|---|---|---|
| 1 | `anki-connect-reachable` | Anki is not running or the URL is wrong |
| 2 | `anki-connect-version` | AnkiConnect API version is below 5 |
| 3 | `collection-has-decks` | The collection has no decks |
| 4 | `collection-has-models` | The collection has no models (unusual) |
| 5 | `addons-queryable` | AnkiConnect is too old to expose `getAddons` |
| 6 | `mathjax-addon-installed` | The MathJax add-on (`1610307553`) is not installed or is disabled |

Exits 0 when every check passes, 1 when any fails. Each failed
check's `detail` explains how to fix it. The MathJax check's fix is
either `anki-xml addon install 1610307553` or switching the source
content to the native `[latex]...[/latex]` syntax, which renders
without MathJax.

### `open`

Launch the Anki desktop app from the CLI. AnkiConnect is served from
inside Anki, so Anki must be running as a desktop app (macOS /
Windows / Linux) before any AnkiConnect command works. `open` spawns
it detached so the CLI can exit while Anki starts.

```bash
anki-xml open            # launch Anki on this machine
anki-xml open --json     # { ok, command, detail }
```

Platform commands (also printed in every "connection refused" hint):

| Platform | Command |
|---|---|
| macOS | `open -a Anki` (fallback `open /Applications/Anki.app`) |
| Windows | `start "" "Anki"` (fallback `C:\Program Files\Anki\anki.exe`) |
| Linux | `anki` (fallbacks `anki-desktop`, `flatpak run net.ankiweb.Anki`) |

Exits 0 when the spawn succeeded (the app may still be starting),
1 when the spawn failed (e.g. Anki not installed) — the message then
names the manual command. MCP exposes the same action as `open_anki`.
Every "connection refused" hint from `doctor` includes the exact
launch command for the current platform, so agents can either run
`anki-xml open` or the raw command themselves.

### `addon`

Manage Anki add-ons via AnkiConnect (`getAddons` / `installAddon`
/ `toggleAddon`).

```bash
anki-xml addon list                              # every installed add-on
anki-xml addon install 1610307553                # install MathJax from AnkiWeb
anki-xml addon enable 1610307553                 # enable an installed add-on
anki-xml addon disable 1610307553                # disable without uninstalling
anki-xml addon check                             # doctor-style check for known add-ons
```

Subcommand semantics:

- `list` — reports every installed add-on with enabled state. Annotates
  known add-ons (e.g. MathJax) with a description. Requires
  AnkiConnect that supports `getAddons` (added in AnkiConnect 2.1.55+).
- `install <code>` — downloads an add-on from AnkiWeb by its numeric
  code. Requires internet from the Anki host. After install, Anki
  typically requires a restart for the add-on to load.
- `enable <code>` / `disable <code>` — toggle an installed add-on
  on or off. Restart Anki for the change to take effect.
- `check` — runs the add-on portion of `doctor` in isolation. Returns
  exit 1 if any known add-on (currently MathJax) is missing or
  disabled.

Known add-on codes are exported from `src/doctor.ts` as
`KNOWN_ADDONS` so other tools can reference them without hardcoding.

---

## Write

These commands mutate the collection. Every one supports `--dry-run`
and writes an audit-log entry on success.

### `import <file>`

Create notes from an XML file.

```bash
anki-xml import ./cards.xml
anki-xml import ./cards.xml --dry-run
anki-xml import ./cards.xml --no-auto-create-deck
anki-xml import ./cards.xml --resume-from pre-batch   # M11
anki-xml import ./cards.xml --batch-id nightly --rollback-on-partial
```

Atomic at the file-validation boundary: if any note is invalid, the
whole batch is rejected before AnkiConnect is contacted. Within a
file, partial failures from AnkiConnect (e.g. `null` ids) are
reported and counted, but valid ids are still kept.

Flags:

| Flag | Purpose |
|---|---|
| `--auto-create-deck` / `--no-auto-create-deck` | Create missing decks (default on) |
| `--allow-duplicate` | Allow duplicates (default rejects) |
| `--resume-from <name>` | Skip notes already captured in this checkpoint |

### `update`

Change fields and/or tags on existing notes. Three input modes:

**Single note from CLI:**
```bash
anki-xml update --id 1234567890 --field Front="new Q" --field Back="new A"
anki-xml update --id 1234567890 --tags "spanish v2"
anki-xml update --id 1234567890 --add-tags "v2" --remove-tags "v1"
```

**Multiple notes from a file (each `<note id="N">` carries its id):**
```xml
<anki>
  <note id="1234567890" type="Basic">
    <front>updated Q</front>
    <back>updated A</back>
  </note>
</anki>
```
```bash
anki-xml update --file ./updates.xml
anki-xml update --file ./updates.xml --dry-run
```

**Mapped update:** `anki-xml update --ids "1,2,3" --file ./updates.xml`
maps notes by position (first → 1, second → 2).

**Rename field (M12):** `anki-xml update --rename-field Fron=Front --ids 1,2,3`
migrates a field's value across many notes.

Update semantics:

- Only named fields are changed. Unnamed fields keep their current value.
- Tags are NOT touched unless you pass `--tags` / `--add-tags` / `--remove-tags`.
- Model of an existing note is NOT changed.
- Deck of an existing note is NOT changed.
- Per-note failures are reported, not aborting.

### `tag <tag>` / `untag <tag>`

Add or remove a tag on notes matching a query.

```bash
anki-xml tag --ids 1,2,3 reading
anki-xml tag --query "deck:Spanish" spanish
anki-xml untag --ids 1,2,3 scratch
```

### `delete`

Delete notes that match a query, deck, tag, or explicit ids.

```bash
anki-xml delete --query "deck:Tmp tag:scratch" --yes
anki-xml delete --ids 1,2,3 --cards-too
```

The `--yes` flag confirms without a prompt. Required for any
non-`--dry-run` invocation.

### `rename-deck <old> <new>`

Rename a deck. Children of `<old>` are NOT moved; use `move-notes`
for that.

```bash
anki-xml rename-deck "Old Name" "New Name"
```

### `delete-deck <name>`

Delete a deck and (optionally) its cards. By default only the
deck is dropped; cards are moved to Anki's "Default" deck.

```bash
anki-xml delete-deck "Tmp" --yes
anki-xml delete-deck "Tmp" --yes --cards-too
```

### `move-notes <deck>`

Move every note matching a query to a target deck.

```bash
anki-xml move-notes "Languages::Spanish::Verbs" --ids 1,2,3
anki-xml move-notes "Default" --query "tag:archive"
```

### `suspend` / `unsuspend` / `bury`

Card scheduling helpers.

```bash
anki-xml suspend --ids 1,2,3
anki-xml unsuspend --ids 1,2,3
anki-xml bury --ids 1,2,3
```

### `sync <file>`

Reconcile a file against the live collection — the create **and**
update API (unlike `import`, which only creates). Notes with `id=`
are matched against the collection; new notes are created, changed
ones updated, and a checkpoint is written so the run is rollback-able.

```bash
anki-xml sync ./cards.xml --json
anki-xml sync ./cards.xml --dry-run
```

Use `--dry-run` to preview. All import options apply
(`--batch-size`, `--allow-duplicate`, `--no-auto-create-deck`,
`--deck`, `--model`, `--checkpoint <id>`).

### `sync` (no file) — drift report

Compare the most recent checkpoint (or `--checkpoint <id>`) against
the collection: which tracked notes are still there and which are
missing.

```bash
anki-xml sync --json     # { checkpoint, drift: [{id, exists}], missing }
```

MCP exposes the same API as the `sync` tool with full option parity
and returns `missingIds` in the drift report.

---

## Schema discovery

These are read-only commands that probe AnkiConnect's schema.
The agent should call them before generating content.

### `models`

List every note model with its field names and card templates.

```bash
anki-xml models                   # human
anki-xml models --json            # one ModelInfo per model
```

### `fields <model>`

List field names for one model.

```bash
anki-xml fields Basic
anki-xml fields "Basic (and reversed card)"
```

Returns `[]` for an unknown model — no error.

### `tags`

Every tag in the collection with note counts.

```bash
anki-xml tags
anki-xml tags --json
anki-xml tags --query "deck:Spanish"
```

### `note-info <id>`

Full info on one note: fields, tags, deck, cards, model.

```bash
anki-xml note-info 1234567890
anki-xml note-info 1234567890 --json
```

Returns null when the id doesn't exist.

---

## Lifecycle

### `migrate <subcommand> <file>`

Apply schema-migration transforms to a file. The output is written
back to the file (or to stdout with `--out`).

```bash
anki-xml migrate assign-guids ./cards.xml
anki-xml migrate v1-to-v2 ./cards.xml --out ./cards-v2.xml
```

**assign-guids**: writes a `guid` attribute on each `<note>` so
future diffs and syncs are stable. Run this once before adopting
`diff` or `sync`.

### `profile <subcommand>`

Manage named AnkiConnect URL profiles.

```bash
anki-xml profile add work http://10.0.0.42:8765
anki-xml profile list
anki-xml profile remove work
```

Profiles are stored at `$XDG_CONFIG_HOME/anki-xml/profiles.json`.

---

## Recovery

### `checkpoint <subcommand>`

Capture / list / delete note snapshots. Every checkpoint is a JSON
snapshot of one or more notes' fields, tags, and deck.

```bash
anki-xml checkpoint create pre-batch --ids 1,2,3
anki-xml checkpoint list
anki-xml checkpoint show pre-batch
anki-xml checkpoint delete pre-batch
```

Stored under `$XDG_DATA_HOME/anki-xml/checkpoints/<name>.json`.

### `rollback --to <name>`

Restore a checkpoint. Each affected note is rewritten to its
captured state via `updateNoteFields` and `changeDeck`.

```bash
anki-xml rollback --to pre-batch
anki-xml rollback --to pre-batch --dry-run   # preview the diff first
```

### `audit-log`

Show recent audit-log entries. Every write op records one JSONL
line with command, target ids, outcome, timestamp, and
optional `batch` / `op` (operation id from `--idempotency-key`).

```bash
anki-xml audit-log                          # last 20
anki-xml audit-log --limit 100
anki-xml audit-log --command import         # one command
anki-xml audit-log --limit 20 --json        # machine-readable
```

Log file: `$XDG_DATA_HOME/anki-xml/audit.log`.

---

## Shell

### `completion <shell>`

Print a shell completion script to stdout.

```bash
# bash
anki-xml completion bash | sudo tee /etc/bash_completion.d/anki-xml

# zsh
anki-xml completion zsh > "${fpath[1]}/_anki-xml"

# fish
anki-xml completion fish > ~/.config/fish/completions/anki-xml.fish

# powershell
anki-xml completion powershell | Out-String | Invoke-Expression
```

Supported shells: `bash`, `zsh`, `fish`, `powershell`. Exit 2 if
the shell name is missing or unknown.

---

## See also

- [`docs/roadmap.md`](./roadmap.md) — what shipped and what's deferred
- [`docs/architecture-review.md`](./architecture-review.md) — why the
  CLI is shaped this way
- [`docs/ai-integration.md`](./ai-integration.md) — agent workflow
- [`docs/ai-cookbook.md`](./ai-cookbook.md) — five-loop agent pattern