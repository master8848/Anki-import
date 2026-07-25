# Roadmap

This document is the implementation plan for `anki-xml` going forward. It is
the source of truth for what we're building, in what order, and why.

## Priorities

In order:

1. **AI-first workflows.** Every feature should make the CLI easier to drive
   from an LLM agent loop.
2. **Backward compatibility.** The v1 XML contract (`<anki>` → `<note>` →
   `<front>`/`<back>`/`<text>`/`<extra>`/`<addReverse>`, CDATA for HTML) must
   keep working unchanged. New features are opt-in via flags or new attributes.
3. **XML as source of truth.** No sidecar state files. New workflows (delete,
   move, tag) accept XML first; the agent owns the XML.
4. **Composable CLI.** `anki-xml search --json | jq … | xargs anki-xml update`
   keeps working. Each command does one thing; flags combine predictably.
5. **Avoid unnecessary complexity.** No plugin system until 3 real plugins
   exist. No schema v2 until v1 is painful. No custom note types until 1
   real use case.

## Phases

### Phase 1 — Small improvements (low risk, polish)

| # | Feature | Why | Diff | Impact | Breaking | Priority |
|---|---|---|---|---|---|---|
| P1.1 | `--json` on import/update | Machine-readable import results | easy | small | no | 9 |
| P1.2 | `validate` subcommand | Standalone parse+validate, no network | easy | small | no | 8 |
| P1.3 | Structured error locations | File/line offsets in validation errors | medium | small | no | 7 |
| P1.4 | `--allow-duplicate` | Re-import without atomic failure | easy | small | no | 7 |
| P1.5 | `update --tags` | Bulk re-tag from CLI | medium | small | no | 7 |
| P1.6 | Per-command `--help` | Discoverability | easy | small | no | 6 |
| P1.7 | Field-name convention doc | AI author reference | easy | none | no | 6 |
| P1.8 | Unknown-element warnings | AI typo feedback | easy | small | no | 5 |
| P1.9 | Tag validation | Catch malformed tags at parse time | easy | small | no | 5 |
| P1.10 | Shell completion | Easier CLI use | easy | small | no | 4 |

### Phase 2 — Major CLI improvements (architectural)

| # | Feature | Why | Diff | Impact | Breaking | Priority |
|---|---|---|---|---|---|---|
| P2.1 | Split `src/index.ts` into `cli/` | Largest single file; mixes dispatch + business | medium | medium | no | 9 |
| P2.2 | Command registry | Replace switch with data-driven dispatch | medium | medium | no | 8 |
| P2.3 | `formatOutput` helper | Consistent --json / --human / color | easy | small | no | 8 |
| P2.4 | `NoteModel` registry | Unlocks custom note types (P4.2) | medium | medium | no | 8 |
| P2.5 | `id` as first-class on `ParsedNote` | Stop regex-scanning source for id | easy | small | no | 7 |
| P2.6 | `withFatal(fn)` helper | Uniform error handling | easy | small | no | 7 |
| P2.7 | Per-command flag schema | Flags as data, not code | medium | small | no | 7 |
| P2.8 | JSON envelope versioning | `{version:1, command, data}` wrapper | easy | small | **minor** | 9 |
| P2.9 | Typed `RpcResult<T>` | Distinguish success/failure at type level | easy | small | no | 6 |
| P2.10 | Extension-policy doc | Document how to add commands/fields/models | easy | none | no | 5 |

### Phase 3 — AI workflow improvements

| # | Feature | Why | Diff | Impact | Breaking | Priority |
|---|---|---|---|---|---|---|
| P3.1 | `canAddNotes` preflight | Detect duplicates before mutation | medium | medium | no | 9 |
| P3.2 | `plan` subcommand | Machine-readable preflight report | medium | medium | no | 9 |
| P3.3 | `export` subcommand | Collection → XML round-trip | medium | medium | no | 8 |
| P3.4 | `diff` subcommand | File vs collection comparison | medium | medium | no | 7 |
| P3.5 | `tag`/`untag` subcommands | Bulk tag mutation | easy | small | no | 6 |
| P3.6 | NDJSON streaming | Stream large result sets | easy | small | no | 5 |
| P3.7 | `<anki version="1">` declaration | Schema-version opt-in | easy | small | no | 6 |
| P3.8 | `--no-color`/`--quiet` | Scriptable output | easy | small | no | 4 |
| P3.9 | `find-and-update` helper | One-shot search→update pipeline | easy | small | no | 7 |
| P3.10 | AI cookbook expansion | More agent examples | easy | none | no | 6 |

