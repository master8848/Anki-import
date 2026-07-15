# Usage

How to write `<anki>` XML for this tool, with simple and complex
examples for every supported note type.

## Document shape

Every file is a single `<anki>` element. Inside it, one or more
`<note>` elements, each tagged with a `type` attribute naming the
Anki note type. Inside each `<note>`, the field tags differ by
type — see below.

```xml
<anki deck="Deck Name">                <!-- default deck for the file -->
  <note type="...">                     <!-- required, one of 5 types -->
    <field>...</field>                  <!-- type-specific -->
  </note>
  ...
</anki>
```

Optional attributes on `<note>`:

- `type`  — required, one of: `Basic`, `Basic (and reversed card)`,
  `Basic (optional reversed card)`, `Basic (type in the answer)`, `Cloze`
- `deck`  — overrides `<anki deck="...">` for this note only
- `tags`  — whitespace-separated list of tags

## CLI

```bash
anki-xml import <file.xml>               # import into Anki (default AnkiConnect URL)
anki-xml import <file.xml> --dry-run     # validate only, no AnkiConnect call
anki-xml import <file.xml> --url ...     # use a non-default AnkiConnect endpoint
anki-xml import <file.xml> --no-auto-create-deck
                                         # abort if a deck is missing (default: auto-create)
anki-xml --help
anki-xml --version
```

`--auto-create-deck` is on by default. AnkiConnect's `createDeck` is
idempotent, so re-importing the same file never fails because of a
deck that already exists.

---

## 1. Basic

The simplest note type. Front → Back.

**Fields:** `<front>`, `<back>`

### Simple

```xml
<anki deck="My Deck">
  <note type="Basic">
    <front>Hola</front>
    <back>Hello</back>
  </note>
</anki>
```

### Complex — HTML, audio, and links

Anki fields are HTML, so any inline markup is fine.

```xml
<anki deck="Spanish::Greetings">
  <note type="Basic" tags="spanish greetings">
    <front>How do you say <i>good morning</i> in Spanish?</front>
    <back><b>Buenos días</b> &mdash; pronounced roughly "bweh-nohs DEE-ahs".</back>
  </note>

  <note type="Basic" tags="spanish audio">
    <front>Listen: ¿Cómo estás?</front>
    <back>[sound:como-estas.mp3] &nbsp; "How are you?"</back>
  </note>

  <note type="Basic" tags="spanish web">
    <front>Look up <a href="https://example.com/dict">this word</a></front>
    <back>Just a reference link.</back>
  </note>
</anki>
```

---

## 2. Basic (and reversed card)

Anki auto-generates the reverse direction (Back → Front), so we
only need `front` and `back`. Importing this note type creates two
cards: Front→Back and Back→Front.

**Fields:** `<front>`, `<back>`

### Simple

```xml
<anki deck="Vocab">
  <note type="Basic (and reversed card)" tags="greetings">
    <front>Hola</front>
    <back>Hello</back>
  </note>
</anki>
```

### Complex — capitalized noun pairs

Use this type for vocabulary that flows naturally in both directions
(country ↔ capital, word ↔ definition, term ↔ acronym).

```xml
<anki deck="Geography::Capitals" tags="capitals">
  <note type="Basic (and reversed card)">
    <front>Tokyo</front>
    <back>Capital of Japan</back>
  </note>
  <note type="Basic (and reversed card)">
    <front>Canberra</front>
    <back>Capital of Australia</back>
  </note>
  <note type="Basic (and reversed card)">
    <front>Ottawa</front>
    <back>Capital of Canada</back>
  </note>
</anki>
```

---

## 3. Basic (optional reversed card)

Like `Basic (and reversed card)`, but the author chooses per-note
whether to generate the reverse direction. Use `<addReverse>yes</addReverse>`
or `<addReverse>no</addReverse>`. Optional `<extra>` field is shown
only on the reverse card (if generated).

**Fields:** `<front>`, `<back>`, `<addReverse>` (yes|no), `<extra>` (optional)

### Simple

```xml
<anki deck="Capitals">
  <note type="Basic (optional reversed card)">
    <front>Nepal</front>
    <back>Kathmandu</back>
    <addReverse>yes</addReverse>
  </note>
</anki>
```

### Complex — direction matters

Use this type when only one direction is useful. For "country →
capital" the reverse ("capital → country") is meaningful, so set
`yes`. For "definition → word", the reverse is rarely useful, so
set `no`.

```xml
<anki deck="Geography" tags="capitals">
  <note type="Basic (optional reversed card)">
    <front>Nepal</front>
    <back>Kathmandu</back>
    <addReverse>yes</addReverse>
    <extra>Largest city of Nepal.</extra>
  </note>
  <note type="Basic (optional reversed card)">
    <front>France</front>
    <back>Paris</back>
    <addReverse>no</addReverse>
  </note>
</anki>
```

`<addReverse>` accepts `yes` / `no` (case-insensitive, with optional
surrounding whitespace). Anything else is a validation error.

---

## 4. Basic (type in the answer)

Same field shape as `Basic` (`<front>`, `<back>`); the difference
is that Anki renders the back as a typing box on review.

**Fields:** `<front>`, `<back>`

### Simple

```xml
<anki deck="Chemistry">
  <note type="Basic (type in the answer)" tags="elements">
    <front>Chemical symbol for sodium</front>
    <back>Na</back>
  </note>
</anki>
```

### Complex — case-sensitive answers

Useful for vocabulary where spelling must be exact.

