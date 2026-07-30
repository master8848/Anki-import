---
name: anki-import
description: Import Anki flashcards from XML via AnkiConnect. Use when the user asks to add cards to Anki, import flashcards, bulk-create notes, validate card XML, or rollback an import.
metadata:
  author: master8848
  version: "0.0.3"
---

# anki-import

Import Anki notes from XML using AnkiConnect.

## Overview

XML is the canonical card format. JSON is used only for output and checkpoints.

Install: `npm install -g anki-xml`. Bins: `anki-import` and `anki-xml`. Anki must be running with AnkiConnect.

## Workflow

Workflow: doctor → validate → import → rollback.

Run doctor once before importing.

```bash
anki-import doctor
anki-import validate cards.xml
anki-import import cards.xml --dry-run
anki-import import cards.xml --stream
anki-import rollback <id>
```

## Commands

| Command | Purpose |
| --- | --- |
| doctor | Check AnkiConnect |
| validate | Validate XML |
| import | Import notes |
| checkpoint list | List checkpoints |
| checkpoint create | Snapshot note ids |
| rollback | Undo import / delete notes |
| benchmark | Measure throughput |

| Flag | Purpose |
| --- | --- |
| --dry-run | Validate only |
| --stream | Stream large files |
| --batch-size N | Batch size |
| --json | JSON output |
| --verbose | Verbose logs |

## XML schema

```xml
<anki deck="Spanish">
  <note type="Basic">
    <field name="Front">Hola</field>
    <field name="Back">Hello</field>
  </note>
</anki>
```

- root: `<anki>`
- note: `<note type="...">`
- fields: short tags (`<front>`, `<back>`) or `<field name="...">`
- optional decks (`<deck name>`) and tags (`tags="a b"` or `<tag>`)
- CDATA supported

Note types: `Basic`, `Basic (and reversed card)`, `Basic (optional reversed card)`, `Basic (type in the answer)`, `Cloze`.

## Validation

| Type | Required fields |
| --- | --- |
| Basic (and variants) | Front, Back |
| Basic (optional reversed card) | Front, Back, Add Reverse (`yes`\|`no`) |
| Cloze | Text with at least one `{{cN::...}}` |

Every note needs a deck (on `<anki>`, `<deck name>`, or `<note deck>`). Empty fields fail.

Branch on exit codes and `--json` `error.code`, never on message text: `XML_PARSE_ERROR`, `VALIDATION_ERROR`, `ANKICONNECT_ERROR`, `FILE_NOT_FOUND`.

## Rollback

Successful imports create a checkpoint with created note ids.

```bash
anki-import checkpoint list
anki-import rollback <checkpoint-id>
anki-import rollback <checkpoint-id> --dry-run
```

## Example

Fixtures in `examples/`:

| File | Covers |
| --- | --- |
| `commands.md` | Runnable CLI |
| `spanish-greetings.xml` | Basic + CDATA |
| `all-note-types.xml` | Every note type |
| `latex.xml` | `[latex]`, MathJax, HTML math |
| `code-and-escapes.xml` | `<pre><code>`, entities, CDATA |
| `update-and-delete.md` | Delete / replace notes |

```bash
anki-import import examples/spanish-greetings.xml --stream
```
