---
name: anki-import-mcp
description: Manage Anki via AI — MCP server over stdio (5 tools). Use when MCP tools are available; for shell use anki-import-cli.
metadata:
  author: master8848
  version: "0.0.6"
---

# anki-import MCP

Anki via AI — 5 tools over stdio (JSON-RPC). Anki must be open with AnkiConnect `2055492159` or `2036732292` Plus — either is ok, default is `2055492159` (more stable).

## Tools

| Tool | What it does |
|---|---|
| `validate_xml` | Validate file without Anki (offline — no duplicate check) |
| `doctor` | Diagnose AnkiConnect connection |
| `list_decks` | List all deck names (see which decks/cards exist) |
| `diff` | Show field diffs vs live collection (field-level preview) |
| `sync` | Add + update cards (or drift if no file); reports duplicates via live `canAddNotes` |

> `validate_xml` is offline and cannot detect duplicates; duplicate detection is live via `sync` (`sync` with `dry_run` previews adds/updates/duplicates).

No `install-addon` / `install-binary` / `open` — not in MCP. Anki/add-on install and `open` are CLI-only via `anki-import init` / `anki-import open`.

## How to use

```bash
npx anki-xml mcp          # start server (no install needed)
npx anki-xml mcp config   # print client config snippet
```

Add to your MCP client (stdio) — example:

```json
{ "mcpServers": { "anki-xml": { "command": "npx", "args": ["-y", "anki-xml", "mcp"] } } }
```

Restart client after adding. Then: `doctor` → `validate_xml` → `list_decks` → `diff` → `sync` (use `sync` with `dry_run: true` to preview duplicates).

## CDATA cheat-sheet

| You want | Do |
|---|---|
| Real formatting (bold, `<br>`) | No CDATA — `<field>hi<br>there</field>` |
| Show code/tags as text | CDATA — `<![CDATA[<div>hi</div>]]>` |
| Math `\(x^2\)` | CDATA — `<![CDATA[\(x^2\)]]>` |
| Bare `&` | `&amp;` — `validate` catches bare `&` |
| Mixed formatting + code | Split — `<![CDATA[Code: ]]><b>hi</b><![CDATA[ end]]>` |

> CLI has more: `rollback`, `checkpoint`, `watch`, `tags`/`media`. See `anki-import-cli` skill.