```xml
<anki deck="Vocab" tags="punctuation">
  <note type="Basic (type in the answer)">
    <front>Spell the contraction for "it is":</front>
    <back>It's</back>
  </note>
  <note type="Basic (type in the answer)">
    <front>Spell the possessive pronoun for a ship:</front>
    <back>Its</back>
  </note>
  <note type="Basic (type in the answer)">
    <front>Spell the contraction for "they are":</front>
    <back>They're</back>
  </note>
</anki>
```

---

## 5. Cloze

Cloze cards have one or more deletions in the text. The cloze
markers are `{{c1::hidden text}}`, `{{c2::more hidden}}`, etc.
Anki creates one card per cloze ordinal — `c1` cards hide only the
`c1` regions, `c2` cards hide only the `c2` regions, etc.

**Fields:** `<text>`, `<extra>` (optional)

### Simple

```xml
<anki deck="Biology">
  <note type="Cloze" tags="cells">
    <text>The {{c1::mitochondrion}} is the powerhouse of the cell.</text>
  </note>
</anki>
```

This creates 1 card (c1): "The [...] is the powerhouse of the cell.".

### Complex — multiple clozes on one card

Use a unique ordinal per card you want generated.

```xml
<anki deck="History" tags="moon-landing">
  <note type="Cloze">
    <text>The first humans landed on the {{c1::Moon}} in {{c2::1969}}.</text>
    <extra>Apollo 11, July 20, 1969.</extra>
  </note>
</anki>
```

This creates 2 cards: one hiding "Moon", one hiding "1969".

### Complex — nested clozes

Cloze markers can be nested. Anki shows the outer cloze's content
on the inner cloze's card.

```xml
<anki deck="Code">
  <note type="Cloze" tags="rust">
    <text><![CDATA[pub enum {{c2::Entry}}<...> {
    {{c1::Occupied}}({{c1::OccupiedEntry<...>}}),
    {{c1::Vacant}}({{c1::VacantEntry<...>}}),
}]]></text>
  </note>
</anki>
```

### Hints

Append a third `::segment` to a marker to show a hint when the
cloze is hidden:

```xml
<anki deck="Geography">
  <note type="Cloze">
    <text>The capital of France is {{c1::Paris::largest city in France}}.</text>
  </note>
</anki>
```

### Forward-compat: comma-separated ordinals

`{{c1,2::text}}` hides the content on **both** c1 and c2 cards.
This syntax is supported in upstream Anki `main` and the importer
accepts it for forward compatibility, but **Anki 25.09 (the
currently released version) does not yet generate the corresponding
cards** — the note will validate but Anki will reject it. If you're
on Anki 25.09, stick to single ordinals.

```xml
<!-- This is accepted by anki-xml but Anki 25.09 may reject it -->
<anki deck="Test">
  <note type="Cloze">
    <text>{{c1,2::shared content}}</text>
  </note>
</anki>
```

---

## Real-world cookbook

### Mixed deck in one file

```xml
<?xml version="1.0" encoding="UTF-8"?>
<anki deck="My Studies">

  <note type="Basic" tags="vocab">
    <front>Ephemeral</front>
    <back>Lasting for a very short time.</back>
  </note>

  <note type="Cloze" tags="biology">
    <text>The {{c1::nucleus}} contains {{c2::DNA}}.</text>
    <extra>Every eukaryotic cell has a nucleus.</extra>
  </note>

  <note type="Basic (optional reversed card)" tags="capitals">
    <front>Berlin</front>
    <back>Capital of Germany</back>
    <addReverse>no</addReverse>
  </note>

</anki>
```

### Math-heavy deck (MathJax)

CDATA sections let you write `\(...\)` and `\[...\]` without
double-escaping backslashes. See `latex.md` for the full reference.

```xml
<anki deck="Math">
  <note type="Basic" tags="calculus">
    <front><![CDATA[State the chain rule for \(f(g(x))\).]]></front>
    <back><![CDATA[\((f \circ g)'(x) = f'(g(x)) \cdot g'(x)\)]]></back>
  </note>
  <note type="Basic" tags="integrals">
    <front><![CDATA[Evaluate \(\int_0^1 x^2\,dx\).]]></front>
    <back><![CDATA[\[\int_0^1 x^2\,dx = \left[\frac{x^3}{3}\right]_0^1 = \frac{1}{3}.\]]]></back>
  </note>
</anki>
```

### Code-heavy deck (indented code)

Leading whitespace inside a CDATA section is **trimmed at the field
edges only** — internal indentation is preserved verbatim. Indent
freely:

```xml
<anki deck="Python">
  <note type="Basic" tags="python loops">
    <front><![CDATA[What does this print?
for i in range(3):
    print(i)]]></front>
    <back><![CDATA[0
1
2]]></back>
  </note>
</anki>
```

### Multi-deck file

Set the default deck on `<anki>` and override per-note when needed:

```xml
<anki deck="Languages">
  <note type="Basic" tags="spanish">
    <front>Hola</front><back>Hello</back>
  </note>
  <note type="Basic" deck="Languages::French" tags="french">
    <front>Bonjour</front><back>Hello</back>
  </note>
  <note type="Basic" tags="japanese">
    <front>こんにちは</front><back>Hello</back>
  </note>
</anki>
```

Note: the `Languages::French` deck is auto-created on import
(default behavior).

---

## Validation errors

If any note fails validation, **no notes from the file are
imported** — the whole batch is rejected and the CLI exits with
status `1`. Each error names the note number and the rule that
was violated, e.g.:

```
Validation errors:
  Note 1: <Basic> requires <front>
  Note 2: no deck: set `deck` on <anki> or on each <note>
  Note 3: <text> for a Cloze note must contain at least one {{cN::...}} marker
```

Fix all errors and re-run. Use `--dry-run` to validate without
contacting Anki.
