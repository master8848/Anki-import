# MCP design

The MCP server is the optional, AI-agent-facing surface of `anki-xml`.
The CLI remains the main interface; `mcp` adds the same capabilities as
a JSON-RPC tool set (`packages/mcp/src/`). Implementation is
SDK-free: `protocol.ts` frames JSON-RPC 2.0, `server.ts` runs the
stdio loop, `tools.ts` holds the tool registry.

## Transport

- **stdio**: the server reads JSON-RPC lines from stdin and writes one
  JSON document per line to stdout (`readline` + `JSON.stringify`).
- **JSON-RPC 2.0**, line-delimited. Batches and notifications are
  dropped (`parseRequest` returns `null` — no response needed).
- **No SDK dependency** — the protocol surface is small and stable.
- **Stdout purity**: nothing but JSON-RPC responses may be written to
  stdout. No log lines, no diagnostics. (The CLI logger is never used
  on the MCP path.)

## Handshake

1. Client sends `initialize` → server answers with
   `protocolVersion: "2024-11-05"`,
   `capabilities: { tools: { listChanged: false } }`,
   `serverInfo: { name: "anki-xml", version: "0.0.4" }`.
2. Client sends `notifications/initialized` → no response (notification).
3. `ping` → `{}`.

## Methods

| Method | Response |
|---|---|
| `initialize` | `{ protocolVersion: "2024-11-05", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "anki-xml", version: "0.0.4" } }` |
| `notifications/initialized` | none (notification) |
| `ping` | `{}` |
| `tools/list` | `{ tools: [{ name, description, inputSchema }] }` — 18 tools |
| `tools/call` | `{ content: [{ type: "text", text }], isError: false }`; tool output is JSON-stringified into `content[0].text` |
| anything else | `-32601 Method not found: <method>` |

## JSON-RPC error codes

| Code | Constant | When |
|---|---|---|
| `-32700` | `PARSE_ERROR` | Unparseable line / invalid JSON-RPC request (emitted by the server) |
| `-32600` | `INVALID_REQUEST` | Defined in `protocol.ts` but not emitted by the server (invalid requests fall through to `PARSE_ERROR`) |
| `-32601` | `METHOD_NOT_FOUND` | Unknown method or unknown tool name |
| `-32602` | `INVALID_PARAMS` | Tool argument validation failure (`McpToolError`) |
| `-32603` | `INTERNAL_ERROR` | Tool handler threw non-`McpToolError`; `error.data` carries the agent envelope |

## Tools (18)

`tools/call` params: `{ name, arguments }`. Arguments are validated
with Valibot schemas; `McpToolError` → `-32602`.

| Tool | Params (required in bold) | Description |
|---|---|---|
| `import_xml` | **file**, `dry_run`, `batch_size`, `allow_duplicate`, `auto_create_deck`, `deck`, `model` | Import a file (xml/yaml/json/csv/md). Creates notes; rejects update targets (use `sync`). |
| `validate_xml` | **file** | Validate a file without contacting Anki. Returns note count, errors, warnings. |
| `doctor` | — | Diagnose AnkiConnect and collection health; failing checks carry fix steps (`hints`). |
| `open_anki` | — | Launch the Anki desktop app (macOS/Windows/Linux); returns the runnable command + fallbacks. Run when AnkiConnect is unreachable, before `doctor`. |
| `list_decks` | — | All deck names in the collection. |
| `list_models` | — | All note types with their fields. |
| `plan_import` | **file**, `allow_duplicate`, `batch_size`, `deck`, `model` | Dry-run preview: add/update/remove/duplicates/unchanged. |
| `add_note` | **deck, model, fields**, `tags`, `allow_duplicate` | Add a single note (`fields` = field name → HTML). |
| `add_notes` | **notes** (`[{deck, model, fields, tags?}]`) | Add many notes in one request (batch). |
| `find_notes` | **query** | Note ids by Anki search query (e.g. `deck:Japanese`). |
| `get_tags` | — | All tags in the collection. |
| `add_tags` | **note_ids, tags** | Add a tag to notes. |
| `remove_tags` | **note_ids, tags** | Remove a tag from notes. |
| `diff` | **file** | Per-note field diff between a file and the live collection. |
| `store_media` | **filename, data_base64** | Store a media file (base64-encoded bytes). |
| `get_media` | **filename** | Retrieve a media file as base64 (`{filename, data_base64, bytes}`). |
| `collection_stats` | — | Decks, models, notes, cards, per-deck counts. |
| `sync` | `file`, `dry_run`, `checkpoint_id`, `batch_size`, `allow_duplicate`, `auto_create_deck`, `deck`, `model` | With `file`: reconcile (create + update). Without: checkpoint drift report with `missingIds`. |

## Error surfacing

AnkiConnect failures inside a tool handler are thrown as
`AnkiConnectError`; the server replies with JSON-RPC `-32603` and
`error.data` from `toolErrorData`:

```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "error": {
    "code": -32603,
    "message": "Failed to reach AnkiConnect at http://127.0.0.1:8765: ...",
    "data": {
      "code": "ANKICONNECT_ERROR",
      "message": "...",
      "hints": ["Start the Anki app ...", "Install the AnkiConnect add-on (2055492159) ..."],
      "suggestion": "anki-import doctor"
    }
  }
}
```

Non-AnkiConnect failures become `data: { code: "INTERNAL_ERROR", message }`.
The `code`/`hints`/`suggestion` envelope mirrors the CLI `--json`
envelope, so agents branch on the same stable codes in both surfaces.

## Tool tiering (P0/P1/P2)

Every tool carries a `tier` field (`"P0" | "P1" | "P2"`) defined in
`packages/mcp/src/tools.ts` and exposed in `tools/list`. The spec's
tiering is enforced by a test (`tests/mcp.test.ts`):

- **P0 — diagnose + read baseline**: `doctor`, `import_xml`,
  `validate_xml`, `list_decks`, `list_models`.
- **P1 — common write operations**: `plan_import`, `add_note`,
  `add_notes`, `find_notes`, `get_tags`, `add_tags`, `remove_tags`,
  `diff`, `open_anki`, `sync`.
- **P2 — advanced workflows**: `store_media`, `get_media`,
  `collection_stats`.

## MCP is optional

The CLI is the main interface. `mcp` is one of 16 commands; the server
adds no capabilities the CLI lacks. `scripts/smoke-mcp.mjs` smoke-tests
the handshake (`initialize` → `tools/list` → `validate_xml`).
