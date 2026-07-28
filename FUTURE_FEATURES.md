# Future features for review

> **Status: historical.** This file documents proposals that were
> considered during the v1 design phase. It is now superseded by the
> 12-commit implementation plan in [`docs/roadmap.md`](./docs/roadmap.md),
> which contains the same items prioritized, ordered, and ready to
> implement. Nothing here should be inferred to work in the current CLI.

## How to use this file

- For **proposals being considered**: see [`docs/roadmap.md`](./docs/roadmap.md).
- For **what's actually built**: see [`docs/commands.md`](./docs/commands.md).
- For **design rationale**: see [`docs/architecture-review.md`](./docs/architecture-review.md).

## Proposals tracked here (now in roadmap)

| Original proposal | Roadmap ID |
|---|---|
| Preflight with `canAddNotes` | P3.1 + P3.2 |
| Actionable per-note errors | P1.3 |
| Resource and parser limits | P3.6 (NDJSON streaming) |
| AnkiConnect version handshake | (folded into `doctor`) |
| Extensible custom-model syntax | P4.2 |
| Capability profiles | deferred (no demand) |
| Type-in Markdown profile | deferred (upstream unsettled) |
| XML media manifest | P4.3 |
| AI-generated media provenance | (future) |
| `plan` / `--report` JSON | P3.2 |
| Quality linting | P1.8 (warnings only) |
| Configurable duplicate strategy | P1.4 (`--allow-duplicate`) |
| Stable source identity (`key`) | (see schema-v2.md `guid`/`slug`) |
| Chunked import with reports | P3.6 |
| Export existing notes | P3.3 |
| HTML→Markdown conversion | deferred (too risky) |
| Agent-assisted conversion | deferred (privacy concerns) |
| Strict mode for unknown elements | P1.8 |
| Generic `<field name="…">` model | P4.2 |
| Better source locations (line/column) | P1.3 |
| No-trim mode | deferred |
| Local HTML preview | P4.8 |
| Markdown preview | deferred |
| Editor shortcuts | out of scope |

## Original proposal text (preserved for reference)

The rest of this file preserves the original v1-era proposal text so the
design rationale is not lost. It is not maintained; for current state, see
the roadmap.

### [ ] Preflight every valid payload with AnkiConnect

Use `canAddNotes` before `addNotes`. Now addressed by P3.1 + P3.2.

### [ ] Actionable per-note AnkiConnect errors

Explore `canAddNotesWithErrorDetail`. Now addressed by P1.3.

### [ ] Resource and parser limits

Maximum file bytes, notes per file, element depth. Now addressed by P3.6.

### [ ] Explicit AnkiConnect version handshake

Call `version` before mutations. Folded into `doctor`.

### [~] Extensible custom-model syntax

Add a generic `<field name="…">` syntax. Now addressed by P4.2 (gated on
P2.4 NoteModel registry).

### [ ] Capability profiles

`builtin-html`, `terkelg-anki-markdown`. Deferred — no third-party profile
has shipped.

### [ ] Type-in Markdown profile

Wait for upstream. Deferred.

### [ ] XML media manifest

Add `<media>` block. Now addressed by P4.3 (in [`schema-v2.md`](./docs/schema-v2.md)).

### [ ] AI-generated media provenance

Sidecar report or note tags. Future.

### [ ] `plan` / machine-readable dry-run

`anki-xml plan cards.xml` + `--report report.json`. Now addressed by P3.2.

### [ ] Quality linting for AI flashcards

Length checks, duplicate fronts, Markdown fences in HTML. Now addressed by
P1.8 (warnings only).

### [ ] Configurable duplicate strategy

`error`, `skip`, `allow`, `update`. Now addressed by P1.4 (`--allow-duplicate`).

### [ ] Stable source identity

`<note key="…">`. Replaced by `guid`/`slug` in v2 schema.

### [ ] Chunked import with resumable reports

500-1000 note chunks. Now addressed by P3.6.

### [ ] Export existing notes

`export` subcommand. Now addressed by P3.3.

### [ ] HTML→Markdown conversion

Real HTML parser, not regex. Deferred — too risky for bulk destructive use.

### [ ] Agent-assisted conversion

Requires provider/privacy review. Deferred.

### [ ] Strict mode for unknown elements

`--strict-schema`. Now addressed by P1.8.

### [ ] Generic `<field name="…">` model

Now addressed by P4.2.

### [ ] Better source locations

Line/column in errors. Now addressed by P1.3.

### [ ] No-trim mode

Deferred.

### [ ] Local HTML preview

Read-only generated report. Now addressed by P4.8 (gated on sandboxing work).

### [ ] Markdown preview

Deferred.

### [ ] Editor shortcuts

Upstream concern, out of scope here.

## Explicit non-goals unless requirements change

- Reimplement Shiki themes/language downloads.
- Patch Anki card margins, dark mode, scrolling, template labels.
- Execute card scripts to test `localStorage`/`sessionStorage`.
- Silently sanitize, rewrite, or "improve" AI-generated content.
- Add cards without a dry-run path in an interactive AI workflow.

## Review checklist (preserved)

Before selecting an item for implementation:

- [ ] Is it owned by a transport CLI rather than Anki reviewer/editor add-on?
- [ ] Is the current v1 HTML contract backward-compatible?
- [ ] Is there a dry-run/preflight story?
- [ ] Are destructive and privacy implications explicit?
- [ ] Are source note numbers preserved in every error/result?
- [ ] Does it have unit, protocol-mock, fixture, and failure-path tests?
- [ ] Are docs and examples outside the test suite updated?