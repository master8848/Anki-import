# Field-name conventions

This document is the canonical reference for the XML field tag names and
the Anki field display names they map to. Use it whenever you're writing
XML by hand or generating it from a script.

## The two-layer naming

`anki-xml` uses two distinct naming layers:

| Layer | Used in | Style | Example |
|---|---|---|---|
| **XML tag** | `<front>`, `<back>`, `<text>`, `<extra>`, `<addReverse>` | lowercase, camelCase | `<front>` |
| **Anki display** | `Front`, `Back`, `Text`, `Extra`, `Add Reverse` | Title Case, spaces allowed | `Front` |

The XML tag is what you write. The Anki display name is what you pass to
`update --field` and what you see in Anki's card editor.

## Built-in models (v1)

These are the five models that ship with every fresh Anki install and are
supported out of the box:

### `Basic`

| XML tag | Required? | Anki display name |
|---|---|---|
| `<front>` | yes | `Front` |
| `<back>` | yes | `Back` |

Generates one card (front → back).

### `Basic (and reversed card)`

| XML tag | Required? | Anki display name |
|---|---|---|
| `<front>` | yes | `Front` |
| `<back>` | yes | `Back` |

Generates two cards (front → back, back → front).

### `Basic (type in the answer)`

| XML tag | Required? | Anki display name |
|---|---|---|
| `<front>` | yes | `Front` |
| `<back>` | yes | `Back` |

Generates one card (front → typed answer).

### `Basic (optional reversed card)`

| XML tag | Required? | Anki display name |
|---|---|---|
| `<front>` | yes | `Front` |
| `<back>` | yes | `Back` |
| `<addReverse>` | yes | `Add Reverse` (must be `yes` or `no`) |
| `<extra>` | no | `Extra` |

The `<addReverse>` element controls whether the reversed card is created
for each note. Its value must be exactly `yes` or `no` (case-insensitive).

### `Cloze`

| XML tag | Required? | Anki display name |
|---|---|---|
| `<text>` | yes | `Text` (must contain `{{c1::...}}` markers) |
| `<extra>` | no | `Extra` |

The `<text>` field must contain at least one Cloze marker:
`{{c1::hidden text}}`. Multiple ordinals are supported:
`{{c1,2::hidden on cards 1 and 2}}`.

## Forbidden combinations

These combinations are rejected at validation:

| Model | Forbidden element |
|---|---|
| `Basic`, `Basic (and reversed card)`, `Basic (type in the answer)` | `<text>`, `<extra>`, `<addReverse>` |
| `Basic (optional reversed card)` | `<text>` |
| `Cloze` | `<front>`, `<back>`, `<addReverse>` |

## Examples

### Basic

```xml
<note type="Basic" deck="AI Import::Spanish">
  <front>Hola</front>
  <back>Hello</back>
</note>
```

### Basic (optional reversed card)

```xml
<note type="Basic (optional reversed card)" deck="AI Import::Spanish">
  <front>Hola</front>
  <back>Hello</back>
  <addReverse>yes</addReverse>
  <extra><![CDATA[<i>Common greeting</i>]]></extra>
</note>
```

### Cloze

```xml
<note type="Cloze" deck="AI Import::Spanish">
  <text>The capital of Spain is {{c1::Madrid}}.</text>
  <extra>Located in central Iberia.</extra>
</note>
```

## Field reference for `update --field`

When updating fields, use the **Anki display name**:

```bash
# Correct (Anki display name)
anki-xml update --id 1500000000042 --field Front="Hola, ¿qué tal?"

# Wrong (XML tag — AnkiConnect will reject)
anki-xml update --id 1500000000042 --field front="..."
```

The display name is case-sensitive and includes spaces (e.g. `Add Reverse`,
not `AddReverse` or `add_reverse`).

## Field content

Field content is HTML. Plain text is fine; wrap structured content in
`<![CDATA[ … ]]>` if it contains `<`, `>`, `&`, or spans multiple lines.
See [`cdata.md`](./cdata.md) and [`html.md`](./html.md).

## Future custom models

v1 supports only the five built-in models above. Custom note types are
planned for Phase 4 (see [`roadmap.md`](./roadmap.md) P4.2) and gated on
the NoteModel registry (P2.4). The v2 schema (see [`schema-v2.md`](./schema-v2.md))
introduces `<meta><models><model name=…>` declarations for that purpose.