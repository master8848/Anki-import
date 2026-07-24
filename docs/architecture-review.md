# Architecture Review

This document is a read-only review of the `anki-xml` codebase as of the
current commit. It identifies strengths, technical debt, future pain points,
and missing abstractions, then ranks the top 10 improvements by ROI.

This document was originally produced as a design exercise; no code changes
have been made as a result of it. Implementation proceeds from
[`roadmap.md`](./roadmap.md).

## Summary

| Category | Count |
|---|---|
| Strengths | 6 |
| Technical debt (HIGH) | 2 |
| Technical debt (MEDIUM) | 4 |
| Technical debt (LOW) | 6 |
| Future pain points | 10 |
| Missing abstractions | 8 |
| Top ROI improvements | 10 |

---

## Strengths

### S1. `AnkiConnectClient` is well-designed

Single-purpose, narrowly scoped, takes `fetchImpl` for testability, throws
typed `AnkiConnectError`. No dead methods (after removing `addNote`).

### S2. CDATA-aware field extractor

The two-pass parsing (fast-xml-parser for structure + hand-rolled tokenizer
for HTML/CDATA boundaries) is non-trivial but correct. The CDATA escape
preserves existing entities, avoiding double-escape bugs.

### S3. Atomic import contract

If any note fails validation, no notes are sent. Matches the CLI contract;
prevents partial-creation surprises.

### S4. Tokenizer + fast-xml-parser composition

Each tool does what it's good at. The tokenizer never knows what an element
*means*; the parser never has to handle CDATA semantics.

### S5. Exit-code convention

`0` = success, `1` = partial, `2` = fatal. Documented in `cli.md`. Consistent
across all five commands.

### S6. Test seams

`fetchImpl` injection, `autoCreateDeck` injection, `dryRun` flag, `import.meta.main`
gate on `process.exit`. Every side effect is overridable for tests.

---

## Technical Debt

### D1. `src/index.ts` is overweight (HIGH)

~570 lines mixing VERSION, printHelp, parseArgs, CliError, runImport,
runDecks, parseStatsSubArgs, runStats, parseSearchSubArgs, runSearch,
parseUpdateSubArgs, runUpdateCmd, main.

**Why it matters:** Every new command requires editing this file twice
(add to dispatch + define runner). Adding the 6th command (`validate`) will
tip it past 700 lines.

**Fix:** Split into `src/cli/{index,import,decks,stats,search,update}.ts`.
One command per file; `index.ts` only does dispatch.

### D2. Model knowledge in two parallel switches (HIGH)

`buildFields` and `validateNotes` both have a `switch (note.type)` over the
same 5 supported models. Adding a 6th model requires editing both, and the
two switches can drift out of sync.

**Why it matters:** The roadmap adds custom note types (P4.2) which would
multiply these switches by N. Without consolidation, the bug surface
doubles.

**Fix:** Introduce a `NoteModel` registry keyed by model name. Each entry
holds: field map (XML tag → Anki display name), required fields, allowed
fields, format hints. Both `buildFields` and `validateNotes` look up by
key; one switch lives in the registry.

### D3. `id` re-parsed via regex in `update.ts` (MEDIUM)

`extractNoteIdFromSource` in `src/update.ts` uses regex
`/<note\b([^>]*)>/g` to find `<note id="…">`. Cannot handle `<note>` inside
CDATA/comments.

**Why it matters:** Correctness gap for edge-case files. The fix is trivial.

**Fix:** Promote `id` to a first-class `ParsedNote` attribute (P2.5). One
more attribute extraction; existing extraction path already has the source
position.

### D4. Inconsistent error handling across commands (MEDIUM)

5 different try/catch shapes in `src/index.ts`. `runUpdateCmd` wraps
`runUpdate` but NOT `loadUpdatesFromXml`, so an `XmlParseError` from file
loading becomes an uncaught Promise rejection.

**Why it matters:** The bug in `runUpdateCmd` is a real crash, not a
hypothetical one. Inconsistent shapes make it easy to introduce more.

**Fix:** `withFatal(fn)` helper that catches, logs, and returns the right
exit code. Every command uses it. Closes the `runUpdateCmd` bug immediately.

### D5. `rest: string[]` bag two-pass parsing (MEDIUM)

