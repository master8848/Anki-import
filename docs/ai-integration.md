# AI Agent Integration Guide

This document is the bridge between the design work (commands, schema,
roadmap) and an actual AI agent that uses `anki-xml` as its backend.

## Audience

- AI engineers building card-generation pipelines.
- Tool authors wrapping `anki-xml` as a backend.
- Anyone scripting against the CLI from any language.

## Design Principles for Agent Integration

1. **JSON is the canonical output.** Every command supports `--json`. Every
   JSON output has a stable shape (envelope contract below).
2. **Reads are idempotent.** `decks`, `stats`, `search`, `notes get`, `tags`,
   `media list` may be called any number of times without side effects.
3. **Writes are explicit.** No command mutates the collection without an
   explicit verb (`import`, `update`, `delete`, `sync`, `tag`, `cards`).
   Read commands never write.
4. **Errors carry codes.** Every error in `--json` output has a stable
   `code` string. Branch on `code`, never on message text.
5. **Dry-run by default for state-changing commands.** `import --dry-run`,
   `update --dry-run`, etc. An agent should always dry-run first.
6. **The XML file is the agent's scratch space.** Agents should keep one
   XML file per logical unit (batch, deck, project) and use it as a staging
   area between operations.

## JSON Envelope Contract

Every command that supports `--json` returns one of two envelope shapes:

### Success envelope

```json
{
  "version": 1,
  "command": "search",
  "data": { /* command-specific */ }
}
```

### Error envelope

```json
{
  "version": 1,
  "command": "import",
  "ok": false,
  "error": {
    "code": "XmlParseError",
    "message": "Unterminated CDATA at line 47",
    "location": { "line": 47, "column": 12 }
  }
}
```

Notes:

- `version` is the JSON envelope schema version. Independent of the XML
  document `version` attribute.
- `command` is the verb that produced this output.
- `ok` is omitted on success, present and `false` on failure.
- `error.location` is optional; only present when the error has a position.

If `--json` is omitted, output is human-readable text with no envelope.
**Agents must always pass `--json`.**

## Stable JSON Shapes Per Command

This is the reference every agent codes against.

### `decks`

```json
{
  "version": 1, "command": "decks",
  "data": {
    "decks": [{"name": "Default", "id": 1, "cardCount": 0, "noteCount": 0}],
    "totalCards": 47, "totalNotes": 23
  }
}
```

### `stats`

```json
{
  "version": 1, "command": "stats",
  "data": {
    "deck": "AI Import::Spanish",
    "cardCount": 47, "noteCount": 23,
    "states": {"new": 12, "learning": 3, "review": 28, "suspended": 4, "buried": 0}
  }
}
```

### `search`

```json
{
  "version": 1, "command": "search",
  "data": {
    "query": "tag:spanish",
    "hits": [{"noteId": 1500000000042, "type": "Basic", "deck": "...", "tags": [], "snippet": "...", "cards": []}],
    "total": 1, "truncated": false
  }
}
```

### `validate`

```json
{
  "version": 1, "command": "validate",
  "data": {
    "file": "cards.xml", "valid": true, "noteCount": 47,
    "errors": [], "warnings": [],
    "decks": ["AI Import::Spanish"]
  }
}
```

### `plan`

```json
{
  "version": 1, "command": "plan",
  "data": {
    "file": "cards.xml", "parsed": 47,
    "wouldCreate": 45, "wouldReject": 2,
    "errors": [{"noteNumber": 12, "code": "Duplicate", "existingNoteId": 1500000000042}],
    "decksToCreate": ["AI Import::Spanish::Grammar"]
  }
}
```

### `import` (success)

```json
{
  "version": 1, "command": "import",
  "data": {
    "file": "cards.xml", "created": 45,
    "noteIds": [1500000000100, 1500000000101],
    "decksCreated": ["AI Import::Spanish::Grammar"],
    "warnings": []
  }
}
```

### `update`

```json
{
  "version": 1, "command": "update",
  "data": {
    "matched": 47, "succeeded": 46,
    "failed": [{"noteId": 1500000000123, "code": "NotFound"}]
  }
}
```

