# anki-xml

Import AI-authored XML flashcards into [Anki](https://apps.ankiweb.net/) via
[AnkiConnect](https://foosoft.net/projects/anki-connect/). One file, one
command:

```bash
anki-xml import ./cards.xml
```

The practical AI/XML recipes start in [`xml-cookbook.md`](./xml-cookbook.md).
The upstream issue research is in
[`upstream-anki-markdown-review.md`](./upstream-anki-markdown-review.md), and
future proposals are intentionally separate in
[`FUTURE_FEATURES.md`](../FUTURE_FEATURES.md).

The tool exists because flashcard decks that contain HTML, MathJax, and native
LaTeX are awkward to author in pure JSON or CSV. Writing them as XML lets the
author use **CDATA sections** to embed backslash-heavy formulas and
markup-looking text without drowning in escape sequences — and this tool
re-escapes CDATA contents just enough to make them valid Anki field HTML
without ever double-escaping pre-existing entities.

## Quick start

```bash
# 1. install Anki and AnkiConnect (add-on 2055492159)
# 2. start Anki, leave it running in the background
# 3. validate a deck before sending it to Anki
anki-xml import ./examples/all-note-types.xml --dry-run
# 4. actually create the notes
anki-xml import ./examples/all-note-types.xml
```

Exit codes:

| code | meaning                                            |
|------|----------------------------------------------------|
| `0`  | success — every valid note was created             |
| `1`  | validation or import errors (one or more failed)   |
| `2`  | fatal — file unreadable, malformed XML, no AnkiConnect |

## Supported note types

v1 supports the five note types that ship with every fresh Anki install:

- `Basic`
- `Basic (and reversed card)`
- `Basic (optional reversed card)`
- `Basic (type in the answer)`
- `Cloze`

Custom note types are out of scope. See `language.md` for the exact XML
schema for each.

## CLI

```
anki-xml import <file> [options]
anki-xml validate <file> [--strict] [--json]
anki-xml plan <file> [--no-preflight] [--json]
anki-xml decks [--json]
anki-xml stats [--deck NAME] [--json]
anki-xml search <phrase> [--deck D] [--tag T] [--limit N] [--query Q] [--json]
anki-xml update (--id N | --ids "1,2,3" | --file f.xml) [--field Name=value ...] [--dry-run]
anki-xml completion <bash|zsh|fish|powershell>
anki-xml --help
anki-xml --version
```

See [`commands.md`](./commands.md) for the full per-command reference.
For the import command's specific options, see below.

| option               | default                     | meaning                                          |
|----------------------|-----------------------------|--------------------------------------------------|
| `--url <url>`        | `http://127.0.0.1:8765`     | AnkiConnect endpoint                             |
| `--dry-run`          | (off)                       | validate and report; do not contact AnkiConnect  |
| `--help`, `-h`       |                             | print usage and exit                             |
| `--version`, `-v`    |                             | print version and exit                           |

## Example

```xml
<?xml version="1.0" encoding="UTF-8"?>
<anki deck="AI Import::Vocab">
  <note type="Basic" tags="greetings">
    <front>Hola</front>
    <back>Hello</back>
  </note>
  <note type="Cloze" tags="geography">
    <text>The capital of France is {{c1::Paris}}.</text>
  </note>
</anki>
```

A larger example with HTML, MathJax, and native LaTeX is in
[`examples/all-note-types.xml`](../examples/all-note-types.xml).

## How it works

1. **Parse** — [`fast-xml-parser`](https://github.com/NaturalIntelligence/fast-xml-parser)
   validates well-formedness and gives us an ordered element tree with source
   offsets. A hand-rolled tokenizer then walks the source to find each
   field's exact source range and check PCDATA for illegal characters.
2. **Extract field HTML** — for each `<note>` field we walk the token
   stream to find the matching closing tag, then copy the source range
   verbatim (or escape it lightly for CDATA). This preserves every
   entity the author wrote, byte for byte.
3. **Validate** — we apply per-model structural rules (required fields,
   forbidden fields, allowed values for `<addReverse>`, Cloze markers) and
   collect every error before reporting.
4. **Auto-create decks** — for every unique deck name referenced by the
   validated notes, we call AnkiConnect's `createDeck`. This is
   idempotent and creates parent decks on the fly, so a fresh Anki
   install "just works" with no manual deck provisioning. Disable with
   `--no-auto-create-deck`.
5. **Send to AnkiConnect** — one `addNotes` call with all valid notes;
   per-note failures are matched back to 1-based note numbers in the file.

For the deeper design notes, see `problems-solved.md`. For the schema,
start with `language.md`.

## Documentation index

- [`xml-cookbook.md`](./xml-cookbook.md) — **start here for AI output.**
  Practical recipes for HTML, CDATA, code, lists, tables, Cloze, media, and
  bulk generation.
- [`commands.md`](./commands.md) — full per-command reference (import,
  validate, decks, stats, search, update, completion) with human and JSON
  output examples.
- [`field-names.md`](./field-names.md) — XML tag ↔ Anki display name
  reference; the canonical answer to "what do I call this field?".
- [`roadmap.md`](./roadmap.md) — the 12-commit implementation plan; the
  source of truth for what's being built and in what order.
- [`architecture-review.md`](./architecture-review.md) — read-only review
  of the codebase with Top 10 ROI improvements.
- [`schema-v2.md`](./schema-v2.md) — design spec for the next XML schema
  version (additive only; v1 keeps working unchanged).
- [`cli-command-design.md`](./cli-command-design.md) — design spec for new
  CLI commands beyond the current seven.
- [`ai-integration.md`](./ai-integration.md) — guide for AI agents using
  `anki-xml` as a backend; JSON shapes, error codes, idempotency
  patterns, reference agent implementation.
- [`ai-cookbook.md`](./ai-cookbook.md) — recipes for agent loops:
  the five-loop pattern, find-and-update pipeline, stream-and-page
  patterns, stable retries, and "don't do this" anti-patterns.
- [`extension-policy.md`](./extension-policy.md) — how to add new
  commands, flags, models, shells, and error codes. Read before
  proposing a feature.
- [`upstream-anki-markdown-review.md`](./upstream-anki-markdown-review.md) —
  review of every upstream issue and the cases relevant to this importer.
- [`../FUTURE_FEATURES.md`](../FUTURE_FEATURES.md) — historical proposals
  superseded by [`roadmap.md`](./roadmap.md).
- [`usage.md`](./usage.md) — how to write `<anki>` XML for every supported note
  type, with simple and complex examples.
- [`cli.md`](./cli.md) — import-specific options, exit codes, and the
  `--auto-create-deck` flag.
- [`language.md`](./language.md) — the XML schema: elements, attributes,
  required fields per model, deck inheritance, tags.
- [`cdata.md`](./cdata.md) — when and how to use CDATA; what gets re-escaped,
  what passes through verbatim.
- [`latex.md`](./latex.md) — MathJax (`\(...\)`, `\[...\]`) and native Anki
  `[latex]...[/latex]`.
- [`html.md`](./html.md) — inline HTML tags, entities, line breaks.
- [`whitespace.md`](./whitespace.md) — how leading, trailing, and inter-token
  whitespace is handled.
- [`problems-solved.md`](./problems-solved.md) — why we slice the source text
  instead of round-tripping through an XML serializer.

## Development

```bash
bun install
bun test
bun test tests/cli.test.ts
bunx tsc --noEmit
```

Requires Bun ≥ 1.3.