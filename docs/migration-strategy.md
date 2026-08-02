# Migration strategy

Two distinct migrations: (a) the v0.0.3 → v0.0.4 codebase restructure,
and (b) moving a real user's Anki collection into anki-xml-managed
files.

## (a) v0.0.3 → v0.0.4: single package → 18-package monorepo

v0.0.3 shipped one flat package (`src/`) with layered dirs and 6
commands. v0.0.4 is a pnpm 10 workspace: `packages/*` (18), `apps/
playground`, root `tests/`, and a single esbuild bundle
(`dist/cli.js`). The public CLI binary and the XML schema are
unchanged; internals moved.

### File mapping (old `src/` → new location)

| v0.0.3 | v0.0.4 |
|---|---|
| `src/index.ts`, `src/cli/run.ts`, `src/cli/args.ts`, `src/cli/help.ts` | `packages/cli/src/{index,run,args,help}.ts` + new `packages/cli/src/errors.ts` |
| `src/cli/commands/{doctor,validate,import,checkpoint,rollback,benchmark}.ts` | `packages/cli/src/commands/` (same six + `plan`, `diff`, `sync`, `watch`, `tags`, `models`, `stats`, `media`, `mcp`) |
| `src/anki-connect.ts`, `src/anki/ankiconnect.ts` | `packages/anki/src/ankiconnect.ts` (+ new `errors.ts` for diagnostics) |
| `src/anki/models.ts` | `packages/models/src/anki.ts` (introspection) |
| `src/parser/{cdata,tokenize,xml-parser,xml-stream}.ts` | `packages/parser/src/` (+ new `structured.ts`, `yaml-parser.ts`, `json-parser.ts`, `csv-parser.ts`, `markdown-parser.ts`) |
| `src/validation/schemas.ts`, `src/core/validator/validate.ts` | `packages/validation/src/{schemas,validate}.ts` |
| `src/types.ts`, `src/types/index.ts` | `packages/utils/src/types.ts` (+ `files.ts`, `hash.ts`, `retry.ts`, `format.ts`) |
| `src/utils/logger.ts` | `packages/logger/src/logger.ts` |
| `src/core/checkpoint/checkpoint.ts`, `src/checkpoints.ts` | `packages/checkpoint/src/checkpoint.ts` |
| `src/core/rollback/rollback.ts` | `packages/rollback/src/rollback.ts` |
| `src/core/importer/import.ts` | `packages/core/src/importer/import.ts` |
| `src/core/doctor.ts`, `src/doctor.ts` | `packages/core/src/doctor.ts` |
| `src/plugins/types.ts`, `src/plugins/xml-plugin.ts`, `src/plugins.ts` | `packages/core/src/plugins/{types,registry,xml-plugin,exporter-json}.ts` |
| `src/plan.ts`, `src/sync.ts`, `src/diff.ts`, `src/import.ts`, `src/validate.ts` | `packages/core/src/{plan,sync-file,diff-file}.ts` + `packages/planner/src/planner.ts`, `packages/diff/src/diff.ts`, `packages/sync/src/sync.ts` |
| `src/batch.ts`, `src/config.ts`, `src/tag.ts`, `src/tags.ts`, `src/media.ts`, `src/stats.ts` | `packages/utils/src/retry.ts` (chunking), `packages/config/src/config.ts`, `packages/tags/src/tags.ts`, `packages/media/src/media.ts`, `packages/stats/src/stats.ts` |
| `scripts/build.mjs` (+ `build.ts`, `build-npm.ts`, `publish-check.ts`) | `scripts/build.mjs` only |
| v0.0.2-era commands (search/update/migrate/decks/export/…) | already removed in v0.0.3; not restored |

Everything under `src/cli/commands/*` remains argv-and-output-only:
business logic moved to `core`/`planner`/`diff`/`sync` packages, and
only `packages/anki` may contact AnkiConnect.

### Behavior changes

- **`import` rejects notes with `id=`** (update targets). This existed
  in v0.0.3 ("import creates notes only") but there was no escape
  hatch; v0.0.4 adds **`sync`** as the create + update reconciliation
  command, and the error message now says *use 'sync'*.
- **`doctor` requires AnkiConnect API ≥ 6** (the client always speaks
  `version: 6`; older add-ons fail the `anki-connect-version` check).
- **`--json` stdout purity** — a single JSON document on stdout, logs
  on stderr; the logger is silenced under `--json`. Envelopes are
  `ok`-rooted and error envelopes carry stable `code`
  (`VALIDATION_ERROR`, `XML_PARSE_ERROR`, `ANKICONNECT_ERROR`,
  `USAGE_ERROR`, `FATAL`).
