# Changelog

All notable changes to `anki-xml` / `anki-import` are documented here.

## [Unreleased]

### Changed
- No unreleased changes yet.

## [0.0.6] — 2026-08-30

### Added
- **`anki-sync` command** (`cloud-sync` / `sync-anikiweb` aliases) — single command to check AnkiConnect reachability, AnkiWeb authentication, and trigger `sync` to AnkiWeb so cards reach the phone. `--check` is reachability-only (no sync); `--json` returns `{ok, reachable, authenticated, synced, cause, detail, hints}`. When not logged in, exits 1 with `cause: "auth"` and `Not authenticated — Tools → Preferences → Syncing → Log in` (skill `AnkiWeb sync — will it reach your phone?` documents the workflow).
- **Cloze documentation in skill** — `skills/anki-import-cli/SKILL.md` now documents `Cloze` (`<text>` must contain `{{cN::...}}`, `<extra>` optional, `c1`/`c2` card creation, hint `{{c1::answer::hint}}`, `c1,2` warning for Anki 25.09).

### Changed
- **Pinned dependencies** to exact versions (`csv-parse 5.6.0`, `fast-xml-parser 5.11.1`, `valibot 1.4.2`, `yaml 2.9.0`, `@types/node 22.20.1`, `@rslib/core 0.20.3`, `tsx 4.23.13`, `typescript 5.9.3`, `vitest 3.2.7`) for supply-chain security; `bun.lock` updated accordingly.
- **AnkiConnect diagnostics** — new stable cause `auth` (`packages/anki/src/errors.ts`) with `authDiagnosis()` / `isAuthErrorMessage()`; `AnkiClient.sync()` classifies `sync: auth not configured` and related messages as `auth` with ordered hints. Documented in `AGENTS.md` and `docs/cli-design.md`.
- Docs: `README.md` / `AGENTS.md` / `docs/cli-design.md` / `docs/README.md` / `docs/install.md` updated for 17 commands and `v0.0.6`.

## [0.0.5] — 2026-08-30

### Added
- **`open` command** — launch the Anki desktop app from the CLI
  (macOS: `open -a Anki`, Windows: `start "" "Anki"` / `anki.exe`,
  Linux: `anki`); detached and non-blocking. MCP `open_anki` tool
  exposes the same action for agents.
- **Platform-aware launch hints** — every "connection refused"
  diagnostic (doctor, CLI errors, MCP) now names the exact command
  to start Anki on the current OS, plus `anki-import open` as the
  one-command option.
- **MCP `sync` tool parity** — the `sync` tool now mirrors the CLI
  (`batch_size`, `allow_duplicate`, `auto_create_deck`, `deck`,
  `model`) and its drift report returns `missingIds`; promoted from
  P2 to P1 so agents can reconcile (create + update) directly.

### Changed
- **Package manager: pnpm → bun.** `pnpm-workspace.yaml` and `pnpm-lock.yaml` removed; `package.json` now declares `workspaces` and `packageManager: bun@1.4.0` with `bun.lock`. All docs, `CONTRIBUTING.md`, `AGENTS.md`, and install instructions updated to `bun install` / `bun run build` / `bun run test`.
- **Build: esbuild → rslib.** `esbuild` removed; `@rslib/core` added with `rslib.config.ts` (bundle ESM via Rspack, banner shebang, external `yaml` + `csv-parse`, target `node`, syntax `es2022`). `scripts/build.mjs` removed; `package.json` `build` now `rslib build && chmod +x dist/cli.js`.
- **CI removed.** `.github/workflows/test.yml` deleted; project is deployed manually (`npm publish`) for now.
- **Skills split into two:** `skills/anki-import-cli/` (CLI — the
  recommended interface) and `skills/anki-import-mcp/` (MCP subset
  with the tool table and MCP-vs-CLI gaps). Both kept small and
  self-contained; shared examples moved under
  `skills/anki-import-cli/examples/`.
