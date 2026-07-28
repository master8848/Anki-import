# anki-xml

A command-line tool for importing, querying, and updating
[Anki](https://apps.ankiweb.net/) flashcards via
[AnkiConnect](https://foosoft.net/projects/anki-connect/). Built for
AI agents; safe for humans.

```sh
$ anki-xml import ./cards.xml
$ anki-xml search --query "hola" --limit 5
$ anki-xml plan ./cards.xml --format ndjson
$ anki-xml checkpoint create pre-batch --ids 1,2,3
$ anki-xml rollback --to pre-batch
$ anki-xml doctor
```

## Why?

`anki-markdown` was a great idea — but AI agents generate XML, not
Markdown. `anki-xml` keeps the simple model (a single file = one
batch of notes) but uses XML so it round-trips cleanly with HTML,
CDATA, and arbitrary field content.

This CLI was designed from the ground up for autonomous workflows.
Every command is:

- **Deterministic** — same inputs produce the same outputs
- **Idempotent** — `--idempotency-key` makes retries safe
- **Recoverable** — checkpoints, rollback, audit log
- **Inspectable** — `--json` output, structured errors with line/column
- **Composable** — every command is pipeable; no interactive prompts

## Install

```sh
bun install -g anki-xml
```

Or run directly from a checkout:

```sh
bun run src/index.ts --help
```

## Quick start

1. Start Anki with the AnkiConnect add-on installed.
2. Verify the CLI can reach it:

   ```sh
   anki-xml doctor
   ```

3. Create a file of cards and import it:

   ```xml
   <!-- cards.xml -->
   <anki deck="Spanish">
     <note type="Basic">
       <front>hola</front>
       <back>hello</back>
     </note>
   </anki>
   ```

   ```sh
   anki-xml import ./cards.xml
   ```

## Commands (32)

| Command | Purpose |
|---|---|
| `import` | Create notes from an XML file |
| `validate` | Static-validate an XML file (no AnkiConnect call) |
| `plan` | Show what `import` would do (dry-run + structured) |
| `decks` | List decks and card counts |
| `stats` | Per-state card counts, or `--field <name>` cardinality |
| `search` | Search notes by query, deck, tag, phrase |
| `update` | Change field values and tags on existing notes |
| `tag` / `untag` | Add or remove tags in bulk |
| `export` | Read notes and emit round-trippable XML |
| `delete` | Delete notes by query or explicit ids |
| `rename-deck` / `delete-deck` / `move-notes` | Deck operations |
| `suspend` / `unsuspend` / `bury` | Card scheduling |
| `migrate` | Apply schema migration transforms (`assign-guids`) |
| `diff` | Compare a file against the live collection |
| `sync` | Reconcile a file with the live collection |
| `preview` | Open Anki's browser on a query |
| `profile` | Manage named AnkiConnect URL profiles |
| `models` / `fields` / `tags` / `note-info` | Schema discovery |
| `sample` | Random sample of notes (deterministic with `--seed`) |
| `schema-validate` | Validate a file against the LIVE collection's schema |
| `checkpoint` / `rollback` / `audit-log` | Recovery & observability |
| `doctor` | Verify environment is ready |
| `completion` | Shell completion script (bash/zsh/fish/powershell) |

Run `anki-xml --help` for the full surface, or `anki-xml <command> --help`
for per-command flags.

## Global flags

```sh
--url <url>             AnkiConnect endpoint (default http://127.0.0.1:8765)
--json                  Emit JSON envelope (machine-readable)
--json-legacy           Emit legacy JSON shape (pre-v1)
--format <ndjson>       Stream one JSON record per line
--dry-run               Validate and report; do not mutate
--quiet                 Summary only (no per-op detail)
--no-color              Strip ANSI color from output
--profile <name>        Use a named profile from .anki-xmlrc / config.toml
--batch-id <id>         Wrap writes in a named batch
--rollback-on-partial   Auto-rollback the batch on any failure
--idempotency-key <k>   Skip if this key was already completed successfully
--config <path>         Use a custom config file
--help, -h              Show help
--version, -v           Print version
```

## Configuration

`anki-xml` reads from three locations, in order:

1. `--config <path>` (if given)
2. `./.anki-xmlrc` in the current directory
3. `$XDG_CONFIG_HOME/anki-xml/config.toml`

```toml
# .anki-xmlrc
url     = "http://10.0.0.42:8765"
profile = "work"
format  = "ndjson"
dry_run = true
```

## Reliability

`anki-xml` is built for autonomous agents. The agent's full loop:

```
DISCOVER  →  models / fields / tags / decks
INSPECT   →  note-info / search / sample
VALIDATE  →  validate / schema-validate
PLAN      →  plan / diff
PREVIEW   →  plan --format ndjson --dry-run
APPLY     →  import / update / tag / delete / sync
VERIFY    →  search --id ...
ROLLBACK  →  checkpoint + rollback (or auto via --rollback-on-partial)
RECOVER   →  --resume-from (M11) or --idempotency-key (M10)
```

Every write is recorded in `~/.local/share/anki-xml/audit.log` (JSONL).
Every checkpoint is a JSON snapshot at
`~/.local/share/anki-xml/checkpoints/<name>.json`.

## Documentation

- [`docs/commands.md`](docs/commands.md) — full command reference
- [`docs/field-names.md`](docs/field-names.md) — XML ↔ Anki field name map
- [`docs/ai-integration.md`](docs/ai-integration.md) — agent workflow guide
- [`docs/ai-cookbook.md`](docs/ai-cookbook.md) — five-loop agent pattern
- [`docs/architecture-review.md`](docs/architecture-review.md) — design rationale
- [`docs/roadmap.md`](docs/roadmap.md) — what's done, what's deferred
- [`docs/extension-policy.md`](docs/extension-policy.md) — when to extend
- [`docs/schema-v2.md`](docs/schema-v2.md) — schema v2 design spec

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)

## Project status

Active. 420+ tests passing. See [CHANGELOG.md](CHANGELOG.md) for
the version history and [`docs/roadmap.md`](docs/roadmap.md) for
the future.