`parseArgs` collects subcommand flags into `args.rest`, then each command
re-parses `rest` with its own bespoke `parseXSubArgs`. Two passes through
the same string array, with no schema.

**Why it matters:** Adding a flag to `update` requires touching `parseArgs`
(to whitelist it) AND `parseUpdateSubArgs`. The whitelist in `parseArgs`
is a hardcoded `Set` that's already wrong (forgot `--tags`).

**Fix:** Per-command flag schema (P2.7). Flags become data; `parseArgs`
calls the schema to validate. No more re-parsing.

### D6. Informal type safety at XML boundary (MEDIUM)

`nodeTagName`, `nodeChildren`, `nodeStart` all do `as Record<string, …>`
casts. `META` is `XMLParser.getMetaDataSymbol() as unknown as symbol`.

**Why it matters:** Module-level fragility. `fast-xml-parser` internals could
change. The Symbol cast is invisible from outside.

**Fix:** Wrap in a `parseDocument` boundary. Make the two helpers private
and document them as "fast-xml-parser adapters."

### D7. `parseNotes` / `parseDocument` wrapper redundancy (LOW)

Both functions call `parseNotesInner`. `parseNotes` is only documented as
"prefer `parseDocument`."

**Fix:** Make `parseDocument` the only public XML entry. `parseNotes` becomes
internal or deleted.

### D8. `{html: string}` pointless wrapping (LOW)

Every field extractor returns `{ html }`. The object wrapper serves no
purpose; the value is always accessed as `.html`.

**Fix:** Change `extractFieldContent` to return `string` directly. Drop the
wrapper type.

### D9. Hardcoded field maps in `update.ts` (LOW)

`mapDisplayNameToXmlTag` is a hand-rolled reverse map. Adding a custom note
type requires editing this map (and the registry, see D2).

**Fix:** Same `NoteModel` registry as D2. One source of truth.

### D10. "Internal:" guards (LOW)

Several `XmlParseError("Internal: ...")` for impossible states. These should
be `assert`/`invariant` or just typed out by TypeScript.

**Fix:** Tighten types so impossible states are unrepresentable. Replace
`Internal:` errors with structural assertions.

### D11. Dead `importFromFile` branch (LOW)

`if (validNotes.length === 0)` after the validation pass — the validation
pass already errors on empty documents, so this branch is unreachable.

**Fix:** Delete.

### D12. No extension-failure tests (LOW)

No test that exercises a malformed XML extension (e.g. an unknown
`xsi:schemaLocation`). `fast-xml-parser` behavior on these is documented
elsewhere but not pinned by a test.

**Fix:** Add a fixture + test for "unknown attribute" and "unknown
element" to lock behavior.

---

## Future Pain Points

### F1. Custom note types

Users will want note types beyond the 5 built-ins. Each new type = 3-file
edit (xml.ts switch × 2, update.ts map). The registry (P2.4) is the
prerequisite.

### F2. Tag manipulation

No `tag` / `untag` command. AnkiConnect natively supports it; missing here.
Blocking for any "bulk re-tag" workflow.

### F3. Deck migration

No way to rename, move, or delete decks. AnkiConnect's `changeDeck` /
`deleteDecks` are unused.

### F4. Media ingestion

`<img>` references in fields require the file in the collection's media
folder. No way to upload media as part of an XML import. This is the #1
upstream issue.

### F5. Delete / export

Cannot delete notes from the CLI. Cannot export to XML. Both are
batch-mutation primitives.

### F6. Batched `updateNoteFields`

`update` sends one `updateNoteFields` per note. AnkiConnect supports a
`multi` action that batches. At 500+ notes the round-trips matter.

### F7. `--plan` mode

No way to ask "what would this import do?" without doing it. Agents need
this for safe automation.

### F8. AI-friendly stable JSON

Today `--json` outputs a flat array (e.g. `decks --json`). The shape
varies per command. An AI agent has to learn 5 different JSON contracts.
The envelope versioning (P2.8) is the first step.

### F9. Multilingual content

Field content is treated as opaque HTML. Right-to-left languages,
combining characters, and Unicode normalization edge cases aren't tested.

### F10. Schema versioning

There's no `version` attribute on `<anki>`. Future schema additions have
no opt-in mechanism. The v2 design ([`schema-v2.md`](./schema-v2.md))
adds `version="2"`.

---