- **Docs conflict cleanup** — canonical counts fixed everywhere
  (16 commands, 18 tools, 20 test files, 178 tests); `docs/install.md`
  rewritten for the monorepo (Node 20+, rslib ESM bundle, npm not
  published yet); legacy docs (`docs/cli.md`, `docs/commands.md`,
  `docs/roadmap.md`, `docs/ai-integration.md`, `REPO_SETUP.md`) now
  carry banners pointing at the canonical docs; `CONTRIBUTING.md` §4
  gains a full "keep every surface in sync" checklist and a new §4.4
  "Adding an MCP tool"; §7 doc-policy table now names canonical docs
  only.

## [0.0.4] — 2026-08-02

**Monorepo restructure.** `src/` becomes an 18-package pnpm workspace
(`packages/*`), plus `apps/playground` and root-level `tests/`.

### Added
- **New commands:** `plan` (dry-run preview), `diff` (per-note field
  diffs), `sync` (create + update + checkpoint drift), `watch`
  (change → validate → confirm → apply), `tags`, `models`, `stats`,
  `media`, `mcp` — 15 commands total
- **New formats:** YAML, JSON, Markdown, CSV importers (XML stays
  canonical; all formats map onto the same note model)
- **Plugin API:** `registerImporter` / `registerExporter` /
  `registerValidator` / `registerTransformer` with built-in importers
  (xml/yaml/json/csv/markdown) and a JSON exporter
- **MCP server** over stdio (SDK-free JSON-RPC 2.0, 17 tools,
  P0/P1/P2 tiering); tool errors carry cause/hints/suggestion
- **AnkiConnect diagnostics:** stable causes (`refused | timeout |
  http | bad-json | network | unknown`) with ordered fix steps
  (start Anki, install add-on `2055492159`, check `--url`, …);
  exposed in `doctor`, every CLI error path, `--json`, and MCP
- **New packages:** planner, diff, sync, tags, media, stats, config
  (`anki.config.json/yaml/yml` discovery), mcp
- AnkiClient methods: `canAddNotes`, `updateNoteFields`, `storeMedia`,
  `retrieveMedia`, `deleteMedia`, `mediaList`, `getTags`, `addTags`,
  `removeTags`, `cardCounts`, `modelFieldNames`, `modelTemplates`,
  `diagnose`
- `--json` guarantees stdout purity (single JSON document, logs on
  stderr; stable `error.code` on all paths)

### Changed
- `import` rejects notes with `id=` (update targets) — use `sync`
- `doctor` requires AnkiConnect API ≥ 6
- Error envelopes now include `cause`/`hints`/`suggestion` for
  ANKICONNECT_ERROR
- Build: single esbuild bundle from `packages/cli/src/index.ts`
  (external: chokidar/yaml/csv-parse); startup ≈ 25 ms, ≈ 150 KB
- CI runs on all branches; smoke-tests `plan` on a YAML example

### Removed
- `src/` single-package layout (see `docs/migration-strategy.md`)

## [Unreleased]

### Changed
- Refactored `skills/anki-import/` for npm-only users: self-contained
  `SKILL.md` (workflow → commands → schema → validation → rollback),
  no repo-path references (`schema/anki.xsd`, `CHANGELOG.md`, etc.)
- Slimmed root `README.md`; contributor/from-source and skill
  maintenance rules live in `CONTRIBUTING.md` §13

### Added
- `skills/anki-import/examples/commands.md` — runnable CLI examples
- `skills/anki-import/examples/latex.xml` — `[latex]`, MathJax, HTML math
- `skills/anki-import/examples/code-and-escapes.xml` — code, entities, CDATA
- `skills/anki-import/examples/update-and-delete.md` — delete/replace via
  `checkpoint` + `rollback` (+ re-import; no `update` command yet)

### Removed
- `skills/anki-import/references/commands.md`
- `skills/anki-import/references/xml-schema.md`
- Sibling `skills/anki-import/examples.md` (examples live under `examples/`)

## [0.0.3] — 2026-07-30

**XML-first architecture rewrite.** Breaking CLI surface change:
commands reduced to `doctor`, `validate`, `import`, `checkpoint`,
`rollback`, `benchmark`. XML interchange format is preserved (legacy
short tags + `<field name>` / nested `<deck>` / `<tag>`).