- **Error envelopes carry `cause`/`hints`/`suggestion`** for
  `ANKICONNECT_ERROR` (stable causes: `refused | timeout | http |
  bad-json | network | ok | unknown`).
- **New formats**: YAML, JSON, Markdown, CSV map onto the same note
  model; XML remains canonical.
- **New commands**: `plan`, `diff`, `sync`, `watch`, `tags`, `models`,
  `stats`, `media`, `mcp` (15 total) and **MCP** over stdio (17 tools).
- **Plugin API**: `registerImporter` / `registerExporter` /
  `registerValidator` / `registerTransformer` with built-in importers
  and a JSON exporter.
- **Checkpoint location unchanged**: `$XDG_DATA_HOME/
  anki-import/checkpoints` (`~/.local/share/...` default) — existing
  checkpoints from v0.0.3 keep working, and `rollback` remains
  byte-compatible with their shape (`{id, deck, created, noteIds}`).
- **Build**: esbuild single bundle, external `yaml`/`csv-parse`;
  startup ≈ 25 ms, ≈ 150 KB.
- **Removed**: the v0.0.3-era `src/` layout, Bun-only scripts, and the
  duplicate "safe-import" entry points (already gone in v0.0.3).

## (b) Moving a real Anki collection into anki-xml

The target state: your flashcards live in XML (or YAML/JSON/CSV/MD)
files in a git repo, and Anki is the runtime. anki-xml is not a review
app or a GUI automation tool — it only moves data in and out of an
AnkiConnect-served collection, and tracks what it did via checkpoints.

1. **Export decks from Anki.** Use Anki's own export (a `.apkg`/text
   export) to get field values out, or work directly from existing
   notes: `anki-import` can read the collection through `models`,
   `stats`, `find_notes`, and `diff` — and the recommended
   reconciliation path is `sync`: once your XML exists, `sync <file>`
   creates missing notes and updates differing fields, while
   `diff <file>` shows exactly what differs first.
2. **Author XML.** One `<note>` per flashcard (see `language.md` /
   `xml-cookbook.md`). Use CDATA for HTML/math-heavy content; entities
   are never decoded in field content.
3. **Plan first.** `plan <file>` (or `--dry-run`) previews
   add/update/duplicate/unchanged against the live collection without
   mutating anything.
4. **Import with a checkpoint.** `import <file>` creates notes only
   and writes a checkpoint (id like `import-<timestamp>`), so every
   batch is undoable.
5. **Rollback mistakes.** `rollback <checkpoint-id>` deletes exactly
   the notes from that import (dry-run first with `--dry-run`).
6. **Sync for updates.** Edit the XML, then `sync <file>`: creates new
   notes, updates changed fields/tags of notes matched by content
   (notes without `id` are gated by `canAddNotes`; notes with `id` are
   update targets), and reports drift when run without a file.
7. **Commit the files.** The XML/YAML files are the source of truth
   ("Git for Anki knowledge"); checkpoints are machine state.

### Migrating between formats

XML → YAML/JSON is **not lossless**: the structured formats carry the
same in-memory note model, but line/offset diagnostics
(`sourceOffset`, `fieldSourceOffsets`, `line`), per-note XML ordering,
and exact CDATA/entity byte-preservation exist only in the XML path.
For lossless round-trips and precise error locations, **keep XML
canonical**. Scripts that must convert can use the parser packages
directly (`parseDocument` / `parseYaml` / `parseJson` / `parseCsv` /
`parseMarkdown` all produce `ParsedNote[]`; `JsonExporterPlugin`
serializes `ValidatedNote[]` back out).

### How AI agents should adopt it

- **`doctor` first** — one call tells the agent whether Anki is
  running, AnkiConnect is reachable (API ≥ 6), decks/models exist, and
  MathJax is installed, with ordered fix `hints` when not.
- **`--json` everywhere** — single JSON document on stdout, stable
  `ok`/`error.code` envelopes; branch on `code`, never on `message`.
- **Stable codes**: `VALIDATION_ERROR`, `XML_PARSE_ERROR`,
  `ANKICONNECT_ERROR` (with `cause`/`hints`/`suggestion`), `USAGE_ERROR`,
  `FATAL`.
- **MCP as the agent surface** — `anki-import mcp` exposes 17 tools
  (doctor, list_decks, plan_import, import_xml, diff, sync, …) over
  stdio with the same error envelope in `error.data`.
- **Safe loop**: `plan --json` → `import --dry-run --json` → `import
  --checkpoint <id>` → verify with `diff`/`stats` → `rollback` on
  failure. Use `sync` (not `import`) for id-tagged updates.
