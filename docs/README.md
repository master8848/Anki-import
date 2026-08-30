# anki-xml docs

Design and operations documentation for `anki-xml` — "Git + Terraform
for Anki knowledge": an XML-first, CLI-first infrastructure-as-code
toolkit for Anki collections via AnkiConnect. Not an Anki replacement,
review app, GUI automation, or AnkiMCP clone. AI-friendly: `--json`
with stable error codes, an MCP server, and actionable diagnostics.

The user-facing landing page is the repo root
[`README.md`](../README.md); releases are recorded in
[`CHANGELOG.md`](../CHANGELOG.md).

## Documentation index

### Current (v0.0.4 monorepo)

- [**monorepo-architecture.md**](./monorepo-architecture.md) — folder
  structure (18 packages), package responsibilities, dependency graph,
  design rules, performance targets.
- [**js-interfaces.md**](./js-interfaces.md) — the public JavaScript
  API: every export of every `packages/*/src/index.ts`, with real
  signatures.
- [**cli-design.md**](./cli-design.md) — the 16 commands, global and
  import flags, exit codes, `--json` envelopes, design principles,
  example sessions.
- [**mcp-design.md**](./mcp-design.md) — the stdio JSON-RPC MCP
  server: transport, handshake, methods, error codes, 18 tools,
  argument validation, error surfacing, P0/P1/P2 tiering.
- [**plugin-system.md**](./plugin-system.md) — the four registrations,
  plugin interfaces, built-ins, pipeline order, example plugin, and
  the config-loading future hook.
- [**testing-strategy.md**](./testing-strategy.md) — vitest setup, the
  mock-all-AnkiConnect principle, the 20 test files, fixtures/
  goldens/snapshots, coverage areas, quality gates, CI matrix.
- [**release-checklist.md**](./release-checklist.md) — step-by-step
  release flow (no npm publishing yet), version sync, smoke tests, git
  tag, future npm steps.
- [**migration-strategy.md**](./migration-strategy.md) — v0.0.3 →
  v0.0.4 file mapping and behavior changes; moving real collections
  into anki-xml; AI-agent adoption path.

### XML guidance

- [**xml-cookbook.md**](./xml-cookbook.md) — practical recipes for
  HTML, CDATA, code, lists, tables, Cloze, media.
- [**cdata.md**](./cdata.md) — when and how to use CDATA; what gets
  re-escaped, what passes through verbatim.
- [**latex.md**](./latex.md) — MathJax (`\(...\)`, `\[...\]`) and
  native Anki `[latex]...[/latex]`.
- [**html.md**](./html.md) — inline HTML tags, entities, line breaks.
- [**whitespace.md**](./whitespace.md) — leading, trailing, and
  inter-token whitespace handling.
- [**field-names.md**](./field-names.md) — XML tag ↔ Anki display
  name reference.
- [**language.md**](./language.md) — the XML schema: elements,
  attributes, required fields per model, deck inheritance, tags.
- [**usage.md**](./usage.md) — how to write `<anki>` XML for every
  supported note type.
- [**problems-solved.md**](./problems-solved.md) — why source text is
  sliced instead of round-tripping through an XML serializer.

### AI agent integration

- [**ai-integration.md**](./ai-integration.md) — JSON shapes, error
  codes, idempotency patterns, the recovery matrix.
- [**ai-cookbook.md**](./ai-cookbook.md) — recipes: the five-loop
  pattern, find-and-update pipeline, stream-and-page patterns, stable
  retries, anti-patterns.

### Design & history

- [**schema-v2.md**](./schema-v2.md) — design spec for the next XML
  schema version (additive only).
- [**extension-policy.md**](./extension-policy.md) — when and how to
  extend (commands, flags, models, shells, error codes).
- [**roadmap.md**](./roadmap.md) — what's shipped, what's deferred.
- [**../FUTURE_FEATURES.md**](../FUTURE_FEATURES.md) — historical
  proposals, superseded by `roadmap.md`.
- [**upstream-anki-markdown-review.md**](./upstream-anki-markdown-review.md) —
  review of every upstream `terkelg/anki-markdown` issue.

### Legacy (pre-monorepo; may not reflect v0.0.4)

- [**cli.md**](./cli.md) — global flags / exit codes as of older
  releases; superseded by [**cli-design.md**](./cli-design.md).
- [**commands.md**](./commands.md) — per-command reference for the old
  31-command surface; the current CLI ships 16 commands (see
  cli-design.md).
- [**cli-command-design.md**](./cli-command-design.md) — design spec
  for CLI commands beyond the current surface.
- [**architecture-review.md**](./architecture-review.md) — read-only
  review of the pre-monorepo codebase.
- [**install.md**](./install.md) — install options (npm/npx/binary/
  source).

## Quick start

```bash
# 1. install Anki and AnkiConnect (add-on 2055492159)
# 2. start Anki — or let the CLI do it:  anki-import open
# 3. verify the environment
anki-import doctor
# 4. validate before sending
anki-import validate ./examples/basic.xml
# 5. plan, then import with a checkpoint
anki-import plan ./examples/cards.yaml
anki-import import ./examples/cards.yaml --checkpoint my-first-import
# 6. undo on mistakes
anki-import rollback my-first-import --dry-run
```

See [`cli-design.md`](./cli-design.md) for the full command surface and
the agent-facing `--json` envelopes.

## Supported note types

v1 supports the five note types that ship with every fresh Anki
install: `Basic`, `Basic (and reversed card)`,
`Basic (optional reversed card)`, `Basic (type in the answer)`, and
`Cloze`. Custom note types: see [`schema-v2.md`](./schema-v2.md).

## Development

```bash
pnpm install
pnpm test                # vitest (15 files, no network)
pnpm typecheck           # tsc --noEmit (= pnpm lint)
pnpm build               # esbuild → dist/cli.js
node dist/cli.js --version
```

Requires Node ≥ 20 and pnpm ≥ 10.

## License

[MIT](../LICENSE).