### Added
- Streaming import (`--stream`) and configurable `--batch-size`
- Valibot validation schemas with line-aware errors
- `schema/anki.xsd`
- `benchmark` command
- `ImportPlugin` interface (XML built-in)
- Node 20+ native build via esbuild (`pnpm build` → `dist/cli.js`)
- Vitest test suite (`parser`, `validator`, `stream`, `cli`)
- Bin aliases: `anki-import` and `anki-xml`
- pnpm as the package manager; `minimum-release-age=20160` (14 days)

### Changed
- Layered layout: `cli/` · `core/` · `parser/` · `anki/` · `validation/`
- Simplified checkpoints: `{ id, deck, created, noteIds }`
- Logging levels: error / warn / info / debug
- Skill rewritten for agents (no internals)

### Removed
- Duplicate “safe-import” entry points and shell wrappers
- Bun-only APIs and Bun-only build scripts
- Large optional command surface (search/update/migrate/… deferred)

## [0.0.2] — 2026-07-30

**Resilience + extensibility release.** 34 commands ship, 426 tests
pass. No breaking changes to `--json` envelope (`version: 1`); all
additions are opt-in.

---

## Highlights

- **AnkiConnect resilience**: configurable `timeoutMs`, automatic
  retry with exponential backoff (`maxRetries`, `backoffMs`) for
  transient network errors. Uses `AbortController` for proper
  cancellation.
- **Dynamic custom model registry**: `registerModel()` and
  `createCustomModel()` let consumers add new note types at runtime.
  XML parser integrates model-aware field validation and surfaces
  warnings on unknown element tags for built-in models.
- **Media ingestion in `import`**: `<img src="…">` and `[sound:…]`
  references in note fields are now uploaded via `storeMediaFile` as
  part of the same import workflow. Missing files are skipped, not
  fatal.
- **`id` is a first-class attribute** during XML parsing — promotes
  it to a regular field for cleaner downstream handling.

## Reliability

- **`checkpoints`**: empty checkpoints are now valid markers (used as
  the create-only snapshot path) and the `withBatch` flow is unified.
  Full note info (`deckName`, `modelName`, fields, tags) is captured
  via `notesInfo` for accurate rollback.
- **`config`**: switched to the `@iarna/toml` parser (was hand-rolled)
  for stricter handling of malformed TOML.

## Tests

- 426 passing (was 430 → reorganised into new files, see
  `tests/batch.test.ts`, `tests/checkpoints.test.ts`).

## Documentation & ecosystem

- **`AGENTS.md`** — new top-level project guide for AI coding tools
  and human reviewers (architecture, constraints, quality gates,
  anti-patterns).