(Other commands follow the same envelope pattern. See
[`cli-command-design.md`](./cli-command-design.md) for full specs.)

---

## Canonical Workflows

### Workflow 1: Generate, Validate, Plan, Import

```typescript
async function generateAndImport(xml: string): Promise<void> {
  const path = await stageFile(xml);

  // Step 1: validate (no network)
  const validation = await ankiXml(["validate", path, "--json"]);
  if (!validation.data.valid) throw new ValidationError(validation.data.errors);

  // Step 2: plan (network: canAddNotes, deck check)
  const plan = await ankiXml(["plan", path, "--json"]);
  if (plan.data.wouldReject > 0) {
    // Decide policy: strict (abort), lenient (drop rejected), report (ask user)
  }

  // Step 3: import
  const result = await ankiXml(["import", path, "--json"]);
  if (result.ok === false) throw new ImportError(result.error);

  return result.data;
}
```

### Workflow 2: Round-trip edit

```typescript
async function editDeck(deck: string, edits: (xml: string) => string): Promise<void> {
  const xml = await runCommand(["export", "--deck", deck, "--include-ids"]);
  const edited = edits(xml);
  await stageFile(edited);

  const diff = await ankiXml(["diff", "staged.xml", "--against-deck", deck, "--json"]);
  if (diff.data.summary.changed === 0) return;

  const dryRun = await ankiXml(["sync", "staged.xml", "--strategy", "create-or-update", "--dry-run", "--json"]);
  // Present plan to user
  await ankiXml(["sync", "staged.xml", "--strategy", "create-or-update", "--json"]);
}
```

### Workflow 3: Bulk tag

```typescript
async function bulkTag(query: string, tags: string[]): Promise<void> {
  const matches = await ankiXml(["search", "--query", query, "--json"]);
  const noteIds = matches.data.hits.map(h => h.noteId);
  if (noteIds.length === 0) return;
  await ankiXml(["tag", "--add", tags.join(","), "--ids", noteIds.join(","), "--yes"]);
}
```

---

## Error Code Reference

Every error in JSON output has a `code`. **Never branch on `message`** —
it may change between versions.

| Code | Source | Meaning | Action |
|---|---|---|---|
| `XmlParseError` | CLI | File is malformed XML | Show file:line, abort |
| `ValidationError` | CLI | Notes failed structural validation | Inspect `details[]` |
| `AnkiConnectError` | Network | AnkiConnect returned an error | Inspect `message`, retry |
| `AnkiUnreachable` | Network | Cannot connect to AnkiConnect | Verify Anki is running |
| `PermissionDenied` | AnkiConnect | `requestPermission` not granted | Prompt user to grant |
| `Duplicate` | Preflight / Anki | Note already exists | Skip or update |
| `NotFound` | Anki | Note/deck/model id doesn't exist | Verify ids |
| `CliError` | CLI | Bad CLI input | Agent bug, log and fix |
| `InternalError` | CLI | Unexpected crash | Capture stderr, file issue |

### Retry policy

| Code | Retryable? | Backoff |
|---|---|---|
| `XmlParseError` | no | n/a |
| `ValidationError` | no (deterministic) | n/a |
| `AnkiConnectError` | sometimes | 1s, 3s, 10s |
| `AnkiUnreachable` | yes | 1s, 3s, 10s, 30s, then abort |
| `PermissionDenied` | yes (after user action) | none until granted |
| `Duplicate` | no (deterministic) | branch on it |
| `NotFound` | no | fix batch |

---

## Idempotency Strategies

### Pattern A: Idempotent create (use `plan` first)

```typescript
const plan = await ankiXml(["plan", path, "--json"]);
const newNotesOnly = filterPlan(plan.data, "create");
await ankiXml(["import", filterToNewNotes(path, newNotesOnly), "--json"]);
```

### Pattern B: Idempotent update

`update --file` with `<note id>` is idempotent. Re-running produces no
change.

### Pattern C: Resumable tag

Tag operations are idempotent. Add a tag that's already there is a no-op.

### Pattern D: Resumable sync

