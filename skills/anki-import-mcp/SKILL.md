---
name: anki-import-mcp
description: Manage Anki via AI — MCP server over stdio (6 tools). Use when MCP tools are available; for shell use anki-import-cli.
metadata:
  author: master8848
  version: "0.0.4"
---

# anki-import MCP

Anki via AI — 6 tools over stdio (JSON-RPC). Anki must be open with AnkiConnect `2055492159`.

## Tools

| Tool | What it does |
|---|---|
| `validate_xml` | Validate file without Anki |
| `plan_import` | Preview adds / updates / duplicates |
| `sync` | Add + update cards (or drift if no file) |
| `doctor` | Diagnose AnkiConnect connection |
| `diff` | Show field diffs vs live collection |
| `open_anki` | Open Anki app |

No `install-addon` / `install-binary` — not in MCP. Anki/add-on install is CLI-only via `anki-import init`.

## How to use

```bash
npx anki-xml mcp          # start server (no install needed)
npx anki-xml mcp config   # print client config snippet
```

Add to your MCP client (stdio) — example:

```json
{ "mcpServers": { "anki-xml": { "command": "npx", "args": ["-y", "anki-xml", "mcp"] } } }
```

Restart client after adding. Then: `doctor` → `validate_xml` → `plan_import` → `sync`.

## CDATA cheat-sheet

| You want | Do |
|---|---|
| Real formatting (bold, `<br>`) | No CDATA — `<field>hi<br>there</field>` |
| Show code/tags as text | CDATA — `<![CDATA[<div>hi</div>]]>` |
| Math `\(x^2\)` | CDATA — `<![CDATA[\(x^2\)]]>` |
| Bare `&` | `&amp;` — `validate` catches bare `&` |
| Mixed formatting + code | Split — `<![CDATA[Code: ]]><b>hi</b><![CDATA[ end]]>` |

> CLI has more: `rollback`, `checkpoint`, `watch`, `tags`/`media`. See `anki-import-cli` skill.