- **`CONTRIBUTING.md`** — expanded with the developer workflow.
- **`skills/anki-import/`** — new skill for
  [skills.sh](https://skills.sh): `SKILL.md`, two example XML
  decks, `commands.md` / `xml-schema.md` references, and a
  `safe-import.sh` wrapper script.

## Breaking changes

None. The `--json` envelope (`version: 1`) and every existing CLI
flag are unchanged.

## [0.0.1] — 2026-07-28

**First public release.** 34 commands ship, 430 tests pass, every
Phase 1..4 + M1..M22 milestone is `✅ shipped` (see
[`docs/roadmap.md`](./docs/roadmap.md)). The CLI is feature-complete
for AI agents and human authors who want a deterministic, idempotent,
recoverable bridge to Anki via AnkiConnect.

---

## Highlights

- **34 commands** in 7 surface groups, every one supports `--json`,
  `--dry-run`, and the JSON envelope contract (`version: 1`).
- **AI-first design**: stable error codes, recovery matrix,
  atomic-batch wrapper (`--batch-id` + `--rollback-on-partial`),
  idempotency keys, and resume-from-checkpoint for network drops.
- **Strict XML boundary handling** for AI-authored files: rejects
  malformed closing tags, bare `&`, and mismatched field close tags
  *before* they corrupt Anki.
- **HTML / CDATA / LaTeX** preserved verbatim; CDATA sections survive
  intact through round-trip; native Anki `[latex]...[/latex]` works
  out of the box; MathJax `\(...\)` / `\[...\]` requires the MathJax
  add-on (`anki-xml addon install 1610307553`).
- **`doctor` command** checks connectivity, AnkiConnect version,
  collection health, **and** add-on presence (auto-detects MathJax).
- **`addon` command** lists, installs, enables, disables, and checks
  Anki add-ons through AnkiConnect's `getAddons` / `installAddon` /
  `toggleAddon`.
- **Three install paths**: Bun standalone binary, npm (`npx
  anki-xml` / `npm i -g anki-xml`), and source (`bun run src/index.ts`).

---

## System requirements

| Component | Minimum | Notes |
|---|---|---|
| Anki (desktop) | 2.1.49+ | Required; older Anki may lack AnkiConnect support |
| AnkiConnect | 2.1.49+ (API version 5+) | Bundled as an Anki add-on; ships the JSON-RPC endpoint at `http://127.0.0.1:8765` |
| Bun (for source / standalone build) | latest | https://bun.sh |
| Node.js (for npm distribution) | ≥ 18 | Tested on Node 18, 20, 22 |
| OS | macOS, Linux, Windows | Same matrix Anki supports |

**Known AnkiConnect version differences:**

- AnkiConnect **< 2.1.55** does **not** expose `getAddons` /
  `installAddon` / `toggleAddon`. `doctor` reports `addons-queryable:
  failed` on those builds, and `addon install` errors with
  `unsupported action`. Upgrade AnkiConnect (Tools → Add-ons →
  Check for Updates) to enable add-on management.
- All other commands work on every AnkiConnect ≥ 2.1.49.

---

## Supported Anki note types

`anki-xml` ships a registry-driven validator for every model Anki
ships by default:

| XML `<note type="…">` | Anki note type | Required fields | Optional fields |
|---|---|---|---|
| `Basic` | Basic | `<front>`, `<back>` | — |
| `Basic (and reversed card)` | Basic (and reversed card) | `<front>`, `<back>` | — |
| `Basic (optional reversed card)` | Basic (optional reversed card) | `<front>`, `<addReverse>` | `<extra>` |
| `Basic (type in the answer)` | Basic (type in the answer) | `<front>`, `<back>` | — |
| `Cloze` | Cloze | `<text>` (must contain `{{c1::…}}`) | `<extra>` |

Custom note types (P4.2) are reachable through AnkiConnect's
`createModel` API; declaring them in `<meta>` blocks is future work
(see Deferred below).

---

## Read / Query commands (11)

| Command | What it does |
|---|---|
| `validate <file>` | Static XML validation; no network |
| `plan <file>` | Predict what `import` would do (uses `canAddNotes`) |
| `decks` | Every deck with own and descendant card counts |
| `stats` | Card state counts (new / learn / review / suspended / buried); `--field <name>` reports field cardinality (M6) |
| `search [phrase]` | Full-text search with deck/tag/structured filters |
| `export <file>` | Emit round-trippable XML from the live collection |
| `diff <file>` | Compare a file against the live collection |
| `preview` | Open Anki's browser on a query (uses `guiBrowse`) |
| `sample <N>` | Deterministic random sample (M4) |
| `schema-validate <file>` | Static + live schema drift detection (M5) |
| `doctor` | Connectivity, version, collection, and add-on checks (M13) |

## Write commands (12)

| Command | What it does |
|---|---|
| `import <file>` | Create notes from XML; `--allow-duplicate`, `--resume-from` (M11), `--batch-id` + `--rollback-on-partial` (M9), `--idempotency-key` (M10) |
| `update` | Change fields/tags on existing notes; `--rename-field Old=New` (M12) |
| `tag <tag>` / `untag <tag>` | Add or remove tags by query / by ids |
| `delete` | Delete notes by query / by ids (requires `--yes`) |
| `rename-deck <old> <new>` | Rename a deck (does not move child decks) |
| `delete-deck <name>` | Delete a deck (with or without cards) |
| `move-notes <deck>` | Move notes to a target deck |
| `suspend` / `unsuspend` / `bury` | Card scheduling helpers |
| `sync <file>` | Three-way reconcile a file against the live collection |

## Schema discovery (4)

| Command | What it does |
|---|---|
| `models` | Every note model with its fields and templates (M1) |
| `fields <model>` | Field names for one model (M1) |
| `tags` | Every tag in the collection with note counts (M1) |
| `note-info <id>` | Full info on one note (M1) |

## Lifecycle (2)

| Command | What it does |
|---|---|
| `migrate <subcommand>` | Apply schema-migration transforms (`assign-guids`, `v1-to-v2`) (P4.7) |
| `profile <subcommand>` | Named AnkiConnect URL profiles: `add`, `list`, `remove`, `default`, `show` (P4.10) |

## Recovery (3)

| Command | What it does |
|---|---|
| `checkpoint <subcommand>` | Capture / list / show / delete note snapshots for safe rollback (M2) |
| `rollback --to <name>` | Restore a checkpoint (undo a previous destructive operation) (M3) |
| `audit-log` | Recent JSONL audit-log entries (every write op records one line) |

## Add-ons (1)

| Command | What it does |
|---|---|
| `addon <subcommand>` | Manage Anki add-ons via AnkiConnect: `list`, `install <code>`, `enable <code>`, `disable <code>`, `check`. Auto-detects the MathJax add-on (AnkiWeb code `1610307553`). |

## Shell (1)

| Command | What it does |
|---|---|
| `completion <shell>` | Print a shell completion script: `bash`, `zsh`, `fish`, `powershell` (P1.10) |

**Total: 34 commands.**

---

## Global flags

Every command accepts these flags. Defaults are chosen to be safe for
human use; AI agents should pass `--json` and a unique
`--idempotency-key`.

| Flag | Purpose |
|---|---|
| `--url <url>` | AnkiConnect endpoint (default `http://127.0.0.1:8765`) |
| `--json` | Emit JSON envelope (machine-readable) |
| `--json-legacy` | Emit legacy JSON shape (raw payload, pre-v1) |
| `--format <default \| ndjson>` | One record per line for streaming |
| `--dry-run` | Validate and report; never contact AnkiConnect |
| `--quiet` | Summary only; no per-op detail |
| `--no-color` | Strip ANSI color from output |
| `--profile <name>` | Use a named profile from `.anki-xmlrc` / `config.toml` |
| `--batch-id <id>` | Wrap writes in a named atomic batch |
| `--rollback-on-partial` | Auto-rollback the batch on any failure |
| `--idempotency-key <key>` | Skip if this key already succeeded |
| `--config <path>` | Use a custom config file |
| `--help`, `-h` | Show help |
| `--version`, `-v` | Print the version |

## Exit codes

| code | meaning |
|---|---|
| `0` | Success — every operation completed cleanly |
| `1` | Partial failure (some operations succeeded, some failed) |
| `2` | Fatal — file unreadable, malformed XML, no AnkiConnect, unknown command |

---

## JSON envelope contract (`version: 1`)

Every command that supports `--json` returns one of two envelope
shapes. This is the contract AI agents code against. **Never branch on
`message` — always branch on `code`.**

### Success envelope

```json
{
  "version": 1,
  "command": "search",
  "data": { /* command-specific */ }
}
```

### Error envelope

```json
{
  "version": 1,
  "command": "import",
  "ok": false,
  "error": {
    "code": "XML_PARSE_ERROR",
    "message": "Unterminated CDATA at line 47",
    "location": { "line": 47, "column": 12 }
  }
}
```

### Stable error codes

| Code | Source | Meaning | Retryable? |
|---|---|---|---|
| `ARG_MISSING` | CLI | A required positional / flag was omitted | no |
| `ARG_INVALID` | CLI | A flag value failed validation | no |
| `FILE_NOT_FOUND` | CLI | The input path does not exist | no |
| `FILE_READ_ERROR` | CLI | The input path could not be read | no |
| `XML_PARSE_ERROR` | CLI | File is malformed XML | no |
| `VALIDATION_ERROR` | CLI | Notes failed structural validation | no |
| `ANKICONNECT_ERROR` | Network | AnkiConnect returned an error envelope | sometimes |
| `NETWORK_ERROR` | Network | Cannot connect to AnkiConnect | yes |
| `UNKNOWN_COMMAND` | CLI | The verb is not a registered command | no |
| `UNKNOWN_SHELL` | CLI | `completion <shell>` got an unknown shell | no |
| `UNKNOWN_ERROR` | CLI | Unexpected crash | no |

Within envelope `version: 1`:

- **Existing keys never removed.** A key may be deprecated but is never
  removed without a major version bump.
- **New keys may be added.** Agents should ignore unknown keys.
- **Enum values may grow.** Treat unknown values as "skip and log."

---

## Cross-cutting features

- **XML v1 schema** with strict boundary handling (rejects malformed
  closing tags, bare `&`, mismatched field tags). See
  [`tests/xml.test.ts`](./tests/xml.test.ts).
- **HTML / CDATA / LaTeX** — fields accept inline HTML markup
  preserved verbatim; CDATA sections survive intact; native Anki
  `[latex]...[/latex]` renders without an add-on; MathJax
  `\(...\)` / `\[...\]` requires the MathJax add-on (AnkiWeb code
  `1610307553`). See [`docs/latex.md`](./docs/latex.md) for the
  full rendering matrix.
- **`--json` envelope** (version 1) — every command emits a stable
  JSON shape. `error.code` is the contract for AI agents.
- **`--idempotency-key <k>`** (M10) — skip a re-run when the
  operation already completed successfully.
- **`--batch-id <id> --rollback-on-partial`** (M9) — atomic wrapper;
  any failure rolls the batch back to a pre-batch checkpoint.
- **`createClient(args)` factory** and **`toAddNotePayload(note)`
  helper** (M7) — the public library entry point. Lets downstream
  tools build AnkiConnect payloads without copying internal logic.
- **Config file** (M14) — `.anki-xmlrc` (project-local) and
  `$XDG_CONFIG_HOME/anki-xml/config.toml` (global); `--config <path>`
  override.
- **Shell completion** (P1.10) — bash, zsh, fish, powershell.
- **Grouped `--help`** — commands are grouped by surface (Read /
  Query, Write, Schema, Lifecycle, Recovery, Add-ons, Shell).
- **Per-command `--help`** — every command shows its positional
  arguments, flags, examples, and the global flag catalogue.
- **NDJSON streaming** (P3.6) — `--format ndjson` emits one JSON
  record per line; the last record carries `_meta`.
- **`--no-color` and `--quiet`** (P3.8) — strip ANSI, summary only.

---

## Distribution

| Path | Command | Audience |
|---|---|---|
| `npx anki-xml` | npm temporary install | Try without committing |
| `npm install -g anki-xml` | npm global install | End users |
| Bun standalone binary | `bun run build --out anki-xml` | Hosts without Bun/Node |
| `bun run src/index.ts` | source run | Contributors |

- **Bun standalone binary** (M18) — `bun run build --out anki-xml`
- **npm distribution** (M21) — Node ≥ 18 CommonJS bundle (~175 KB);
  `npm install -g anki-xml` and `npx anki-xml` both work;
  `scripts/build-npm.ts` builds it; `prepublishOnly` enforces the
  build; `scripts/publish-check.ts` verifies the bundle.

---

## Documentation

| File | Purpose |
|---|---|
| [`README.md`](./README.md) | Quickstart, command index, install, recovery matrix |
| [`docs/commands.md`](./docs/commands.md) | Every command, with usage, examples, and rationale |
| [`docs/cli.md`](./docs/cli.md) | Global flags, exit codes, config precedence |
| [`docs/roadmap.md`](./docs/roadmap.md) | Every milestone (P1..P4 + M1..M22) tracked |
| [`docs/ai-integration.md`](./docs/ai-integration.md) | Agent workflow + recovery matrix + JSON contract |
| [`docs/ai-cookbook.md`](./docs/ai-cookbook.md) | Five canonical agent loops |
| [`docs/latex.md`](./docs/latex.md) | MathJax vs native `[latex]` rendering matrix |
| [`docs/cdata.md`](./docs/cdata.md) | CDATA preservation rules |
| [`docs/xml-cookbook.md`](./docs/xml-cookbook.md) | XML patterns and recipes |
| [`docs/whitespace.md`](./docs/whitespace.md) | Whitespace preservation rules |
| [`docs/extension-policy.md`](./docs/extension-policy.md) | When to add commands vs. write a new tool |
| [`docs/architecture-review.md`](./docs/architecture-review.md) | Design rationale |
| [`docs/install.md`](./docs/install.md) | npm / npx / binary / source install |
| [`docs/usage.md`](./docs/usage.md) | How to write `<anki>` XML for every supported note type |
| [`docs/language.md`](./docs/language.md) | XML schema: elements, attributes, deck inheritance, tags |
| [`docs/field-names.md`](./docs/field-names.md) | XML tag ↔ Anki display name reference |
| [`docs/cli-command-design.md`](./docs/cli-command-design.md) | Per-command JSON shape contracts |
| [`docs/upstream-anki-markdown-review.md`](./docs/upstream-anki-markdown-review.md) | `terkelg/anki-markdown` review |
| [`docs/schema-v2.md`](./docs/schema-v2.md) | Future schema v2 story (not yet shipping) |
| `LICENSE` | MIT |
| `CONTRIBUTING.md` | Ground rules + new-command cookbook |
| `SECURITY.md` | Vulnerability disclosure |

GitHub:

- Issue templates: `bug_report`, `feature_request`, `agent_workflow`
- Workflow: `bun test` + `bunx tsc --noEmit` on push / PR

---

## Examples

| File | Contents |
|---|---|
| [`examples/basic.xml`](./examples/basic.xml) | Minimal Basic notes |
| [`examples/all-note-types.xml`](./examples/all-note-types.xml) | Every supported note model in one file |
| [`examples/html-and-latex.xml`](./examples/html-and-latex.xml) | CDATA, MathJax, native `[latex]`, HTML tables, cloze, and nested HTML |
| [`examples/issue-cases.xml`](./examples/issue-cases.xml) | Backward-compat regressions |
| [`examples/html.xml`](./examples/html.xml) | 100 HTML flashcards (foundations, semantics, forms, accessibility) |
| [`examples/math.xml`](./examples/math.xml) | 12 math flashcards comparing normal Unicode / HTML notation against the native Anki `[latex]...[/latex]` syntax |

---

## Tests

**430 tests pass.** See `bun test`. Coverage spans 28 files:

| File | Tests | Covers |
|---|---|---|
| `tests/anki-connect.test.ts` | 18 | HTTP envelope, error handling, payload shape |
| `tests/batch.test.ts` | 4 | `--batch-id` + `--rollback-on-partial` |
| `tests/checkpoints.test.ts` | 11 | `checkpoint` + `rollback` + audit log |
| `tests/cli-internals.test.ts` | 38 | `parseArgs`, `formatOutput`, `withFatal`, command registry |
| `tests/cli.test.ts` | 21 | End-to-end CLI via `spawn` |
| `tests/completion.test.ts` | 5 | Shell completion script generation |
| `tests/config.test.ts` | 9 | Config file loading + precedence |
| `tests/decks.test.ts` | 17 | Deck hierarchy + counts |
| `tests/doctor.test.ts` | 8 | All 6 doctor checks + MathJax add-on detection |
| `tests/addon.test.ts` | 6 | `addon` command + AnkiConnect add-on helpers |
| `tests/edge-cases.test.ts` | 31 | Unicode, multi-byte, BOM, DOCTYPE, whitespace, RTL, deep hierarchy |
| `tests/envelope.test.ts` | 12 | JSON envelope contract + structured error locations |
| `tests/idempotency.test.ts` | 8 | `operationId` + `checkIdempotency` |
| `tests/import.test.ts` | 22 | `import` success / partial failure / connectivity / auto-create-deck |
| `tests/models.test.ts` | 24 | Registry-driven model validation + `id` attribute + field-name mapping |
| `tests/phase1-rest.test.ts` | 9 | P1.x polish (--json, --allow-duplicate, unknown-element warnings) |
| `tests/phase3-flags.test.ts` | 19 | P3.x (--format ndjson, --no-color, --quiet, schema version) |
| `tests/phase3-stream.test.ts` | 19 | NDJSON output + export + tag/untag registration |
| `tests/plan.test.ts` | 5 | `plan` offline + online + error paths |
| `tests/resume.test.ts` | 3 | `import --resume-from` checkpoint skipping |
| `tests/sample.test.ts` | 5 | `sample` deterministic random |
| `tests/schema.test.ts` | 4 | Schema discovery (`models`, `fields`, `tags`, `note-info`) |
| `tests/search.test.ts` | 30 | Search query construction, snippet generation, rendering |
| `tests/stats.test.ts` | 9 | `stats` + `--field` cardinality |
| `tests/update.test.ts` | 17 | `update --id`, `--file`, `--rename-field` |
| `tests/upstream-regressions.test.ts` | 17 | Strict XML boundaries + code/raw text preservation + cloze |
| `tests/validate.test.ts` | 13 | `validate` happy path + every failure mode |
| `tests/xml.test.ts` | 39 | XML tokenizer (CDATA, nested HTML, entities, MathJax, LaTeX, whitespace) |

---

## Performance budgets

Measured on Bun 1.x, single-threaded. AnkiConnect on localhost.

| Operation | Latency | Notes |
|---|---|---|
| `validate` (typical file) | < 100 ms | Pure parsing, no network |
| `plan` (50 notes) | < 500 ms | One AnkiConnect roundtrip |
| `import` (50 notes) | 1–2 s | `addNotes` + `createDeck` |
| `import` (500 notes) | 5–15 s | Larger batches |
| `import` (5,000 notes) | 30–90 s | Split into 500–1,000 chunks |
| `search` | < 1 s | Server-side search |
| `doctor` | < 1 s | 6 sequential checks |

Throttling:

- Sequential calls: no throttle needed
- Parallel calls: max concurrency 3–5

---

## Known limitations

These are intentional or out-of-scope for v0.0.1. Filed as deferred
in [`docs/roadmap.md`](./docs/roadmap.md).

- **No plugin system (P4.9).** Waiting for 3 real plugin requests
  before building the host. Design shape is in `src/plugins.ts`.
- **No schema v2.** v1 XML contract is stable; v2 waits for v1 to be
  painful in production. Design notes in
  [`docs/schema-v2.md`](./docs/schema-v2.md).
- **No watch mode (M17).** Not needed for AI agents (deterministic
  polling is preferred).
- **Custom note types (P4.2).** AnkiConnect's `createModel` API is
  exposed through the client but `<meta>` block declaration in XML
  is future work.
- **Older AnkiConnect (< 2.1.55) does not support add-on queries.**
  `doctor` and `addon` report this clearly; everything else works.
- **`sync` does not preserve the `guid` of removed notes.** Notes
  deleted between two syncs are reported but not auto-rediscoverable
  on the next sync; treat `sync` as a planning tool, not a backup.
- **No undo for `delete`.** Use `checkpoint create` before any
  destructive operation; `rollback --to <name>` restores state.
- **Refactors R1/R4/R6 (M8 partial) deferred.** Mechanical migrations
  with low value; tracked as follow-up commits.

---

## Deferred (intentional)

These items are tracked in [`docs/roadmap.md`](./docs/roadmap.md) and
deliberately excluded from this release:

- **Plugin system (P4.9)** — waiting for 3 real plugin requests;
  design shape in `src/plugins.ts`.
- **Refactors R1/R4/R6 (M8 partial)** — mechanical migrations,
  follow-up commits.
- **Watch mode (M17)** — not needed for AI agents (deterministic
  polling is preferred).
- **Schema v2** — wait for v1 to be painful in production.
- **HTML preview (P4.8 expanded)** — Anki's own browser is the
  canonical renderer.

---

## Breaking changes

**None.** This is the first public release.

---

## Migration notes

**None.** This is the first public release.

If you have hand-written XML files for any other Anki tool, they
likely round-trip cleanly through `anki-xml import`. The XML v1
schema is intentionally minimal and matches what Anki stores
internally.

---

## License

[MIT](./LICENSE) — Copyright (c) 2024 anki-xml contributors.

[0.0.1]: https://github.com/master8848/Anki-import/releases/tag/v0.0.1
