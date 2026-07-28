# XML Schema v2 — Design Specification

This document is the design for v2 of the `anki-xml` XML schema. It is the
source of truth for what new XML constructs v2 introduces. No code has been
implemented for v2 features yet; this is a design specification only.

## Design principles

1. **Additive only.** Every v2 feature is a new optional element/attribute.
   No element changes meaning between v1 and v2.
2. **Version-gated.** v2 features activate only when `<anki version="2">` is
   declared. v1 files implicitly have `version="1"` and skip all v2 logic.
3. **Parser-friendly.** Every extension fits one of three patterns: new
   optional root child, new optional note attribute, or new optional note
   child. None require restructuring the tokenizer or two-pass pipeline.
4. **HTML-safe.** All new elements either don't contain HTML (metadata) or
   use the same CDATA convention as fields.
5. **Lossless round-trip.** A v2 file exported, modified, and re-imported
   via `mirror` produces a semantically identical result.
6. **Validator split.** v1 validators run on every file; v2 validators run
   only when `version="2"` (or higher). Validators never fail on v1 shapes.
7. **Unknown = warning, not error.** New unknown elements/attributes
   produce warnings, not parse failures.

## Schema version declaration

```xml
<anki version="2">
  <!-- all v1 + v2 features available -->
</anki>
```

The `version` attribute is optional on `<anki>`. If absent, defaults to
`"1"`. Only `"1"` and `"2"` are recognized; unknown major versions (e.g.
`"3"`) emit a warning but parsing continues.

---

## 1. Metadata block (`<meta>`)

```xml
<anki version="2" name="spanish-batch-2025-01">
  <meta>
    <title>Spanish Vocabulary — January 2025</title>
    <description>Initial vocab batch.</description>
    <author>anki-xml@user</author>
    <created>2025-01-15T10:30:00Z</created>
    <generator>anki-xml v2.0.0</generator>
    <default-deck>AI Import::Untagged</default-deck>
    <default-tags>
      <tag>ai-generated</tag>
      <tag>batch-2025-01</tag>
    </default-tags>
  </meta>
  ...
</anki>
```

**Why:** Collection-level context. Who generated it, when, why. Default tags
to apply to all notes (avoid repetition).

**Integration:** Optional child of `<anki>`; appears at most once; must
precede any `<note>`. Default tags are merged into each note's `tags`
attribute (per-note tags take precedence).

**Parser impact:** New optional `<meta>` extractor uses the same
field-extraction pattern as notes. No tokenizer changes.

**Validation:** `<meta>` must precede `<note>`s; otherwise `meta-after-notes`.
Unknown `<meta>` children → warning. `<created>` / `<updated>` must be ISO 8601.

**Migration:** v1 files have no `<meta>`. `migrate v1→v2` synthesizes one
from CLI flags.

---

## 2. GUIDs (`guid` attribute on `<note>`)

```xml
<note type="Basic" deck="..." id="1500000000042" guid="spanish::hola::2025-01-15">
```

**Why:** Stable identity independent of AnkiConnect's collection-scoped id.
Survives re-import, deck moves, profile switches.