`sync --strategy mirror` is the most idempotent operation.

---

## Performance Budgets

| Operation | Latency | Notes |
|---|---|---|
| `validate` | <100ms | Pure parsing, no network |
| `plan` (50 notes) | <500ms | One AnkiConnect roundtrip |
| `import` (50 notes) | 1-2s | `addNotes` + `createDeck` |
| `import` (500 notes) | 5-15s | Larger batches |
| `import` (5000 notes) | 30-90s | Split into 500-1000 chunks |
| `search` | <1s | Server-side search |

Throttling:

- Sequential calls: no throttle needed.
- Parallel calls: max concurrency 3-5.

---

## Common Pitfalls

1. **Not passing `--json`** — agent gets unparseable human output.
2. **Parsing the message field** — message text may change; use `code`.
3. **Re-running without idempotency** — use `plan` or `sync --strategy mirror`.
4. **Forgetting `--yes` on destructive commands** — they hang on stdin.
5. **Mixing deck-naming conventions** — use `Parent::Child`, not `/` or `.`.
6. **Calling `notes get` with stale ids** — ids are not stable across re-imports.
7. **Ignoring warnings** — some warnings are load-bearing.

---

## Reference Agent Implementation

```typescript
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const exec = promisify(execFile);

interface AnkiXmlResponse {
  version: 1;
  command: string;
  ok?: false;
  data?: any;
  error?: { code: string; message: string; details?: any[]; location?: any };
}

async function ankiXml(args: string[]): Promise<AnkiXmlResponse> {
  try {
    const { stdout } = await exec("anki-xml", [...args, "--json"], {
      maxBuffer: 50 * 1024 * 1024,
    });
    return JSON.parse(stdout);
  } catch (err: any) {
    try {
      return JSON.parse(err.stdout);
    } catch {
      throw new Error(`anki-xml ${args[0]} failed: ${err.stderr}`);
    }
  }
}

async function withStagedXml<T>(xml: string, fn: (path: string) => Promise<T>): Promise<T> {
  const path = join(tmpdir(), `anki-${Date.now()}-${Math.random().toString(36).slice(2)}.xml`);
  await writeFile(path, xml);
  try {
    return await fn(path);
  } finally {
    await unlink(path).catch(() => {});
  }
}

async function generateSpanishBatch(prompt: string): Promise<void> {
  let xml: string = await callLLM(prompt);

  // Validate with retry
  for (let i = 0; i < 3; i++) {
    const v = await withStagedXml(xml, p => ankiXml(["validate", p]));
    if (v.data?.valid) break;
    xml = await callLLM(prompt + "\n\nFix these errors:\n" + JSON.stringify(v.data?.errors));
  }

  await withStagedXml(xml, async p => {
    const plan = await ankiXml(["plan", p]);
    if (plan.data?.wouldReject > 0) {
      throw new Error(`Plan rejected ${plan.data.wouldReject} notes`);
    }
    const result = await ankiXml(["import", p]);
    console.log(`Created ${result.data?.created} notes`);
  });
}
```

---

## Cross-Reference Index

- **Commands**: `docs/commands.md` + [`cli-command-design.md`](./cli-command-design.md)
- **XML schema**: `docs/xml-cookbook.md` + [`schema-v2.md`](./schema-v2.md)
- **Roadmap**: [`roadmap.md`](./roadmap.md)
- **Architecture**: [`architecture-review.md`](./architecture-review.md)
- **Error codes**: this document
- **JSON shapes**: this document + [`cli-command-design.md`](./cli-command-design.md)

## Versioning Compatibility Promise

Within envelope `version: 1`:

- **Existing keys never removed.** A key may be deprecated but is never
  removed without a major version bump.
- **New keys may be added.** Agents should ignore unknown keys.
- **Enum values may grow.** Treat unknown values as "skip and log."

When a breaking change is necessary:

- A new envelope version is introduced (`version: 2`).
- The old version continues to work for one release cycle.
- An opt-in `--json-legacy` flag forces the old shape.

This is the same contract `kubectl`, `gh`, and `aws` cli provide.