### Phase 4 — Advanced power-user features

| # | Feature | Why | Diff | Impact | Breaking | Priority |
|---|---|---|---|---|---|---|
| P4.1 | `delete` subcommand | Bulk note removal | easy | small | no | 9 |
| P4.2 | Custom note types | Support non-built-in models | hard | large | no | 7 |
| P4.3 | Media ingestion | `<img>` references work after import | hard | large | no | 6 |
| P4.4 | Deck operations | rename/move/delete decks | medium | medium | no | 6 |
| P4.5 | Card scheduling | suspend/unsuspend/bury from XML | medium | medium | no | 5 |
| P4.6 | `sync` subcommand | File ↔ collection reconciliation | medium | medium | no | 5 |
| P4.7 | Schema migration tool | `migrate v1→v2`, `assign-guids` | medium | small | no | 4 |
| P4.8 | `preview` subcommand | Render-side HTML snapshot | medium | medium | no | 4 |
| P4.9 | Plugin hooks | User-defined commands | hard | large | no | 3 |
| P4.10 | Multi-collection profiles | Multiple AnkiConnect URLs | medium | medium | no | 4 |

## Recommended implementation order

12 commits. Each commit is independently testable and passes `bun test`.

| Commit | Features | Risk | Notes |
|---|---|---|---|
| 1 | P1.2 + P1.7 + P1.9 + P1.10 | none | Housekeeping; docs + small additions |
| 2 | P2.1 + P2.2 + P2.3 + P2.6 | low | Architectural split; same behavior |
| 3 | P2.4 + P2.5 + P2.7 | low | Data-driven foundation |
| 4 | P2.8 + P2.10 + P1.3 | low | Only minor breaking change (P2.8) |
| 5 | P1.1 + P1.4 + P1.5 + P1.6 + P1.8 | low | Rest of Phase 1 |
| 6 | P3.7 + P3.10 + P3.8 + P3.9 | low | Phase 3 docs + low-effort AI |
| 7 | P2.9 + P3.1 + P3.2 | low | Typed RPC + preflight + plan |
| 8 | P3.3 + P3.5 + P3.6 | medium | Export, tag/untag, NDJSON |
| 9 | P4.1 + P4.4 + P4.5 | medium | Delete, deck ops, card scheduling |
| 10 | P4.7 + P3.4 + P4.6 | medium | Schema migration, diff, sync |
| 11 | P4.2 + P4.3 + P4.8 + P4.10 | high | Custom models, media, preview, multi-profile |
| 12 | P4.9 | high | Plugins, **deferred until 3 real requests materialize** |

## Status

Commits 1–11 are shipped (see `git log`). Commit 12 is intentionally
deferred per the table above; see `src/plugins.ts` for the design
notes that will guide the eventual implementation.

## Breaking changes

Only **one** feature has even a minor breaking change:

- **P2.8 (JSON envelope versioning)**: `--json` output gets a `{version: 1, command, data}` wrapper.
  - Mitigation: opt-in via `--json` (consumers using jq today ignore unknown keys).
  - Escape hatch: `--json-legacy` for one release cycle.

Every other feature is purely additive (new command, new flag, new optional attribute).

## Out of scope until requested

These are listed in `FUTURE_FEATURES.md` but deliberately excluded from the
roadmap because they violate "avoid unnecessary complexity":

- Plugin system (P4.9) — wait for 3 real plugin requests
- Schema v2 — wait for v1 to be painful in production
- Custom note types (P4.2) — wait for 1 real use case
- HTML preview (P4.8) — Anki's own browser is the canonical renderer
- AI-assisted HTML→Markdown conversion (was P2 in FUTURE_FEATURES.md) — too risky

## Status

This document is the source of truth. `FUTURE_FEATURES.md` is now a historical
record of proposals; this roadmap supersedes it.

Implementation progress is tracked in this file's commit log.