# Roadmap

> **Historical milestone tracker (pre-monorepo).** The M-milestone
> tables below track the original project; several rows describe
> commands that no longer exist or were renamed in the monorepo
> restructure. The **current** command/tool surface is
> `docs/cli-design.md` and `docs/mcp-design.md`; release status is
> `docs/release-checklist.md`. Do not edit milestone rows as if they
> described today's code — only `docs/cli-design.md` is the source
> of truth for the current surface.

This document is the implementation plan for `anki-xml`. The
**Status** section at the bottom carries the current, canonical
numbers (commands, tests, tools).

## Priorities

In order:

1. **AI-first workflows.** Every feature should make the CLI easier
   to drive from an LLM agent loop.
2. **Backward compatibility.** The v1 XML contract (`<anki>` →
   `<note>` → `<front>`/`<back>`/`<text>`/`<extra>`/`<addReverse>`,
   CDATA for HTML) must keep working unchanged. New features are
   opt-in via flags or new attributes.
3. **XML as source of truth.** No sidecar state files. New workflows
   (delete, move, tag) accept XML first; the agent owns the XML.
4. **Composable CLI.** `anki-xml search --json | jq … | xargs
   anki-xml update` keeps working. Each command does one thing;
   flags combine predictably.
5. **Avoid unnecessary complexity.** No plugin system until 3 real
   plugins exist. No schema v2 until v1 is painful.

## Phases

### Phase 1 — Small improvements (low risk, polish)

| # | Feature | Status |
|---|---|---|
| P1.1 | `--json` on import/update | ✅ shipped |
| P1.2 | `validate` subcommand | ✅ shipped |
| P1.3 | Structured error locations | ✅ shipped |
| P1.4 | `--allow-duplicate` | ✅ shipped |
| P1.5 | `update --tags` | ✅ shipped |
| P1.6 | Per-command `--help` | ✅ shipped |
| P1.7 | Field-name convention doc | ✅ shipped |
| P1.8 | Unknown-element warnings | ✅ shipped |
| P1.9 | Tag validation | ✅ shipped |
| P1.10 | Shell completion | ✅ shipped |

### Phase 2 — Major CLI improvements (architectural)

| # | Feature | Status |
|---|---|---|
| P2.1 | Split `src/index.ts` into `cli/` | ✅ shipped |
| P2.2 | Command registry | ✅ shipped |
| P2.3 | `formatOutput` helper | ✅ shipped |
| P2.4 | `NoteModel` registry | ✅ shipped |
| P2.5 | `id` as first-class on `ParsedNote` | ✅ shipped |
| P2.6 | `withFatal(fn)` helper | ✅ shipped |
| P2.7 | Per-command flag schema | ✅ shipped |
| P2.8 | JSON envelope versioning | ✅ shipped |
| P2.9 | Typed `RpcResult<T>` | ✅ shipped |
| P2.10 | Extension-policy doc | ✅ shipped |

### Phase 3 — AI workflow improvements

| # | Feature | Status |
|---|---|---|
| P3.1 | `canAddNotes` preflight | ✅ shipped |
| P3.2 | `plan` subcommand | ✅ shipped |
| P3.3 | `export` subcommand | ✅ shipped |
| P3.4 | `diff` subcommand | ✅ shipped |
| P3.5 | `tag`/`untag` subcommands | ✅ shipped |
| P3.6 | NDJSON streaming | ✅ shipped |
| P3.7 | `<anki version="1">` declaration | ✅ shipped |
| P3.8 | `--no-color`/`--quiet` | ✅ shipped |
| P3.9 | `find-and-update` helper | ✅ shipped |
| P3.10 | AI cookbook expansion | ✅ shipped |

### Phase 4 — Advanced power-user features

| # | Feature | Status |
|---|---|---|
| P4.1 | `delete` subcommand | ✅ shipped |
| P4.2 | Custom note types | ✅ shipped (stub) |
| P4.3 | Media ingestion | ✅ shipped (`<img>` references preserved) |
| P4.4 | Deck operations | ✅ shipped |
| P4.5 | Card scheduling | ✅ shipped |
| P4.6 | `sync` subcommand | ✅ shipped |
| P4.7 | Schema migration tool | ✅ shipped (`assign-guids`) |
| P4.8 | `preview` subcommand | ✅ shipped |
| P4.9 | Plugin hooks | ⏸ deferred |
| P4.10 | Multi-collection profiles | ✅ shipped |

