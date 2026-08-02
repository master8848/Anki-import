---
name: anki-import
description: Manage Anki collections as code via anki-xml (anki-import CLI). Use when the user wants to add/update flashcards, import cards from XML/YAML/JSON/Markdown/CSV, validate card files, plan/diff previews, rollback imports, sync collections, manage tags/media/stats, or use MCP tools against AnkiConnect.
metadata:
  author: master8848
  version: "0.0.4"
---

# anki-import

Infrastructure-as-code for Anki: validate → plan → diff → apply →
checkpoint → rollback → sync. XML is the canonical format; YAML, JSON,
Markdown, and CSV map onto the same note model.

Install: `npm install -g anki-xml`. Bins: `anki-import` and `anki-xml`.
Requires Node 20+. Anki must be running with the AnkiConnect add-on
(code `2055492159`).

## First step: doctor

`anki-import doctor` diagnoses AnkiConnect and prints ordered fix steps
(start Anki, install add-on `2055492159`, restart, check `--url`).
Every AnkiConnect failure carries the same stable
`cause`/`hints`/`suggestion` envelope in `--json` output.

```bash
anki-import doctor
```

## Workflow

```bash
anki-import validate cards.xml      # no Anki contact
anki-import plan cards.yaml         # preview: add/update/duplicate/unchanged
anki-import diff cards.xml          # per-note field diffs vs collection
anki-import import cards.xml        # CREATE notes only (writes checkpoint)
anki-import rollback <checkpoint-id> # undo an import
anki-import sync cards.xml          # CREATE + UPDATE (reconcile)
anki-import watch cards.xml --yes   # auto re-validate + apply on change
```

Use `--dry-run` and `--json` for previews; plan before import; rollback
after mistakes; sync (not import) for updates.

## Commands

| Command | Purpose |
| --- | --- |
| doctor | Diagnose AnkiConnect with fix steps |
| validate | Validate file, no Anki |
| plan | Dry-run preview vs collection |
| diff | Per-note diffs vs collection |
| import | Create notes (batch, checkpoint) |
| sync | Create + update; drift report w/o file |
| rollback | Delete notes from checkpoint |
| checkpoint list/create | Manage checkpoints |
| watch | Watch file → validate → confirm → apply |
| tags list/add/remove | Manage tags |
| models | List note types + fields |
| stats [--deck] | Collection statistics |
| media store/list/retrieve/delete | Media files |
| benchmark | Parse/validate throughput |
| mcp | MCP server (stdio) |

Key flags: `--dry-run`, `--stream`, `--batch-size N`, `--json`,
`--deck NAME`, `--model NAME`, `--allow-duplicate`,
`--no-auto-create-deck`, `--checkpoint <id>`, `--yes` (watch),
`--url <addr>` (default `http://127.0.0.1:8765`).

## Formats

All formats use the same field keys (`front`, `back`, `text`, `extra`,
or any `<field name=...>` equivalent):

```xml
<anki deck="Spanish">
  <note type="Basic">
    <field name="Front">Hola</field>
    <field name="Back">Hello</field>
  </note>
</anki>
```

```yaml
deck: Spanish
model: Basic
notes:
  - front: Hola
    back: Hello
```

CSV: columns `deck,model,front,back,tags`. Markdown: frontmatter
(`deck`/`model`/`tags`) + `# heading` = front, body = back.

Note types: `Basic`, `Basic (and reversed card)`, `Basic (optional
reversed card)`, `Basic (type in the answer)`, `Cloze` (requires
`{{cN::...}}` markers). Custom types use `<field name=...>`.

## XML rules

- Root `<anki deck="...">`, `<note type="..." deck="..." tags="...">`
- Never decode entities in field content; use CDATA for raw HTML
- CDATA: escape bare `&`, `<`, `>` only; don't double-escape entities
- Void tags (`br`, `img`, `hr`, …) are unpaired
- Every note needs a deck; empty fields fail validation

## For AI agents

- Always run `doctor` (or check `--json`) before assuming Anki is ready
- Branch on `--json` `error.code`, never message text:
  `VALIDATION_ERROR`, `XML_PARSE_ERROR`, `ANKICONNECT_ERROR`, `FATAL`
- `--json` keeps stdout clean (one JSON document, logs on stderr)
- ANKICONNECT_ERROR includes `cause` (refused/timeout/http/bad-json/
  network/unknown), `hints` (ordered fix steps), `suggestion` (e.g.
  `anki-import doctor`)
- Prefer `plan --json` before `import`; use `sync` for id-tagged updates;
  notes with `id=` are rejected by `import` by design
- MCP: `anki-import mcp` serves 17 tools over stdio
  (import_xml, validate_xml, doctor, plan_import, diff, sync, …);
  tool errors include the same hints envelope

## Example

```bash
anki-import import examples/basic.xml --dry-run --json
```
