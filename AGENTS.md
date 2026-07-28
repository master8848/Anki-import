# AGENTS.md — `anki-xml` project guide

> **Audience**: AI agents (LLM coding tools, autonomous card-generation
> pipelines, agentic schedulers) **and** human contributors / reviewers
> who want to understand the project before touching it.
>
> **Purpose**: Give you everything you need to ship a change without
> re-deriving the project's design intent from scattered docs and
> commit messages. Read this first. Then read the linked documents.

---

## 1. Project overview

`anki-xml` is a CLI for importing, querying, and updating
[Anki](https://apps.ankiweb.net/) flashcards via
[AnkiConnect](https://foosoft.net/projects/anki-connect/). It exists
for one reason: **AI agents generate XML far more reliably than they
generate Markdown or hand-crafted HTTP**. This tool bridges that gap.

### What it is, in one sentence

A deterministic, idempotent, recoverable, self-documenting CLI that
treats an Anki collection as a writeable, branchable, mostly-Linux-path
file.

### What it is NOT

- Not an Anki replacement. Anki is the renderer; this is the bridge.
- Not a Markdown converter. There are other tools for that.
- Not a synchronization tool. It does not touch cloud storage.
- Not a scheduler. Card scheduling logic lives inside Anki.

### The one-paragraph pitch

```
anki-xml turns an XML file into Anki notes via the AnkiConnect API.
It validates strictly before any write, dry-runs any command for free,
surfaces structured errors with stable codes, ships an idempotency
key contract for safe retries, an atomic batch wrapper with auto-rollback,
a checkpoint / rollback / audit-log trio for crash recovery, named
profiles for multi-collection workflows, and shell completion for
bash/zsh/fish/powershell. Every command supports --json with a v1
envelope so AI agents can branch on code, never on message text.
```

---

## 2. Problems solved

The full design rationale lives in [`docs/problems-solved.md`](docs/problems-solved.md).
The TL;DR is below.

### 2.1 Problems this CLI solves

| Problem | Naive approach | Why it breaks | This tool's answer |
|---|---|---|---|
| AI agents generate broken XML | `let the parser handle it` | Bad `<note>`s reach Anki and corrupt the collection | Strict boundary handling in [`src/xml.ts`](src/xml.ts); every command runs validation before any write |
| Entities double-escape on round-trip | DOM walk + re-serialize | `<`, `&`, `'`, `"` get re-escaped or partially escaped | Hand-rolled tokenizer + source byte ranges; we never decode entities |
| CDATA contents get HTML-escaped | DOM sees text, not CDATA | The author's literal `&lt;` becomes `&amp;lt;` | CDATA tokens are copied verbatim with one explicit escape rule (see `docs/cdata.md`) |
| Void HTML tags swallow content | XML parser treats `<br>` as paired | `<back>line one<br>line two</back>` → Anki sees just `line one` | Tokenizer treats `<br>` and friends as boundary tokens; depth-counted close |
| Network drops leave partial imports | One big POST | Half-success, half-failure, no rollback path | `--batch-id` + `--rollback-on-partial` (M9); `--idempotency-key` (M10); `--resume-from` (M11); `checkpoint` + `rollback` (M2/M3) |
| `--json` shapes change every release | Ad-hoc per command | AI agents break every update | `--json` envelope `version: 1`; `error.code` contract; existing keys never removed within a major |
| Tags, decks, models drift between AI and Anki | Force the agent to know the schema | Agent invents fields that don't exist | `models` / `fields` / `tags` / `decks` discovery commands; `--auto-create-deck` for safe defaults |
| Math/LaTeX authors using `\(...\)` finds it doesn't render | Hope the user installs add-ons | Silent partial rendering of cards | `doctor` checks for MathJax (`1610307553`); `addon install` path; default-safe `[latex]...[/latex]` syntax documented in [`docs/latex.md`](docs/latex.md) |
| Older AnkiConnect doesn't expose add-on queries | Crash on `getAddons` | Agent loops forever | `doctor` reports `addons-queryable: false` early; `addon` commands surface `unsupported action` as a known error |

### 2.2 Problems we explicitly do NOT solve (and where to look instead)

- **Media uploads.** No `[media src="..."]` story. AnkiConnect has the API; the roadblock is collection state. Tracked in P4.4.
- **Custom note types.** The registry is data-driven, but `<meta>` block declaration in XML is P4.2 (deferred).
- **Real-time sync.** Use the cloud (AnkiWeb). This is a file-based tool.
- **Plugin host.** `src/plugins.ts` has the stub; waiting for 3 real plugin requests (P4.9).

---

## 3. Architecture

### 3.1 Layered model

```
┌──────────────────────────────────────────────────────────────────────┐
│                   ENTRY POINTS (3 distribution paths)                │
│   bun run src/index.ts   │   ./dist/cli.js   │   ./anki-xml binary  │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         CLI layer (src/cli/)                         │
│   argv parsing · command dispatch · output formatting · --help      │
│   wrappers · registry · completion                                   │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     Domain layer (src/*.ts)                          │
│   import · update · search · stats · doctor · migrate · ...          │
│   pure async fns, mockable via fetchImpl                             │
└────────┬─────────────────────────┬───────────────────┬───────────────┘
         │                         │                   │
         ▼                         ▼                   ▼
┌──────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐
│ XML / tokenizer  │  │  AnkiConnect client  │  │ State (checkpoints) │
│ (src/xml.ts,     │  │  (src/anki-connect)  │  │ (src/checkpoints,    │
│  src/models.ts)  │  │                      │  │  src/idempotency)    │
└──────────────────┘  └──────────────────────┘  └──────────────────────┘
```

### 3.2 Module map

| Module | Why it exists | What touches it |
|---|---|---|
| `src/xml.ts` | Source-byte tokenizer + strict boundary handling | All parsing-related commands (`import`, `update`, `validate`, `plan`, `sync`, `diff`, `sample`) |
| `src/models.ts` | Note-model registry (one source of truth for valid `type="..."` and field maps) | `xml.ts`, `import.ts`, `update.ts` |
| `src/anki-connect.ts` | Single class; every RPC is a typed method; injectable `fetchImpl` | All write-path commands; `doctor` |
| `src/doctor.ts` | Environment-check orchestrator | `cli/commands/doctor.ts`; `cli/commands/addon.ts` |
| `src/checkpoints.ts` | JSON snapshots for rollback | `checkpoint`, `rollback`, `import --resume-from`, `update --batch-id` |
| `src/idempotency.ts` | Skips a re-run whose key already succeeded | `--idempotency-key` flag |
| `src/config.ts` | Loads `.anki-xmlrc` + XDG config | Every command (via `parseArgs`) |
| `src/plugins.ts` | Stub for the P4.9 plugin host | (none yet; design only) |
| `src/cli/registry.ts` | Single source of truth for every CLI command | `--help`, `printCommandHelp`, dispatch loop |
| `src/cli/envelope.ts` | v1 JSON envelope + stable error codes | Every `--json` path |
| `src/cli/help.ts` | `--help` and `--version` text derived from the registry | `printHelp`, `printCommandHelp` |
| `src/cli/args.ts` | Hand-rolled argv parser; whitelists subcommand flags | Every command (via `parseArgs`) |
| `src/cli/commands/*.ts` | One file per command; thin `Command<T>` wrappers | `registry.ts`, `index.ts` (dispatch) |
| `src/cli/output.ts` | Human + JSON + NDJSON output helpers | Every command |
| `src/cli/run.ts` | Top-level orchestration: parseArgs → dispatch → exit code | `src/index.ts` |

### 3.3 Data flow on a write

```
agent file ─► file read ─► parseDocument ─► validateNotes
                                                  │
                                                  ▼
                              toAddNotePayloads ─► addNotes RPC ─► ImportResult
                                                    │
                                            ┌───────┴────────┐
                                            ▼                ▼
                                       checkpoint       audit-log
                                       (M2)             (JSONL)
```

Every box is pure and tested. Only `addNotes` and `fs.readFile` are
I/O; both are injectable.

---

## 4. Constraints — the design contract

Every part of the codebase carries these constraints. If you change a
constraint, you change a contract.

### 4.1 Cross-cutting constraints (apply everywhere)

1. **Determinism.** Same inputs → same outputs. No wall-clock timestamps
   in cache keys; no `Math.random()` without a seed; no UUIDs where a
   counter works.
2. **Idempotency.** Writes must be safe to re-run. If a network drops
   mid-batch, the agent retries the same batch and gets the same end
   state.
3. **Atomicity.** Validation gates mutation. Either every note in a
   batch is applied or none of them are. (Achieved via
   `--batch-id` + `--rollback-on-partial` and the all-or-nothing
   `addNotes` semantically.)
4. **Recoverability.** Every state-changing command records an
   audit-log line. Every batch creates a checkpoint on entry. Rollback
   is one command away.
5. **Inspectability.** Every command supports `--json` with a v1
   envelope. `error.code` is the contract. `error.message` may change.
6. **Composability.** Every command is pipeable. No interactive
   prompts. `--yes` is required for destructive commands.
7. **No new side effects without a verb.** Reads never write. Writes
   declare themselves with `--dry-run` at the default path.
8. **Error codes are stable across the major version.** If you add a
   new code, you're extending the contract. Existing codes never get
   reused with new semantics.
9. **CLI is data-driven.** Adding a command means adding an entry to
   `src/cli/registry.ts` and a file in `src/cli/commands/`. Nothing
   else should need to change.
10. **Library has no side effects beyond AnkiConnect.** No global
    mutable state, no `process.exit` inside library code (only at the
    very top of `src/index.ts`).

### 4.2 Per-module constraints

#### `src/xml.ts` — XML boundary handling

- **Never decode entities** in field content. Source bytes are copied
  verbatim except for the CDATA escape rule.
- **Tokenize, don't DOM-walk.** Use `fast-xml-parser` only for
  structural metadata (line offsets, attribute indices).
- **CDATA contents are copied verbatim** but with the documented
  escape rule: `&`, `<`, `>` get escaped; everything else is passed
  through. See `docs/cdata.md`.
- **Void HTML tags** (`br, hr, img, ...`) are boundary tokens; depth
  must not include them as opening pairs. See
  `docs/upstream-anki-markdown-review.md` for the full list.
- **Comments and processing instructions** have their own token kind
  and never appear in field content.
- **`error.location`** for XML errors must carry `{ line, column }`
  pointing at the source byte.

#### `src/anki-connect.ts` — RPC client

- **One class, typed methods.** No dynamic dispatch. Each method
  declares its parameter shape.
- **Inject `fetchImpl`.** Tests use a shim. Production uses the global.
- **`AnkiConnectError`** carries the error message verbatim and a
  discriminator for the `unsupported action` case (used by
  `addon` on older AnkiConnect).
- **Multi-action wrapper** (`action: "multi"`) is used for batched
  requests when a command needs > 1 RPC per call.

#### `src/models.ts` — Note-model registry

- **The registry is data.** Each model declares `accepts`,
  `required`, `optional`, `fieldNames`, and `buildFields` as a
  literal object — no class hierarchy.
- **Add a model in one file.** Do not duplicate the model's metadata
  in `xml.ts` or `update.ts`. Both look up in the registry.
- **Adding a custom note type** is a registry entry plus a
  `buildFields` function (P4.2 path).

#### `src/cli/envelope.ts` — JSON contract

- **Version is `1` and bumps only when removing a key.**
- **`error.code`** is a stable string; never branch on `error.message`.
- **Existing keys never removed.** A key may be deprecated but never
  removed without a major bump.
- **New keys may be added.** Agents should ignore unknown keys.
- **Argv is redacted** in `data.args` for sensitive values
  (e.g. `--api-token`); see `src/cli/redact.ts`.

#### `src/cli/registry.ts` — Command registry

- **Every command is a `Command<T>` object.** The shape is in
  `src/cli/command.ts`.
- **Adding a command requires updating tests:**
  - `tests/cli-internals.test.ts` (registry expectation)
  - `tests/cli.test.ts` (end-to-end)
  - A new `tests/<command>.test.ts` for the logic.
- **The grouping in `src/cli/help.ts` must be updated** to surface
  the command in `--help` under the right surface.

#### `src/cli/help.ts` — Help text

- **Derived from the registry.** No hand-edited command list.
- **Per-command `--help`** shows the command's positional args, its
  flags, the global flag catalogue, and at least one example.

#### `src/checkpoints.ts` — Rollback

- **JSON file per checkpoint** at
  `~/.local/share/anki-xml/checkpoints/<name>.json`.
- **Atomic write** via temp + rename so a process kill mid-write
  doesn't corrupt existing checkpoints.
- **Reserved names**: `pre-batch` is taken by `--batch-id`; never
  use a name starting with `_` (those are system checkpoints).

#### `src/idempotency.ts` — Skip on re-run

- **Keyed by the agent's `--idempotency-key`** plus the verb and a
  hash of the inputs.
- **Storage is local JSON** at
  `~/.local/share/anki-xml/idempotency.json`. mtime-based, not bcrypt.
- **Fail open if the file is corrupt.** Replace it with an empty one
  and let the next write fail loudly rather than silently re-running
  and corrupting state.

#### `src/doctor.ts` + `src/cli/commands/doctor.ts` — Env-check

- **Six checks run in order**: `anki-connect-reachable`,
  `anki-connect-version`, `collection-has-decks`,
  `collection-has-models`, `addons-queryable`,
  `mathjax-addon-installed`. Older AnkiConnect gracefully degrades
  `addons-queryable` and skips `mathjax-addon-installed`.
- **`ok: false` on `doctor` does NOT exit non-zero**, only when the
  process exit code is 2 (fatal). `doctor` returns the report.

### 4.3 Output-format constraints

- **Human text first.** Default output is human-readable text; `--json`
  is an opt-in override.
- **`--format ndjson`** streams one JSON record per line; the last
  record carries `_meta` (duration, timestamp, version, command).
- **`--no-color` and `--quiet`** are global; every command honors them.
- **No ANSI codes leak** when `--no-color` is set or `NO_COLOR` env
  var is present.

### 4.4 Test constraints

- **No network calls in tests.** Mock `fetch` with a one-line shim.
- **Tests live next to the code they cover.** `tests/<name>.test.ts`
  for `src/<name>.ts`.
- **One file = one concern.** Don't combine unrelated tests.
- **Edge cases deserve their own files** (`tests/edge-cases.test.ts`,
  `tests/upstream-regressions.test.ts`).
- **Snapshots are forbidden.** Use plain `expect(...)` against typed
  values; never compare rendered strings byte-for-byte.

---

## 5. JSON envelope contract (`version: 1`)

This is the most important contract in the codebase. **Always emit
valid v1; never branch on `version: 0` paths outside `--json-legacy`.**

### Success shape

```json
{
  "version": 1,
  "command": "search",
  "data": { /* command-specific */ },
  "warnings": [],
  "meta": { "duration_ms": 142, "timestamp": "...", "version": "0.0.1" }
}
```

### Error shape

```json
{
  "version": 1,
  "command": "import",
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Note 4: '<front>' is empty",
    "location": { "line": 12, "column": 4 }
  },
  "meta": { "duration_ms": 142, "timestamp": "...", "version": "0.0.1" }
}
```

### Stable error codes (`src/cli/envelope.ts`)

| Code | Source | Retryable | Notes |
|---|---|---|---|
| `ARG_MISSING` | CLI parse | no | A required positional / flag was missing |
| `ARG_INVALID` | CLI parse | no | A flag value failed validation |
| `FILE_NOT_FOUND` | CLI / lib | no | The input path doesn't exist |
| `FILE_READ_ERROR` | CLI / lib | no | The input path couldn't be read |
| `XML_PARSE_ERROR` | `xml.ts` | no | Malformed XML; `location` is set |
| `VALIDATION_ERROR` | `models.ts` | no | Notes failed structural validation |
| `ANKICONNECT_ERROR` | `anki-connect.ts` | sometimes | AnkiConnect returned an error envelope |
| `NETWORK_ERROR` | `anki-connect.ts` | yes | Cannot connect; usually Anki isn't running |
| `UNKNOWN_COMMAND` | CLI parse | no | Verb not registered |
| `UNKNOWN_SHELL` | CLI parse | no | `completion <shell>` got an unknown shell |
| `UNKNOWN_ERROR` | CLI / lib | no | Crash |

> **Rule for agents**: Branch on `code`. Never on `message`.
> See [`docs/ai-integration.md`](docs/ai-integration.md) §1 #4.

---

## 6. Discoverability — what to read, in what order

If you are new to the project:

1. **[`README.md`](README.md)** — one-screen pitch + install + quick start.
2. **This file (`AGENTS.md`)** — project overview, problems, constraints.
3. **[`docs/problems-solved.md`](docs/problems-solved.md)** — the rationale
   behind the "no DOM walk" decision and other shibboleths.
4. **[`docs/architecture-review.md`](docs/architecture-review.md)** —
   strengths, debt, future pain points, top-10 ROI items.
5. **[`docs/roadmap.md`](docs/roadmap.md)** — every milestone (P1..P4 +
   M1..M22) tracked.
6. **[`docs/cli.md`](docs/cli.md)** — global flags, exit codes, config
   precedence.
7. **[`docs/commands.md`](docs/commands.md)** — every command, with
   examples.
8. **[`docs/ai-integration.md`](docs/ai-integration.md)** — the AI
   agent's contract.
9. **[`docs/ai-cookbook.md`](docs/ai-cookbook.md)** — five canonical
   agent loops (DISCOVER → APPLY → VERIFY → ROLLBACK → RECOVER).
10. **[`CHANGELOG.md`](CHANGELOG.md)** — version history.
11. **[`CONTRIBUTING.md`](CONTRIBUTING.md)** — how to land a change.
12. **[`docs/extension-policy.md`](docs/extension-policy.md)** — when
    to extend the CLI vs. when to write a new tool.

If you are writing an AI agent that *uses* `anki-xml` (not one that
*develops* it):

- Jump straight to [`docs/ai-integration.md`](docs/ai-integration.md)
  and [`docs/ai-cookbook.md`](docs/ai-cookbook.md).

---

## 7. Quality gates

Before you commit:

| Gate | Tool | Threshold |
|---|---|---|
| All tests pass | `bun test` | 430 passing, 0 failing |
| Type-check | `bunx tsc --noEmit` | 0 errors |
| CLI runs | `bun run src/index.ts --version` | prints `anki-xml v0.0.1` |
| `--help` lists every command | `bun run src/index.ts --help` | count matches registry (34) |
| npm bundle builds | `bun run build:npm` | produces `dist/cli.js` |
| Node bundle runs | `node dist/cli.js --version` | prints banner |
| Required docs exist | `bun run publish:check` | OK |
| Examples validate | `bun test tests/cli.test.ts` | OK |

Run them all in one command:

```sh
bun test && bunx tsc --noEmit && bun run publish:check
```

If anything fails, **the commit is not ready**. Do not bypass.

---

## 8. Anti-patterns (do not do this)

The list below is the result of 30+ months of coding-tools development.
These are all things that *seem* like good ideas and are not.

1. **Do not re-introduce DOM-based parsing.** Tokens are the source
   of truth; see `docs/problems-solved.md`.
2. **Do not add a path for `MathJax` to "auto-install" without
   consent.** `addon install` is explicit. See
   `docs/extension-policy.md`.
3. **Do not put business logic in `src/cli/commands/*.ts`.** Pure
   `Command<T>` wrapper; logic belongs in `src/*.ts`.
4. **Do not add a global mutable singleton.** Everything must be
   createable from constructor args.
5. **Do not branch on `--json` to skip work.** The flag only changes
   the output formatter, not the calculation path.
6. **Do not bump the JSON envelope version silently.** Bumping is a
   breaking change for every agent upstream.
7. **Do not remove a key from `data.args` redaction.** Errors of
   this kind leak tokens.
8. **Do not "fix" `runs === []` by exiting 0 with empty data.** That
   hides a real failure for the agent.
9. **Do not call `process.exit` outside of `src/index.ts`.** Tests
   spawn the binary; library code returns an exit code, never exits.
10. **Do not parse XML in tests with regex.** Use the same tokenizer
    as production. (See `src/xml.ts`.)

---

## 9. Roadmap — what's done vs. what's deferred

Done across P1..P4 (every item that didn't require a plugin host)
plus the entire M1..M22 reliability and distribution layer. **34
commands** ship in v0.0.1; **430 tests** pass; **`bun run
publish:check` is "ready to publish"**.

Deferred (intentional, see [`docs/roadmap.md`](docs/roadmap.md)):

- **P4.9** Plugin system — stub in `src/plugins.ts`, waiting for 3
  real plugin requests.
- **P4.4** Media uploads — API ready, policy pending.
- **P4.2** Custom note types — registry-ready; XML surface is not.
- **P4.8 expanded** HTML preview in CLI — Anki's own browser is the
  canonical renderer.
- **M8 partial** Refactors R1/R4/R6 — low-value mechanical migrations.
- **M17** Watch mode — not needed for AI agents.
- **Schema v2** — see [`docs/schema-v2.md`](docs/schema-v2.md); wait
  for v1 to be painful in production.

---

## 10. License & contribution

- **MIT.** See [`LICENSE`](LICENSE).
- **Contributions welcome.** See [`CONTRIBUTING.md`](CONTRIBUTING.md).
- **Open an issue** with the right template before opening a PR.

For AI agent authors: if you generate a PR, **include the test that
reproduces the bug your change fixes**. Without a test, the PR is
incomplete.
