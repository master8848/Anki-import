# anki-xml

Import AI-authored XML flashcards into [Anki](https://apps.ankiweb.net/) via
[AnkiConnect](https://foosoft.net/projects/anki-connect/). One file, one
command:

```bash
anki-xml import ./cards.xml
```

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
anki-xml --help
anki-xml --version
```

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
   offsets.
2. **Extract field HTML** — for each `<note>` field we walk a hand-rolled
   token stream over the original source to find the matching closing tag,
   then copy the source range verbatim (or escape it lightly for CDATA).
   This preserves every entity the author wrote, byte for byte.
3. **Validate** — we apply per-model structural rules (required fields,
   forbidden fields, allowed values for `<addReverse>`, Cloze markers) and
   collect every error before reporting.
4. **Send to AnkiConnect** — one `addNotes` call with all valid notes;
   per-note failures are matched back to 1-based note numbers in the file.

For the deeper design notes, see `problems-solved.md`. For the schema,
start with `language.md`.

## Documentation index

- [`language.md`](./language.md) — the XML schema: elements, attributes,
  required fields per model, deck inheritance, tags.
- [`cdata.md`](./cdata.md) — when and how to use CDATA; what gets
  re-escaped, what passes through verbatim.
- [`latex.md`](./latex.md) — MathJax (`\(...\)`, `\[...\]`) and native
  Anki `[latex]...[/latex]`.
- [`html.md`](./html.md) — inline HTML tags, entities, line breaks.
- [`whitespace.md`](./whitespace.md) — how leading, trailing, and
  inter-token whitespace is handled.
- [`problems-solved.md`](./problems-solved.md) — why we slice the
  source text instead of round-tripping through an XML serializer.

## Development

```bash
bun install
bun test                # 97 tests, all four files
bun test tests/cli.test.ts
```

Requires Bun ≥ 1.3.