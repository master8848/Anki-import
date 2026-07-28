# Changelog

All notable changes to `anki-xml` are documented here. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- **`doctor` command** — pre-flight connectivity + version + collection check
- **Config file** — `.anki-xmlrc` (project-local) and
  `$XDG_CONFIG_HOME/anki-xml/config.toml` (global); `--config <path>` override
- **`import --resume-from <checkpoint>`** — skip notes already captured
  in a prior checkpoint (network-drop recovery)
- **`--batch-id <id>` + `--rollback-on-partial`** — atomic batch wrapper;
  every write inside the batch is rolled back if any entry fails
- **`update --rename-field Old=New`** — migrate a field's value to a
  new name across many notes (typo recovery)
- **`--idempotency-key <key>`** — skip a re-run when the operation
  already completed successfully
- **`stats --field <name>` + `--top <N>`** — frequency stats on a field
- **Schema discovery commands** — `models`, `fields <model>`, `tags`,
  `note-info <id>`
- **`checkpoint`, `rollback`, `audit-log`** — local-fs recovery layer
- **`sample <N> --seed <N>`** — deterministic random sample of notes
- **`schema-validate <file>`** — static + live schema drift detection
- **`migrate assign-guids`** — rewrite a file to give every note a
  stable GUID
- **`diff`, `sync`** — file vs collection reconciliation
- **`preview`, `profile`** — Anki browser opener + multi-collection
  profiles
- **JSON envelope v1** — `{version, command, ok, args, data, warnings,
  error, meta}` with `--json-legacy` escape hatch
- **Shell completion** — bash, zsh, fish, powershell
- **NDJSON streaming** — `--format ndjson` for one JSON record per line
- **`createClient(args)` factory** and **`toAddNotePayload(note)` helper**
  (refactor)

### Changed
- `import` is atomic at the file-validation boundary (existing behavior
  documented; was implicit)
- `<note id="...">` is parsed and validated but requires
  `update --id ...` to actually apply
- `update` and friends record their outcome in the audit log

### Deferred
- Plugin system (P4.9) — waiting for 3 real plugin requests
- Custom models in `<meta>` blocks — AnkiConnect API exposed
  (`createModel`); XML declaration is future work

## [0.1.0] — Initial release

### Added
- `import` — create notes from an XML file
- `validate` — static XML validation
- `decks`, `stats`, `search`, `update` — read and update commands
- HTML / CDATA / LaTeX support
- Strict XML boundary handling for AI-authored files
- Upstream `terkelg/anki-markdown` review and regression tests
- Auto-create-deck (default on) + cloze forward-compat + edge-case tests

[Unreleased]: https://example.com/anki-xml/compare/v0.1.0...HEAD
[0.1.0]: https://example.com/anki-xml/releases/tag/v0.1.0