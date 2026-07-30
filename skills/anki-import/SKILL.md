---
name: anki-import
description: Import Anki flashcards from XML via AnkiConnect. Use when the user asks to add cards to Anki, import flashcards, bulk-create notes, validate card XML, or rollback an import.
metadata:
  author: master8848
  version: "0.0.3"
---

# anki-import

XML-first CLI for creating Anki notes through AnkiConnect.

## 1. Overview

Write notes as XML. Validate. Import. Roll back if needed.

Always run `anki-import doctor` before the first write in a session.

## 2. XML specification

Root element is `<anki>`. Schema file: `schema/anki.xsd`.

### Required

- `<anki>` root (optional `version="1"`, optional `deck="..."`)
- `<note type="...">` — built-in types: `Basic`, `Basic (and reversed card)`, `Basic (optional reversed card)`, `Basic (type in the answer)`, `Cloze`
- Required fields per type (see Validation rules)

### Field styles (both supported)

Short tags (legacy):

```xml
<note type="Basic">
  <front>Hola</front>
  <back>Hello</back>
</note>
```

Explicit fields + CDATA (preferred for HTML):

```xml
<note type="Basic">
  <field name="Front">
    <![CDATA[
      <h1>Hola</h1>
    ]]>
  </field>
  <field name="Back">
    <![CDATA[Hello]]>
  </field>
</note>
```

### Optional

- Nested deck: `<deck name="Spanish">...</deck>`
- Tags attribute: `tags="a b"`
- Tag children: `<tag>language</tag>`
- Media in fields: `<img src="cat.png">`
- Void HTML: `<br>`, `<hr>`, `<img ...>`

### Full example

```xml
<anki version="1">
  <deck name="Spanish">
    <note type="Basic">
      <field name="Front"><![CDATA[<h1>Hola</h1>]]></field>
      <field name="Back"><![CDATA[Hello]]></field>
      <tag>language</tag>
      <tag>spanish</tag>
    </note>
  </deck>
</anki>
```

## 3. Commands

| Command | Purpose |
|---|---|
| `anki-import doctor` | Check AnkiConnect + collection |
| `anki-import validate cards.xml` | Validate XML locally |
| `anki-import import cards.xml` | Import notes |
| `anki-import checkpoint list` | List checkpoints |
| `anki-import rollback <id>` | Delete notes from a checkpoint |
| `anki-import benchmark cards.xml` | Throughput report |

### Import flags

| Flag | Meaning |
|---|---|
| `--dry-run` | Validate only; no writes |
| `--stream` | Stream-parse large files |
| `--batch-size N` | Notes per HTTP batch (default 500) |
| `--quiet` / `--verbose` | Log level |
| `--json` | Machine-readable output |
| `--url <url>` | AnkiConnect URL |

## 4. Validation rules

| Type | Required fields |
|---|---|
| Basic (and variants) | Front, Back |
| Basic (optional reversed card) | Front, Back, Add Reverse (`yes`\|`no`) |
| Cloze | Text with at least one `{{cN::...}}` |

Every note needs a deck (on `<anki>`, `<deck name>`, or `<note deck>`).

Empty / whitespace-only fields fail validation.

## 5. Rollback

Successful imports create a checkpoint with created note ids.

```bash
anki-import checkpoint list
anki-import rollback <checkpoint-id>
anki-import rollback <checkpoint-id> --dry-run
```

Checkpoint shape:

```json
{ "id": "...", "deck": "Spanish", "created": "2026-07-30", "noteIds": [1, 2, 3] }
```

## 6. Examples

```bash
anki-import doctor
anki-import validate cards.xml
anki-import import cards.xml --dry-run
anki-import import cards.xml --stream --batch-size 500
anki-import benchmark cards.xml --stream
```

Expected import output:

```
Parsing XML...
Validated 850 notes...
Imported 850 notes.
```

## 7. Error handling

Branch on exit codes and `--json` `error.code`, never on message text.

| Code | Meaning |
|---|---|
| `XML_PARSE_ERROR` | Malformed XML |
| `VALIDATION_ERROR` | Structural / field errors |
| `ANKICONNECT_ERROR` | AnkiConnect failure |
| `FILE_NOT_FOUND` | Missing input |

Line-aware validation example:

```
Line 45:
Missing field:
Front
```

## 8. Constraints

- XML is the source of truth — do not convert cards to JSON for interchange
- One command does one thing — no `safe-import` wrappers
- Validate before import
- Prefer `--stream` for 10k+ notes
- Do not print stack traces unless `--debug`
- Anki must be running with AnkiConnect installed
