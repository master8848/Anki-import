# anki-xml docs

This directory is the **design** and **operations** documentation for
`anki-xml`. The user-facing landing page is at the repo root:
[`README.md`](../README.md).

The tool exists because flashcard decks that contain HTML, MathJax,
and native LaTeX are awkward to author in pure JSON or CSV. Writing
them as XML lets the author use **CDATA sections** to embed
backslash-heavy formulas and markup-looking text without drowning in
escape sequences — and `anki-xml` re-escapes CDATA contents just
enough to make them valid Anki field HTML without ever
double-escaping pre-existing entities.

## Quick start

```bash
# 1. install Anki and AnkiConnect (add-on 2055492159)
# 2. start Anki, leave it running in the background
# 3. verify the environment
anki-xml doctor
# 4. validate before sending
anki-xml import ./examples/all-note-types.xml --dry-run
# 5. actually create the notes
anki-xml import ./examples/all-note-types.xml
```

The five-loop AI pattern (validate → plan → import → verify → recover)
is in [`ai-cookbook.md`](./ai-cookbook.md).

## Documentation index

### User-facing (start here)
- [`../README.md`](../README.md) — landing page; quick start, command
  table, recovery matrix.
- [`install.md`](./install.md) — npm/npx / binary / source install
  compared.
- [`commands.md`](./commands.md) — full per-command reference (all 31
  commands) with human and JSON shapes.
- [`cli.md`](./cli.md) — global flags, exit codes, config
  precedence, the `--auto-create-deck` story.
- [`usage.md`](./usage.md) — how to write `<anki>` XML for every
  supported note type, simple and complex examples.
- [`language.md`](./language.md) — the XML schema: elements,
  attributes, required fields per model, deck inheritance, tags.
- [`field-names.md`](./field-names.md) — XML tag ↔ Anki display name
  reference.

### AI agent integration
- [`ai-integration.md`](./ai-integration.md) — guide for AI agents;
  JSON shapes, error codes, idempotency patterns, **recovery matrix**.
- [`ai-cookbook.md`](./ai-cookbook.md) — recipes: the five-loop
  pattern, find-and-update pipeline, stream-and-page patterns, stable
  retries, anti-patterns.

### Design docs
- [`architecture-review.md`](./architecture-review.md) — read-only
  review of the codebase with design rationale.
- [`schema-v2.md`](./schema-v2.md) — design spec for the next XML
  schema version (additive only).
- [`cli-command-design.md`](./cli-command-design.md) — design spec
  for new CLI commands beyond the current 31.
- [`extension-policy.md`](./extension-policy.md) — when and how to
  extend (commands, flags, models, shells, error codes).

### Roadmap & history
- [`roadmap.md`](./roadmap.md) — what's shipped, what's deferred;
  source of truth.
- [`../CHANGELOG.md`](../CHANGELOG.md) — per-commit entry for every
  milestone shipped.
- [`../FUTURE_FEATURES.md`](../FUTURE_FEATURES.md) — historical
  proposals, superseded by [`roadmap.md`](./roadmap.md).
- [`upstream-anki-markdown-review.md`](./upstream-anki-markdown-review.md) —
  review of every upstream `terkelg/anki-markdown` issue.

### XML guidance
- [`xml-cookbook.md`](./xml-cookbook.md) — **start here for AI output.**
  Practical recipes for HTML, CDATA, code, lists, tables, Cloze, media.
- [`cdata.md`](./cdata.md) — when and how to use CDATA; what gets
  re-escaped, what passes through verbatim.
- [`latex.md`](./latex.md) — MathJax (`\(...\)`, `\[...\]`) and native
  Anki `[latex]...[/latex]`.
- [`html.md`](./html.md) — inline HTML tags, entities, line breaks.
- [`whitespace.md`](./whitespace.md) — how leading, trailing, and
  inter-token whitespace is handled.
- [`problems-solved.md`](./problems-solved.md) — why we slice source
  text instead of round-tripping through an XML serializer.

## Supported note types

v1 supports the five note types that ship with every fresh Anki install:

- `Basic`
- `Basic (and reversed card)`
- `Basic (optional reversed card)`
- `Basic (type in the answer)`
- `Cloze`

Custom note types: see [`schema-v2.md`](./schema-v2.md) for the
future plan.

## CLI

31 commands in 6 surface groups (Read/Query, Write, Schema,
Lifecycle, Recovery, Shell). Run `anki-xml --help` for the full list.

## Development

```bash
bun install
bun test                  # all 420 tests
bun test tests/cli.test.ts
bunx tsc --noEmit
bun run build             # standalone binary
```

Requires Bun ≥ 1.3.

## License

[MIT](../LICENSE).

## Contributing

See [`../CONTRIBUTING.md`](../CONTRIBUTING.md).