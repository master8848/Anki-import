---
name: anki-import-cli
description: Manage Anki flashcards as code via the anki-import CLI. Use when the user wants to add/update flashcards, import XML/YAML/JSON/Markdown/CSV files, validate, plan/diff, sync, rollback, watch files, manage tags/media/stats, or run doctor. The CLI is the main way to use it.
---
anki-import CLI

The main way to manage Anki cards as code. Simple, safe, scriptable.

Install: `npm i -g anki-xml` → you get `anki-import` and `anki-xml`. Needs Node or bun 

## Quick start

```bash
anki-import open                  # open Anki (if not already open)
anki-import doctor                # check Anki is reachable
anki-import validate cards.xml    # check file — no Anki needed
anki-import plan cards.xml        # preview what will change
anki-import import cards.xml      # add new cards
anki-import sync cards.xml        # add + update cards
anki-import rollback <id>         # undo last import
```
## Commands

| Command | What it does |
|---|---|
| `open` | Open Anki app |
| `doctor` | Check Anki connection |
| `validate <file>` | Check file for errors |
| `plan <file>` | Preview changes |
| `diff <file>` | Show what changed |
| `import <file>` | Add new cards |
| `sync [<file>]` | Add + update, or show missing if no file |
| `rollback <id>` | Undo an import |
| `watch <file>` | Watch file and auto-apply |
| `tags` / `models` / `stats` / `media` | Manage tags, types, stats, files |
| `mcp` | Start MCP server (for AI agents) |

Flags:  `--dry-run`, `--deck NAME`, `--model NAME`, `--batch-size N`, `--yes`, `--url http://127.0.0.1:8765`.

## How to write cards

XML is the main format. YAML, JSON, CSV, Markdown all work — they become the same card.

```xml
<anki deck="Spanish">
  <note type="Basic">
    <field name="Front">Hola</field>
    <field name="Back">Hello</field>
  </note>
</anki>
```

- Root is `<anki deck="...">`, each card is `<note type="..." deck="..." tags="...">`
- Every card needs a deck

### Formatting: when to use CDATA

Keep it simple:


1. Real formatting — no CDATA 
<field name="Back">Line one<br>Line two</field>
<field name="Back"><b>Bold</b> and <u>underline</u></field>

2. Show code as text — use CDATA  
<field name="Front"><![CDATA[What does <div> do?]]></field>
<field name="Back"><![CDATA[Use <div class="box">Hi</div>]]></field>
Important : Do not cdata unless creating node for learning html or php or need to show user literal <div> and <br> insted of styling
Tip: using &lt;br&gt; is better if styling mix is required

3. Mix — split CDATA
<field name="Text"><![CDATA[Code: ]]><b><![CDATA[{{c1::answer}}]]></b><![CDATA[ here]]></field>

Check: `anki-import validate file.xml` — bare `&` must be `&amp;`.

Examples: `all-note-types.xml`, `code-and-escapes.xml`, `latex.xml`, `spanish-greetings.xml` (in `skills/anki-import-cli/examples/`).

```bash
anki-import import examples/basic.xml --dry-run --json
```
