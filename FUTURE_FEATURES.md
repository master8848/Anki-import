# Future features for review

This file contains **proposals only**. Nothing here should be inferred to work
in the current CLI. Items are separated from user documentation so they can be
accepted, rejected, or reprioritized without changing the v1 contract.

Status key:

- `[ ]` not started
- `[~]` needs design/prototype
- `[x]` implemented (move it into normal docs when complete)

## Proposed priorities

| Priority | Theme | Why |
|---|---|---|
| P0 | Import safety and diagnostics | Bulk AI output must fail predictably before it mutates a collection. |
| P1 | Custom/Markdown note types | Enables intentional integration with `terkelg/anki-markdown`. |
| P1 | Media ingestion | AI decks commonly contain generated images/audio. |
| P1 | Reviewable AI plans | Users should see exactly what a bulk operation will do. |
| P2 | Duplicate/update workflows | Re-running generation should not require manual cleanup. |
| P2 | Existing-note migration | Supports adoption for collections that already exist. |
| P2 | Extensible XML schema | Needed for arbitrary Anki models and fields. |
| P3 | Preview/rendering UI | Useful, but should not duplicate an editor add-on prematurely. |

---

## P0 — Import safety and diagnostics

### [ ] Preflight every valid payload with AnkiConnect

Use `canAddNotes` before `addNotes` so duplicate/model/deck problems can be
reported before any note is created. Local XML validation is now atomic, but a
server-side `addNotes` batch can still return per-note failures.

Acceptance criteria:

- Show the original 1-based XML note number for every preflight failure.
- Do not call `addNotes` when any preflight result is false in strict mode.
- Add an explicit `--allow-partial` mode rather than making partial creation the
  accidental default.
- Test duplicate, missing model, missing field, and mixed-result responses.

### [ ] Actionable per-note AnkiConnect errors

Current `addNotes` null entries produce a generic “rejected this note” message.
Explore `canAddNotesWithErrorDetail` where available, with a compatibility
fallback for older AnkiConnect versions.

Acceptance criteria:

- Report duplicate vs invalid model/field/deck where the API provides detail.
- Preserve note-number alignment through filtering and batching.
- Include the action and endpoint in fatal protocol errors without printing
  field contents that may be sensitive.

### [ ] Resource and parser limits

AI output can be accidentally enormous or deeply nested.

Design questions:

- Maximum file bytes, notes per file, element depth, field bytes, and tag count.
- Whether to reject every `DOCTYPE` instead of continuing to ignore it.
- Whether limits are defaults with override flags or hard safety bounds.

Acceptance criteria:

- Fail before AnkiConnect with a clear limit name/value.
- Add tests for deep nesting, huge fields, entity/DTD declarations, and many
  tokens.
- Do not regress common HTML nesting or code-heavy CDATA.

### [ ] Explicit supported AnkiConnect version handshake

Call `version` before mutating operations and fail with install/startup guidance
when AnkiConnect is absent or incompatible.

---

## P1 — Custom note types and Anki Markdown compatibility