## Missing Abstractions

### M1. `NoteModel` registry

See D2. Single source of truth for note-type structure.

### M2. CLI command interface

No `Command` interface; commands are switch-case arms. The roadmap's P2.2
introduces:

```ts
interface Command {
  name: string;
  aliases: string[];
  description: string;
  flags: FlagSchema;
  run: (args: ParsedFlags, ctx: Context) => Promise<number>;
}
```

### M3. Typed `RpcResult<T>`

`AnkiConnectResponse<T>` has `result: T | null, error: string | null`. The
client unwraps manually. A typed `RpcResult<T> = { ok: true, value: T } | { ok: false, error: AnkiConnectError }` would let callers branch on
discriminated union.

### M4. Field source buffer

`extractFieldContent` allocates one string per field via `+=`. For large
files with many fields, this is O(n²) in the worst case. A `StringBuilder`
or `Array.join` would be O(n).

### M5. Argv parser

`parseArgs` is hand-rolled. A schema-driven parser would be ~30 lines
instead of ~60.

### M6. Output formatting layer

No `formatOutput(data, { json, color, quiet })` helper. Each command has
its own bespoke output. P2.3 is the fix.

### M7. AnkiConnect response factories

Methods like `deckNames()`, `addNotes(...)` return raw arrays. There's no
factory that says "this method may return null on protocol error." P2.9.

### M8. `src/util/` module

No general-purpose utilities. `stripHtml` lives in `search.ts` but is
generic. Should be in `src/util/html.ts`.

---

## Module Boundaries (recommended)

After Phase 2 refactor:

```
src/
├── cli/        — argv parsing, command dispatch, output formatting
│   ├── index.ts
│   ├── import.ts
│   ├── decks.ts
│   ├── stats.ts
│   ├── search.ts
│   └── update.ts
├── domain/     — NoteModel registry, types
├── xml/        — parser, tokenizer, validator, pcdata, html
├── anki/       — client, types, errors
├── commands/   — high-level workflows (runImport, runDecks, ...)
└── util/       — html, json
```

This is a 6-directory split. Lower effort than full DDD layering; high
clarity gain.

---

## Top 10 Improvements (by ROI)

ROI = (priority × value) / effort. Ranked highest to lowest.

| # | Improvement | Effort | Value | Why it's #1-10 |
|---|---|---|---|---|
| 1 | **Split `src/index.ts` into `cli/`** | medium | high | Removes ~400 lines of duplicated boilerplate. Closes the `runUpdateCmd` uncaught-rejection bug as a side effect. |
| 2 | **Introduce `NoteModel` registry** | medium | high | Removes D2 (parallel switches). Unlocks P4.2 (custom note types). |
| 3 | **Promote `id` to first-class `ParsedNote`** | easy | medium | Closes D3 (regex scan). One-line change with high test coverage gain. |
| 4 | **Introduce `formatOutput(data, renderer, { json })` helper** | easy | medium | Unifies human/JSON output. Removes per-command bespoke code. |
| 5 | **Add `withFatal(fn)` helper** | easy | high | Closes the `runUpdateCmd` uncaught-rejection bug. Three lines of code; large reliability gain. |
| 6 | **Move `stripHtml` from `search.ts` to `src/util/html.ts`** | easy | low | Trivial. Sets up M8 (util module). |
| 7 | **Make `parseDocument` the only public XML entry** | easy | low | Removes D7 (wrapper redundancy). One file edit. |
| 8 | **Add `version: 1` envelope to every JSON output** | easy | medium | First step toward P2.8. Breaks `--json` consumers (mitigated). |
| 9 | **Replace `attrs["@_x"] ?? ""` with `getAttr` / `requireAttr` helpers** | easy | low | Removes D6 (informal type safety) at the call sites. |
| 10 | **Introduce typed `RpcResult<T>` for AnkiConnect** | easy | medium | Removes M3. Sets up P2.9. |

Items 1, 2, 5 are the only "must-do" items. The rest are easy wins.

## Severity Classification

- **HIGH**: must fix in next 2 commits (D1, D2, D5 has a real bug)
- **MEDIUM**: should fix in next quarter
- **LOW**: nice-to-have, fix opportunistically

Only D1 and D2 are rated HIGH. The rest are MEDIUM or LOW. This codebase
is in good shape.