**Integration:** `guid` is an optional attribute on `<note>`. Orthogonal to
`id` (Anki's id) and `slug` (human-readable). Used by `update --guid` and
`sync`. Recommended format: `namespace::slug::date` or UUID.

**Parser impact:** One more optional attribute extraction. Trivial.

**Validation:** Must be unique within the document; warns on duplicates.

**Migration:** v1 notes without `guid` continue working. `migrate` step can
synthesize GUIDs from `id` (e.g. `legacy::${id}`).

---

## 3. Source tracking (`<source>`)

```xml
<note type="Basic" deck="...">
  <source>
    <origin>chatgpt-2025-01-15</origin>
    <url>https://chatgpt.com/share/abc123</url>
    <prompt version="3">Generate 50 Spanish A1 vocabulary cards...</prompt>
    <model>gpt-4o-2024-08-06</model>
    <revision>2</revision>
    <parent guid="spanish::hola::2025-01-10"/>
  </source>
  <front>...</front>
</note>
```

**Why:** Provenance. When AI agents generate cards, you need to know which
prompt and model produced them so you can reproduce, audit, or revise.

**Integration:** Optional child of `<note>`, at most once, must appear before
fields. `<parent guid>` references another note's `guid` for revision chains.

**Parser impact:** New optional child extractor; reuses field-content
capture.

**Validation:** `<source>` must precede fields. `<parent guid>` must
reference an existing note in the same document; otherwise warning.

**Migration:** v1 notes have no `<source>`.

---

## 4. Media block (`<media>`)

```xml
<anki version="2">
  <media>
    <file name="moon-photo.png" hash="sha256:9f86...">iVBORw0KGgoAAA...</file>
    <file name="audio.mp3" source="https://example.com/audio.mp3"/>
  </media>
  <note type="Basic" deck="...">
    <front><![CDATA[<img src="moon-photo.png">]]></front>
  </note>
</anki>
```

**Why:** XML today references media via `<img src>` but doesn't carry the
media. Importing leaves broken links. `<media>` makes the file
self-contained.

**Integration:** Optional child of `<anki>`, at most once, must precede
`<note>`s. `<file>` has `name` (required), optional `hash`, and either
base64 content OR `source` attribute.

**Parser impact:** New `<media>` extractor. Inline mode reads base64;
source mode captures the URL for resolution at preflight.

**Validation:** `<media>` must precede `<note>`s. Every `name` must be
unique. If `hash` provided, must match (sha256). Every `src` in field
content must have a matching `<file>` or exist in the collection;
otherwise warning.

**Migration:** v1 files have no `<media>`. `attach-media` command can
synthesize a `<media>` block by scanning field content.

---

## 5. Note identity — three layers

```xml
<note
  type="Basic"
  deck="..."
  id="1500000000042"           <!-- AnkiConnect numeric id; collection-scoped -->
  guid="spanish::hola::2025-01-15"  <!-- portable cross-collection id -->
  slug="hola">                 <!-- human-readable local id (within deck) -->
```

| Attribute | Scope | Format | Stability |
|---|---|---|---|
| `id` | Anki collection | positive integer | Lost across collections |
| `guid` | Global | free-form string | Stable forever |
| `slug` | Within deck | URL-safe `[a-z0-9-]+` | Stable until renamed |

**Why:** Three identity layers serve different workflows.

**Integration:** All three optional. Any one is sufficient for `update`.
Lookup precedence: `id` > `guid` > `slug`.

**Parser impact:** Trivial — three more attribute reads.

**Validation:** Each identity attribute must be unique within the document.
`slug` must match `[a-z0-9-]+`.

**Migration:** v1 notes may have `id`; v1 → v2 conversion leaves it. To
add GUIDs, run `assign-guids`.

---

## 6. Update semantics (`op` attribute)

```xml
<anki version="2" op="upsert">  <!-- document-level default -->
<note type="Basic" id="..." op="update">  <!-- per-note override -->
```

| Value | Behavior |
|---|---|
| `create` | Add only; duplicates fail (matches v1 default) |
| `update` | Modify only; non-existent ids fail |
| `upsert` | Update if exists, create otherwise |
| `mirror` | File is canonical; create/update/delete drift |
| `append` | Create only; duplicates silently skipped |

**Why:** Re-importing the same file is awkward today. `op` makes intent
explicit. `mirror` enables the new `sync` command.

**Integration:** `op` attribute on `<anki>` (default) and `<note>`
(override).

**Parser impact:** One optional attribute read.

**Validation:** `op` must be enum value. `mirror` requires all notes to
declare identity.

**Migration:** v1 files have no `op`. Default is `create`.

---

## 7. Declarative state

```xml
<note type="Basic" id="..." suspended="true" flagged="red">
  <cards>
    <card n="1" interval="30" ease="2.5" reps="4" due="2025-02-01"/>
    <card n="2" suspended="false" interval="0" ease="2.5" reps="0"/>
  </cards>
</note>
```

**Why:** AI agents can't simulate scheduling scenarios without touching
the collection. Declarative state makes scheduling first-class in XML.

**Integration:**
- Note-level flags: optional attributes (`suspended`, `flagged`).
- Card-level scheduling: optional `<cards>` child with one `<card>` per
  Anki card.

**Parser impact:** Note-level: trivial attribute reads. Card-level: new
optional child extractor.

**Validation:** `flagged` must be one of `none|red|orange|green|blue|pink|purple|turquoise`. `interval` and `ease` must be non-negative. `due`
must be ISO 8601 or relative spec. `<card n>` must reference an existing
card (1-indexed).

**Migration:** v1 files have no scheduling.

---

## 8. Custom properties (`<props>`)

```xml
<note type="Basic" id="...">
  <props>
    <prop key="difficulty">easy</prop>
    <prop key="confident" type="boolean">true</prop>
    <prop key="score" type="number">0.87</prop>
    <prop key="tags-internal" type="json">{"workflow":"draft"}</prop>
  </props>
</note>
```

**Why:** Extensibility. Users will always want to attach things the schema
doesn't anticipate. `<props>` is a generic, typed key-value store.

**Integration:** Optional `<props>` child of `<note>`. Each `<prop>` has a
`key`, optional `type` (`string|number|boolean|date|json`, default
`string`), and CDATA-safe text content.

**Parser impact:** New optional child extractor; types are advisory only.

**Validation:** `key` must be unique. `key` should match `[a-zA-Z][a-zA-Z0-9_-]*`. If `type="json"`, content must be valid JSON. If
`type="boolean"`, content must be `true|false`. Unknown `type` → warning.

**Migration:** v1 files have no `<props>`. The block is never read by
Anki itself — it's metadata for tools/agents.

---

## 9. Future custom note types

```xml
<anki version="2">
  <meta>
    <models>
      <model name="Language::Phrase" parent="Basic" archetype="basic">
        <field name="phrase" required="true" xml-tag="phrase"/>
        <field name="translation" required="true" xml-tag="translation"/>
        <field name="image" xml-tag="image"/>
        <field name="pronunciation" xml-tag="pronunciation"/>
      </model>
    </models>
  </meta>
  <note type="Language::Phrase" deck="...">
    <phrase>Hola</phrase>
    <translation>Hello</translation>
  </note>
</anki>
```

**Why:** v1 hard-codes 5 note types. Custom note types are the most
requested feature.

**Integration:** `<model>` declarations live in `<meta>`. Each declares a
new note type with its fields. `<note type="…">` references a declared
model or a built-in.

**Parser impact:** Most invasive v2 extension. The model registry (P2.4
in roadmap) must be loaded from `<meta>` before note parsing. The field
extractor becomes a registry lookup.

**Validation:** `<model>` `name` must be unique. `<note type="…">` must
reference a known model. Field tags must match the model's declared
fields.

**Migration:** v1 files use only the 5 built-in models.

---

## Backward compatibility matrix

| Feature | v1 file behavior | v2 file behavior | v2 parser on v1 file |
|---|---|---|---|
| `<meta>` | absent | parsed, validated | ignored (no version=2) |
| `guid` | absent | parsed, validated | ignored |
| `<source>` | absent | parsed, validated | ignored |
| `<media>` | absent | parsed, validated | ignored |
| `slug` | absent | parsed, validated | ignored |
| `op` | absent | parsed, defaults to `create` | default `create` |
| `suspended`/`flagged` | absent | parsed, applied | ignored |
| `<cards>` | absent | parsed, applied | ignored |
| `<props>` | absent | parsed, validated | ignored |
| `<model>` | absent | registers new types | ignored |

**Result:** every v1 file is a valid v2 file with `version="1"` (or absent) —
same behavior, no changes, no warnings.

---

## Tokenizer impact — none

The existing tokenizer (hand-rolled, knows about `<`, `>`, `]]>`, CDATA
boundaries) handles every v2 construct without modification.

## Field-extractor impact — moderate

The current field extractor has a switch over 5 built-in models. For v2
custom models, this becomes a registry lookup:

```ts
const fieldMap = noteModelRegistry.get(noteType);
```

This is the **NoteModel registry** work from roadmap P2.4 — a prerequisite
for v2 custom model feature.

---

## Migration tool — `migrate` command

### Syntax

```
anki-xml migrate <file.xml> [--to-version N] [--output FILE] [--dry-run]
```

### Examples

```bash
# v1 → v2 (just adds version="2" attribute)
anki-xml migrate cards.xml --to-version 2 --output cards-v2.xml

# v1 → v2 with synthesized metadata
anki-xml migrate cards.xml --to-version 2 \
  --title "My Spanish Deck" \
  --default-tags "imported, vintage" \
  --output cards-v2.xml

# Strip v2 features (round-trip to v1)
anki-xml migrate cards-v2.xml --to-version 1 --output cards-v1.xml
```

### What `migrate` does

| From → To | Transformations |
|---|---|
| v1 → v2 | Add `version="2"`. Optionally synthesize `<meta>` from CLI flags. Optionally assign GUIDs. |
| v2 → v1 | Remove `version="2"`. Strip `<meta>`, `<media>`, `<source>`, `<props>`, `<cards>`. **Lossy** — emits warnings. |

---

## Status

This document is the design specification. Implementation is gated on
roadmap Phase 2 (NoteModel registry, P2.4) and the user's actual need for
custom note types. Until then, v1 features are sufficient.

References:

- [`roadmap.md`](./roadmap.md) — 12-commit implementation order
- [`architecture-review.md`](./architecture-review.md) — Top 10 ROI improvements