# Changelog

All notable changes to `anki-xml` are documented here. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- **`doctor` command** (M13) — pre-flight connectivity + version + collection check
- **Config file** (M14) — `.anki-xmlrc` (project-local) and
  `$XDG_CONFIG_HOME/anki-xml/config.toml` (global); `--config <path>` override
- **`import --resume-from <checkpoint>`** (M11) — skip notes already captured
  in a prior checkpoint (network-drop recovery)
- **`--batch-id <id>` + `--rollback-on-partial`** (M9) — atomic batch wrapper;
  every write inside the batch is rolled back if any entry fails
- **`update --rename-field Old=New`** (M12) — migrate a field's value to a
  new name across many notes (typo recovery)
- **`--idempotency-key <key>`** (M10) — skip a re-run when the operation
  already completed successfully
- **`stats --field <name>` + `--top <N>`** (M6) — frequency stats on a field
- **Schema discovery** (M1): `models`, `fields <model>`, `tags`, `note-info <id>`
- **`checkpoint`, `rollback`, `audit-log`** (M2+M3) — local-fs recovery layer
- **`sample <N> --seed <N>`** (M4) — deterministic random sample of notes
- **`schema-validate <file>`** (M5) — static + live schema drift detection
- **`createClient(args)` factory** and **`toAddNotePayload(note)` helper**
  (M7) — refactor that unifies all write commands' AnkiConnect payload building
- **Bun standalone binary** (M18) — `bun run build --out anki-xml`
- **npm distribution** (M21) — Node ≥ 18 CommonJS bundle (~175 KB); `npm install -g anki-xml` and `npx anki-xml` both work; `scripts/build-npm.ts` builds it; `prepublishOnly` script enforces the build; `publish:check` script verifies the bundle
- **GitHub workflows** — `bun test` on push/PR; standalone-binary build
- **Issue templates** — `bug_report`, `feature_request`, `agent_workflow`
- **`scripts/publish-check.ts`** — pre-publish sanity check

### Changed
- **Grouped `--help` output** — commands are now grouped by surface
  (Read / Query, Write, Schema, Lifecycle, Recovery, Shell)
- **Per-command `--help`** — now includes positional argument hint,
  example block, and global flag catalogue
- **`README.md`** — GitHub-ready landing page: badges, install
  instructions (npm/npx/binary/source), recovery matrix
- **`src/index.ts`** — IIFE-style entry point so the same source
  bundles for both Bun (ESM, top-level await) and Node (CJS)

### Documentation
- **Top-level `README.md`** (M15) — quickstart, command index, install
- **`CHANGELOG.md`** (M16) — this file
- **`LICENSE`** (M16) — MIT
- **`CONTRIBUTING.md`** (M16) — ground rules + new-command cookbook
- **`docs/commands.md`** — rewritten from scratch to cover all 31 commands
- **`docs/cli.md`** — rewritten to document every global flag and config precedence
- **`docs/roadmap.md`** — every Phase 1–4 + M1–M18 milestone marked shipped
- **`docs/ai-integration.md`** — added Workflow 4 (atomic batch) and
  recovery matrix

### Deferred
- **Plugin system (P4.9)** — waiting for 3 real plugin requests;
  design shape documented in `src/plugins.ts`
- **Custom models in `<meta>` blocks** (P4.2) — AnkiConnect API exposed
  (`createModel`); XML declaration is future work
- **Refactors R1/R4/R6 (M8 partial)** — mechanical migrations, follow-up
- **Watch mode (M17)** — not needed for AI agents (deterministic polling preferred)

## [0.1.0] — Initial release

### Added
- `import` — create notes from an XML file
- `validate` — static XML validation
- `decks`, `stats`, `search`, `update` — read and update commands
- HTML / CDATA / LaTeX support
- Strict XML boundary handling for AI-authored files
- Upstream `terkelg/anki-markdown` review and regression tests
- Auto-create-deck (default on) + cloze forward-compat + edge-case tests

[Unreleased]: https://github.com/YOUR-USERNAME/anki-xml/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/YOUR-USERNAME/anki-xml/releases/tag/v0.1.0