Motivation: upstream issues
[#23](https://github.com/terkelg/anki-markdown/issues/23),
[#27](https://github.com/terkelg/anki-markdown/issues/27),
[#33](https://github.com/terkelg/anki-markdown/issues/33), and
[#39](https://github.com/terkelg/anki-markdown/issues/39), plus its AI skill.

### [~] Add an extensible custom-model syntax

Do not simply add two strings to `SUPPORTED_MODELS`. Built-in fields currently
receive HTML and CDATA is escaped for HTML safety; upstream Markdown fields need
raw Markdown source. The format distinction must be explicit.

One design candidate (not approved):

```xml
<anki deck="AI" defaultFormat="html">
  <note type="Anki Markdown" format="markdown">
    <field name="Front"><![CDATA[What does **RAII** mean?]]></field>
    <field name="Back"><![CDATA[Resource Acquisition Is Initialization.]]></field>
  </note>
</anki>
```

Questions to resolve:

- Is `format` document-, note-, or field-level?
- In Markdown mode, should CDATA be copied literally instead of escaped for
  destination HTML?
- Should arbitrary nested XML be forbidden inside a generic `<field>`?
- How are field names validated against the installed model?
- Should `Anki Markdown Cloze` comma ordinals be version-gated?

Acceptance criteria:

- Query `modelNames`/`modelFieldNames` before import.
- Preserve raw Markdown punctuation, indentation, fenced code, and inline HTML
  according to a normative format document.
- Give a clear “install/configure the Anki Markdown add-on” error if its model is
  absent.
- Add compatibility fixtures for upstream issues #10, #33, #36, #39, #43,
  #44, #45, and #48.
- Keep current built-in HTML behavior unchanged.

### [ ] Capability profiles instead of hard-coded third-party behavior

Potential profiles:

- `builtin-html` (current behavior)
- `terkelg-anki-markdown`
- user-supplied model/field mapping

A profile should describe model names, required fields, source format, and
optional syntax checks without bundling reviewer code.

### [ ] Type-in Markdown profile

Wait for upstream issue
[#39](https://github.com/terkelg/anki-markdown/issues/39)/PR #40 to settle its
model and field contract. Do not guess a model name that may change.

---

## P1 — Media ingestion

Related to upstream open PR #47 (direct image paste), but this CLI needs a
non-editor solution.

### [ ] XML media manifest

Possible shape (not approved):

```xml
<anki deck="Biology">
  <media src="./assets/cell.png" name="cell.png"/>
  <note type="Basic">
    <front>Identify <img src="cell.png" alt="cell diagram"/></front>
    <back>Animal cell</back>
  </note>
</anki>
```

Acceptance criteria:

- Resolve paths relative to the XML file, not the process working directory.
- Reject traversal outside an explicitly allowed root.
- Use `storeMediaFile`; verify names/checksums and avoid unnecessary upload.
- Support binary data without embedding huge base64 strings in XML by default.
- Dry-run reports missing, duplicate, and conflicting files.
- Upload media before notes only after the full plan passes preflight.

### [ ] AI-generated media provenance

Optionally record source prompt/model/license/checksum in a sidecar report or
note tags without leaking secrets into card fields.

---

## P1 — Reviewable AI import plans

### [ ] `plan` / machine-readable dry-run output

Proposed commands:

```bash
anki-xml plan cards.xml
anki-xml import cards.xml --report report.json
```

The plan should show:

- destination decks/models;
- note counts and card-count estimates;
- tags and field previews;
- duplicate/preflight status;
- media additions; and
- a stable source-note index/fingerprint.

Acceptance criteria:

- `--json` has a versioned schema.
- Human output truncates safely while JSON retains complete values.
- No mutation in plan/dry-run mode, including no deck creation or media upload.
- A later import can optionally verify that the reviewed file hash is
  unchanged.

### [ ] Quality linting for AI flashcards

Opt-in warnings, not hard validation:

- answer/front too long;
- multiple unrelated questions in one note;
- duplicate or near-duplicate fronts;
- Cloze with too many ordinals;
- missing tags/context;
- Markdown fences sent to a built-in HTML model;
- script/event-handler content;
- image without alt text.

Never silently rewrite educational content.

---

## P2 — Duplicate, update, and re-import workflows

### [ ] Configurable duplicate strategy

Candidate modes:

- `error` (current effective behavior)
- `skip`
- `allow`
- `update` by explicit key/fingerprint

Acceptance criteria:

- Never infer an update target from fuzzy text alone.
- Scope duplicate checks by model/deck according to documented options.
- Report created/skipped/updated/failed separately.
- Tests cover repeated fronts in different decks and different note types.

### [ ] Stable source identity

Consider an optional `key` attribute:

```xml
<note key="biology-cell-001" type="Basic">...</note>
```

Possible mappings include a dedicated field, deterministic tag, or sidecar
state. Each has search/sync/privacy trade-offs that require design review.

### [ ] Chunked import with resumable reports

Current code sends one `addNotes` request, and a regression test covers 250
notes. Larger batches may need configurable chunks.

Acceptance criteria:

- Preserve source note numbers and result ordering across chunks.
- Write a report after each completed chunk.
- Retrying cannot duplicate already-created notes without an explicit strategy.
- Preflight the complete operation before chunk 1 in strict mode.

---

## P2 — Existing-note migration

Motivation: upstream
[#34](https://github.com/terkelg/anki-markdown/issues/34).

### [ ] Export existing notes to XML

Query by Anki search expression and emit reviewable XML with note IDs, models,
fields, tags, and decks. Round-trip rules must be specified before updates are
allowed.

### [ ] Previewed HTML → Markdown conversion

Do not copy upstream's regex-only on-save converter for bulk destructive use.
Use a real HTML parser and cover at least:

- paragraphs/divs and `<br>`;
- bold/italic/strike/mark;
- links/images;
- ordered/unordered nested lists;
- tables;
- `<pre><code>` with language recovery where possible;
- headings and blockquotes;
- unsupported tags while preserving text; and
- existing literal Markdown mixed with HTML.

Acceptance criteria:

- Default is preview/diff only.
- Backup/export before update.
- Explicit approval before writing.
- Preserve note IDs, tags, deck placement, and card scheduling.
- Never send card content to an LLM unless the user chooses a provider and
  explicitly opts in.

### [ ] Optional agent-assisted conversion

If added, require local diff review and provider/privacy documentation. A
deterministic converter remains the baseline and fallback.

---

## P2 — XML language evolution

### [ ] Strict mode for unknown elements/attributes

v1 silently ignores unknown field tags. For AI generation, a typo such as
`<frount>` should be surfaced rather than becoming only a secondary “missing
front” error.

Candidate flag:

```bash
anki-xml import cards.xml --strict-schema
```

Acceptance criteria:

- Identify unknown element/attribute and note number.
- Suggest close supported names without silently changing input.
- Decide whether strict becomes the default in a major version.

### [ ] Generic `<field name="…">` model

Needed for arbitrary custom models. Define duplicate names, ordering, case
sensitivity, empty fields, nested markup, and format handling first.

### [ ] Better source locations

Errors currently identify note numbers. Add line/column and, where possible,
field names/source ranges to make large AI files repairable.

### [ ] Optional no-trim mode

Current payload construction trims field boundaries. Only add this if a real
Anki model demonstrates that boundary whitespace is semantically required.

---

## P3 — Preview and UI

### [ ] Local HTML preview for built-in models

A read-only generated report could show field HTML before import. It must be
sandboxed because v1 intentionally transports unsanitized HTML/scripts.

### [ ] Markdown preview only after format profiles exist

Upstream issue
[#27](https://github.com/terkelg/anki-markdown/issues/27) is an editor concern.
If this CLI adds preview, use the selected model profile's renderer and label it
as an approximation; do not imply it exactly reproduces every Anki client.

### [ ] Editor shortcuts/buttons

Upstream issue
[#42](https://github.com/terkelg/anki-markdown/issues/42) should remain upstream.
This CLI can generate complete Cloze syntax and does not need to patch Anki's
editor UI.

---

## Explicit non-goals unless requirements change

- Reimplement Shiki themes/language downloads in this importer.
- Patch Anki card margins, dark mode, scrolling, or template labels.
- Execute card scripts to test `localStorage`/`sessionStorage`.
- Silently sanitize, rewrite, or “improve” AI-generated educational content.
- Add cards without a review/dry-run path in an interactive AI workflow.

## Review checklist

Before selecting an item for implementation:

- [ ] Is it owned by a transport CLI rather than an Anki reviewer/editor add-on?
- [ ] Is the current v1 HTML contract backward-compatible?
- [ ] Is there a dry-run/preflight story?
- [ ] Are destructive and privacy implications explicit?
- [ ] Are source note numbers preserved in every error/result?
- [ ] Does it have unit, protocol-mock, fixture, and failure-path tests?
- [ ] Are docs and examples outside the test suite updated?