### Next-phase — M1..M12 (AI-agent reliability)

| # | Feature | Status |
|---|---|---|
| M1 | Schema discovery (`models`/`fields`/`tags`/`note-info`) | ✅ shipped |
| M2 | Checkpoint capture + audit log | ✅ shipped |
| M3 | Rollback command | ✅ shipped |
| M4 | Sample (deterministic random) | ✅ shipped |
| M5 | Schema-validate (live drift detector) | ✅ shipped |
| M6 | `stats --field` cardinality | ✅ shipped |
| M7 | `createClient` + `toAddNotePayload` helpers | ✅ shipped |
| M8 | Refactors (R5/R7/R8 partial; R1/R4/R6 deferred) | ⏸ partial |
| M9 | `--batch-id --rollback-on-partial` atomic wrapper | ✅ shipped |
| M10 | `--idempotency-key` retry safety | ✅ shipped |
| M11 | `import --resume-from <checkpoint>` | ✅ shipped |
| M12 | `update --rename-field Old=New` | ✅ shipped |

### M13..M22 — Polish + distribution + add-ons

| # | Feature | Status |
|---|---|---|
| M13 | `doctor` command | ✅ shipped |
| M14 | Config file (`.anki-xmlrc`) + `--config` flag | ✅ shipped |
| M15 | Top-level `README.md` | ✅ shipped |
| M16 | `CHANGELOG.md`, `LICENSE`, `CONTRIBUTING.md` | ✅ shipped |
| M17 | Watch mode | ✅ shipped (as `watch`, in the monorepo CLI) |
| M18 | Bun standalone-binary build | ⏸ superseded — monorepo ships a Node rslib bundle |
| M19 | Top-level `README.md` help surface grouped by category | ✅ shipped |
| M20 | Per-command help with positional argument + examples | ✅ shipped |
| M21 | npm distribution (Node ≥ 18 CommonJS bundle; `npm i -g` and `npx`) | ⏸ not active — see `docs/release-checklist.md` |
| M22 | `addon` command + `doctor` add-on checks + MathJax detection | ✅ shipped |

## Original commit log (Phase 1..4)

| Commit | Features | Risk |
|---|---|---|
| 1 | P1.2 + P1.7 + P1.9 + P1.10 | none |
| 2 | P2.1 + P2.2 + P2.3 + P2.6 | low |
| 3 | P2.4 + P2.5 + P2.7 | low |
| 4 | P2.8 + P2.10 + P1.3 | low |
| 5 | P1.1 + P1.4 + P1.5 + P1.6 + P1.8 | low |
| 6 | P3.7 + P3.10 + P3.8 + P3.9 | low |
| 7 | P2.9 + P3.1 + P3.2 | low |
| 8 | P3.3 + P3.5 + P3.6 | medium |
| 9 | P4.1 + P4.4 + P4.5 | medium |
| 10 | P4.7 + P3.4 + P4.6 | medium |
| 11 | P4.2 + P4.3 + P4.8 + P4.10 | high |
| 12 | P4.9 | deferred per extension-policy.md |

All 11 priority commits shipped. See `git log`.

## Status (current)

**16 commands ship** — see `docs/cli-design.md` for the canonical
surface. **178 tests pass** (`bun run test`). MCP serves **18 tools**
— see `docs/mcp-design.md`. The v0.0.4 monorepo restructure is
complete; npm distribution is **not active yet** (see
`docs/release-checklist.md`). These are the only three numbers that
describe today's code; milestone rows above are historical.

**Deferred items:**

- **P4.9 plugin hooks** — waiting for 3 real plugin requests.

## Out of scope until requested

These are listed in `FUTURE_FEATURES.md` but deliberately excluded
because they violate "avoid unnecessary complexity":

- Plugin system (P4.9) — wait for 3 real plugin requests
- Schema v2 — wait for v1 to be painful in production
- HTML preview (P4.8) — Anki's own browser is the canonical renderer
- AI-assisted HTML→Markdown conversion — too risky
- Watch mode (M17) — not needed for AI agents

## See also

- [`CHANGELOG.md`](../CHANGELOG.md) — per-commit entry for every
  milestone shipped this session
- [`docs/extension-policy.md`](./extension-policy.md) — when to add
  commands vs. when to write a new tool
- [`docs/architecture-review.md`](./architecture-review.md) — design
  rationale