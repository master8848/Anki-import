---
name: anki-import-mcp
description: Manage Anki flashcards via the anki-import MCP server (JSON-RPC over stdio, 18 tools). Use when you have MCP tools available (import_xml, sync, plan_import, etc.) instead of shell commands.
metadata:
  author: master8848
  version: "0.0.4"
---

# anki-import MCP

MCP server for chat agents — 18 tools over stdio. Use this when you have MCP tools. For shells and scripts, see the `anki-import-cli` skill.

## Start the server

```bash
anki-import mcp              # if installed with npm i -g anki-xml
npx anki-xml mcp             # without install — always works
```

Add it to your MCP client config (stdio). Anki must be open with AnkiConnect `2055492159`.

## If MCP is missing

If your agent says "no MCP tools" or `mcp` command not found:

1. Try `npx anki-xml mcp` — no install needed
2. Or install: `npm i -g anki-xml`, then `anki-import mcp`
3. Restart your MCP client after adding the server
4. Check: run `anki-import doctor` — if Anki is closed, run `anki-import open` first

This is separate from the CLI — the CLI works even without MCP.

## Tools

| Tool | What it does |
|---|---|
| `open_anki` | Open Anki app |
| `doctor` | Check Anki connection |
| `validate_xml` | Check file — no Anki needed |
| `import_xml` | Add new cards |
| `plan_import` | Preview changes |
| `diff` | Show card changes |
| `sync` | Add + update; or drift if no file |
| `add_note` / `add_notes` | Add one or many cards |
| `find_notes` | Find cards (`deck:Japanese`) |
| `get_tags` / `add_tags` / `remove_tags` | Manage tags |
| `list_decks` / `list_models` | List decks and card types |
| `store_media` / `get_media` | Upload / download files |
| `collection_stats` | Counts per deck |

`sync` / `import_xml` / `plan_import` also take `deck`, `model`, `batch_size`, `allow_duplicate`, `auto_create_deck`.

## How to use

1. Anki not open? → `open_anki`, then `doctor`
2. Preview → `plan_import`, add → `import_xml`, update → `sync` (needs `id=`), quick add → `add_note`
3. Check → `find_notes` / `diff`, cleanup → tags/media

## Not in MCP — use CLI

`rollback`, `checkpoint`, `watch`, `benchmark`, `media list/retrieve/delete`, `--stream`. Errors are same as CLI `--json`: `cause`, `hints`, `suggestion` — check `code`, not message.

## File format

Same as CLI. Card fields are `front`/`back`/`text`/`extra` or `<field name=...>`. For full XML rules see the `anki-import-cli` skill.
