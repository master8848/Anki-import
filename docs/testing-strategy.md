# Testing strategy

## Setup

- **Vitest 3** (`vitest run`), configured in `vitest.config.ts`:
  `include: ["tests/**/*.test.ts", "packages/**/tests/**/*.test.ts"]`,
  excluding `node_modules` and `dist`. All 20 test files currently live
  in the root `tests/` directory; package-local `tests/` dirs are
  supported for the future.
- Tests import workspace packages directly (`@anki-xml/*`), so they
  exercise the monorepo source, not the bundle.
- No test uses a live AnkiConnect server.

## The mock-all-AnkiConnect principle

AnkiConnect is never contacted. `AnkiClient` accepts `fetchImpl` in its
constructor options (also threaded through `buildPlan`, `applyPlan`,
`planFile`, `diffFile`, `syncFile`, `watchFile`, `runDoctor`, MCP
tools, and the rollback/stats/tags/media packages). Every test that
touches Anki builds a client (or passes `fetchImpl`) whose fetch
handler:

1. parses the request body (`{ action, version: 6, params }`),
2. records the action (asserted later — e.g. `canAddNotes`,
   `updateNoteFields`, `storeMedia` payload checks),
3. returns a canned `{ result, error: null }` envelope.

This makes every test deterministic and offline, and it enforces the
architecture rule that only `packages/anki` knows how to talk to
AnkiConnect.

## Test inventory (20 files, `tests/`)

| File | Tests | Covers |
|---|---|---|
| `parser.test.ts` | 9 | `parseDocument`: legacy short tags, `<field name=>` + nested `<deck>` + `<tag>` children, CDATA, version gate, unknown elements, error cases |
| `validator.test.ts` | 5 | `validateNotes`/`formatValidationError`: valid Basic, missing fields with line info, empty deck, Cloze/optional-reversed rules |
| `stream.test.ts` | 30 | `parseXmlStream`: whole-doc and chunked streaming, note numbering, CDATA across chunk boundaries, validate-per-note |
| `ankiconnect.test.ts` | 17 | `AnkiClient` request/response contract: `canAddNotes`, `updateNoteFields`, `storeMedia` base64, `retrieveMedia`, `addTags`/`removeTags` string joining, batching, envelope-error handling |
| `diagnose.test.ts` | 7 | `classifyConnectError`: ECONNREFUSED→`refused` with add-on hints, timeouts, `bad-json`, HTTP; `diagnose()` result paths |
| `planner.test.ts` | 7 | `buildPlan`/`toAnkiConnectNote`: id-targets vs candidates, `notesInfo`-driven update/unchanged/add, `canAddNotes`-driven add/duplicates |
| `diff.test.ts` | 11 | `diffTags`, `diffDecks`, `diffNote`, `diffNoteLists` matching by id/number |
| `sync.test.ts` | 11 | `applyPlan` deck creation + add/update + checkpoint write (XDG_DATA_HOME redirected to tmp), `driftFromCheckpoint` |
| `checkpoint.test.ts` | 12 | checkpoint create/list/load/delete, id generation, XDG_DATA_HOME redirect |
| `cli.test.ts` | 7 | `main()`: version, help, validate ok/fail, unknown commands (exit 2), checkpoint create/list/load + rollback dry-run (no network in dry-run) |
| `cli-formats.test.ts` | 8 | CLI error paths in JSON (`VALIDATION_ERROR` envelopes) and per-format dry-run imports: yaml, csv with `--deck`, markdown; unsupported-format error; `--json` stdout purity (logger silenced) |
| `config.test.ts` | 10 | `CONFIG_FILE_NAMES` precedence, `findConfig` walk-up, `loadConfig` json/yaml parsing, missing config → `{}` |
| `mcp.test.ts` | 17 | `parseRequest` (valid/invalid/notifications), tool list contents + tiers, `validate_xml` on a temp file, `plan_import` against mocked collection, `add_note` payload + `McpToolError` on missing params, media base64 round-trip, `toolErrorData` hints |
| `importer.test.ts` | 2 | importer plugin registry: format resolution + built-in importers |
| `media.test.ts` | 6 | `storeMedia`/`storeMediaFile`/`retrieveMediaToFile`/`deleteMedia`/`listMedia` against a mocked client |
| `tags.test.ts` | 6 | `parseTagList`, `listTags` sorting, chunked `addTags`/`removeTags` batching |
| `stats.test.ts` | 4 | `deckStats` single/all decks, `collectionStats` totals (notes via `findNotes`) |
| `utils.test.ts` | 3 | shared utils (hashes, retries, formatting) |
| `launch.test.ts` | 4 | `ankiLaunchCommand` platform commands (macOS/Windows/Linux/unknown) |
| `watch.test.ts` | 2 | `watchFile`: debounce + re-queue during apply, apply on change |

Keep this table in sync when adding a test file (name it
`tests/<thing>.test.ts` mirroring `packages/<pkg>/src/<thing>.ts`).

## fixtures / goldens / snapshots

The `tests/fixtures/`, `tests/goldens/`, and `tests/snapshots/`
directories do not exist yet. Intended use:

- `fixtures/` — shared input documents for parser/validator/stream
  tests (large or tricky XML, CDATA edge cases, per-format examples);
- `goldens/` — expected outputs for diff/plan/export serializations,
  checked byte-for-byte;
- `snapshots/` — Vitest inline/file snapshots for JSON envelopes and
  diagnostic text that is asserted stable.

Today the tests create inputs inline or via `mkdtemp` temp files, and
point `XDG_DATA_HOME` at temp dirs for checkpoint tests.

## Coverage areas

parser formats (XML full + stream, YAML, JSON, CSV, Markdown),
validation rules, planner, diff, rollback (dry-run path), sync
(applyPlan + drift), mcp (protocol + tools + error data), cli (exit
codes, JSON envelopes, stdout purity, per-format imports), diagnostics
(cause classification + hints), plugins (registry-driven format
resolution is covered indirectly via cli-formats; plugin extension
points themselves have no dedicated test file yet).

## Quality gates

Every change must pass, in order:

```sh
bun run test && bun run typecheck && bun run build && node dist/cli.js --version
```

(`lint` is an alias of `typecheck`.) The build gate verifies the
rslib bundle still produces a working `dist/cli.js`.

## CI matrix

`.github/workflows/test.yml` runs on **all branches** (push + PR):
Ubuntu, Node **20 and 22** (matrix), bun 1.4.33.0. Steps:

1. checkout → bun setup → node setup (bun cache)
2. `bun install --frozen-lockfile`
3. `bun run test`
4. `bun run typecheck`
5. `bun run build`
6. `node dist/cli.js --version`
7. `node dist/cli.js --help`
8. `node dist/cli.js plan examples/cards.yaml --dry-run --json` (smoke
   test that the YAML plugin path works end-to-end on the bundle)
