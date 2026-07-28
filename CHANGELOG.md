# Changelog

All notable changes to `anki-xml` are documented here. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/).

## [0.0.1] — 2026-07-28

First public release. Every feature listed below ships in this tag.

### Read / Query commands (11)

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

### Write commands (12)

| Command | What it does |
|---|---|
| `import <file>` | Create notes from XML; `--allow-duplicate`, `--resume-from` (M11), `--batch-id` + `--rollback-on-partial` (M9), `--idempotency-key` (M10) |
| `update` | Change fields/tags on existing notes; `--rename-field Old=New` (M12) |
| `tag` / `untag` | Add or remove tags by query / by ids |
| `delete` | Delete notes by query / by ids |
| `rename-deck` | Rename a deck |
| `delete-deck` | Delete a deck (with or without cards) |
| `move-notes` | Move notes to a target deck |
| `suspend` / `unsuspend` / `bury` | Card scheduling helpers |
| `sync <file>` | Three-way reconcile a file against the live collection |

### Schema discovery (4)

| Command | What it does |
|---|---|
| `models` | Every note model with its fields and templates (M1) |
| `fields <model>` | Field names for one model (M1) |
| `tags` | Every tag in the collection with note counts (M1) |
| `note-info <id>` | Full info on one note (M1) |

### Lifecycle (2)

| Command | What it does |
|---|---|
| `migrate assign-guids` | Write a stable `guid` attribute on every `<note>` (P4.7) |
| `profile <add\|list\|remove\|default\|show>` | Named AnkiConnect URL profiles (P4.10) |

### Recovery (3)

| Command | What it does |
|---|---|
| `checkpoint create\|list\|show\|delete` | Capture and restore note snapshots (M2) |
| `rollback --to <name>` | Restore a checkpoint (M3) |
| `audit-log` | Recent JSONL audit-log entries |

### Add-ons (1)

| Command | What it does |
|---|---|
| `addon list\|install\|enable\|disable\|check` | Manage Anki add-ons via AnkiConnect's `getAddons` / `installAddon` / `toggleAddon`. Auto-detects the MathJax add-on (AnkiWeb code `1610307553`) and surfaces it in `doctor`. |

### Shell (1)

| Command | What it does |
|---|---|
| `completion <bash\|zsh\|fish\|powershell>` | Print a shell completion script (P1.10) |

**Total: 34 commands.**

### Cross-cutting features

- **XML v1 schema** with strict boundary handling (rejects malformed
  closing tags, bare `&`, mismatched field tags). See `tests/xml.test.ts`.
- **HTML / CDATA / LaTeX** — fields accept inline HTML markup
  preserved verbatim; CDATA sections survive intact. See `docs/latex.md`
  for the rendering matrix.
- **`--json` envelope** — every command emits a stable JSON shape
  (envelope `version: 1`). `error.code` is the contract for AI agents;
  never branch on `message`. See `docs/ai-integration.md`.
- **`--idempotency-key <k>`** (M10) — skip a re-run when the operation
  already completed successfully.
- **`--batch-id <id> --rollback-on-partial`** (M9) — atomic wrapper;
  any failure rolls the batch back to a pre-batch checkpoint.
- **`createClient(args)` factory** and **`toAddNotePayload(note)` helper**
  (M7) — the public library entry point. Lets downstream tools build
  AnkiConnect payloads without copying internal logic.
- **Config file** (M14) — `.anki-xmlrc` (project-local) and
  `$XDG_CONFIG_HOME/anki-xml/config.toml` (global); `--config <path>` override
- **Shell completion** (P1.10) — bash, zsh, fish, powershell.
- **Grouped `--help`** — commands are grouped by surface (Read / Query,
  Write, Schema, Lifecycle, Recovery, Add-ons, Shell).
- **Per-command `--help`** — every command shows its positional
  arguments, examples, and the global flag catalogue.

### Distribution

- **Bun standalone binary** (M18) — `bun run build --out anki-xml`
- **npm distribution** (M21) — Node ≥ 18 CommonJS bundle (~175 KB);
  `npm install -g anki-xml` and `npx anki-xml` both work;
  `scripts/build-npm.ts` builds it; `prepublishOnly` enforces the build;
  `scripts/publish-check.ts` verifies the bundle.

### Documentation

- `README.md` (M15) — quickstart, command index, install, recovery matrix.
- `docs/commands.md` — every command, with usage, examples, and rationale.
- `docs/cli.md` — global flags and config precedence.
- `docs/roadmap.md` — every milestone (P1..P4 + M1..M22) tracked.
- `docs/ai-integration.md` — agent workflow + recovery matrix + JSON contract.
- `docs/ai-cookbook.md` — five canonical agent loops.
- `docs/latex.md` — MathJax vs native `[latex]` rendering matrix.
- `docs/cdata.md`, `docs/xml-cookbook.md`, `docs/whitespace.md`,
  `docs/extension-policy.md`, `docs/architecture-review.md`,
  `docs/upstream-anki-markdown-review.md`.
- `CHANGELOG.md` (M16), `LICENSE` (MIT), `CONTRIBUTING.md` (M16).
- GitHub issue templates: `bug_report`, `feature_request`, `agent_workflow`.
- GitHub workflow: `bun test` + `bunx tsc --noEmit` on push / PR.

### Examples

- `examples/basic.xml` — minimal Basic notes.
- `examples/all-note-types.xml` — every supported note model in one file.
- `examples/html-and-latex.xml` — CDATA, MathJax, native `[latex]`,
  HTML tables, cloze, and nested HTML.
- `examples/issue-cases.xml` — backward-compat regressions.
- `examples/html.xml` — 100 HTML flashcards (foundations, semantics,
  forms, accessibility).
- `examples/math.xml` — 12 math flashcards comparing normal Unicode /
  HTML notation against the native Anki `[latex]...[/latex]` syntax.

### Tests

**430 tests pass.** See `bun test`. Coverage spans:

- AnkiConnect client (HTTP envelope, error handling, payload shape).
- Schema registry (every supported model).
- Validation (Basic, reversed, optional-reversed, type-in, Cloze).
- XML tokenizer (CDATA preservation, nested HTML, entity escaping,
  MathJax preservation, native LaTeX, whitespace fidelity).
- Import flow (success, partial failure, validation gate,
  auto-create-deck, network errors, resume-from checkpoint).
- Update flow (per-id, per-file, rename-field, atomic batch, rollback).
- Plan / preflight (offline, online, error paths).
- Doctor (six checks, including the new MathJax add-on detection).
- `addon` command (list / install / enable / disable / check).
- Search, stats, decks, profile, completion, checkpoint, audit log,
  schema-validate, sample, sync, diff, idempotency, batch wrapper.

### Deferred (intentional)

These items are tracked in [`docs/roadmap.md`](./docs/roadmap.md) and
deliberately excluded from this release:

- **Plugin system (P4.9)** — waiting for 3 real plugin requests;
  design shape in `src/plugins.ts`.
- **Refactors R1/R4/R6 (M8 partial)** — mechanical migrations,
  follow-up commits.
- **Watch mode (M17)** — not needed for AI agents (deterministic polling
  is preferred).
- **Schema v2** — wait for v1 to be painful in production.
- **HTML preview (P4.8 expanded)** — Anki's own browser is the canonical renderer.

[0.0.1]: https://github.com/master8848/Anki-import/releases/tag/v0.0.1
