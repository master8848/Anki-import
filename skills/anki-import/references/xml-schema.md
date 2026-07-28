# XML schema quick reference

`anki-xml` reads an `<anki>` root containing one or more `<note>`
elements. Field tags differ by note type. Full examples in `docs/usage.md`.

## Document shape

```xml
<anki deck="Deck Name">           <!-- default deck for the file -->
  <note type="...">                <!-- required, one of 5 types -->
    <field>...</field>             <!-- type-specific -->
  </note>
  ...
</anki>
```

`<note>` attributes (all optional except `type`):

| Attr | Default | Notes |
|---|---|---|
| `type` | — | `Basic`, `Basic (and reversed card)`, `Basic (optional reversed card)`, `Basic (type in the answer)`, `Cloze` |
| `id` | new | Anki note id; set by `migrate assign-guids` for stable diffs |
| `guid` | random | set by `migrate assign-guids` for stable sync |
| `deck` | inherits `<anki deck="...">` | override per-note |
| `tags` | none | whitespace-separated |

## 1. Basic

Fields: `<front>`, `<back>`

```xml
<anki deck="Spanish">
  <note type="Basic">
    <front>Hola</front>
    <back>Hello</back>
  </note>
</anki>
```

## 2. Basic (and reversed card)

Same fields as Basic. Anki auto-generates the reverse card.

```xml
<note type="Basic (and reversed card)">
  <front>Hola</front>
  <back>Hello</back>
</note>
```

## 3. Basic (optional reversed card)

Same fields, plus `<addReverse>yes</addReverse>` to opt into the
reverse direction. `<extra>` is shown only on the reverse card.

```xml
<note type="Basic (optional reversed card)">
  <front>Nepal</front>
  <back>Kathmandu</back>
  <addReverse>yes</addReverse>
  <extra>Capital city</extra>
</note>
```

## 4. Basic (type in the answer)

`<back>` should contain `{{type:Back}}` — Anki replaces it with an
input box on review. The CLI does not transform this; Anki does.

```xml
<note type="Basic (type in the answer)">
  <front>Capital of France</front>
  <back>{{type:Back}}</back>
</note>
```

## 5. Cloze

Field: `<text>` containing `{{c1::answer}}` (and `{{c2::...}}`, etc.).
`<extra>` is shown after the blank.

```xml
<note type="Cloze">
  <text>The {{c1::mitochondrion}} is the powerhouse of the {{c2::cell}}.</text>
  <extra>High-yield biology fact.</extra>
</note>
```

## Inline HTML in fields

Fields are HTML. Any inline markup is fine:

```xml
<note type="Basic" tags="spanish audio">
  <front>Listen: ¿Cómo estás?</front>
  <back>[sound:como-estas.mp3] &nbsp; "How are you?"</back>
</note>

<note type="Basic" tags="spanish web">
  <front>What does <i>serendipity</i> mean?</front>
  <back>A happy accident — see <a href="https://example.com">etymology</a>.</back>
</note>
```

## Math

Two options:

1. **Native (recommended)** — wrap in `[latex]...[/latex]`:

   ```xml
   <note type="Basic">
     <front>Solve [latex]x^2 = 4[/latex]</front>
     <back>[latex]x = \\pm 2[/latex]</back>
   </note>
   ```

2. **MathJax** — write raw TeX in `<>` or `$$...$$` blocks. Requires the
   MathJax add-on (`1610307553`); `anki-xml doctor` will check.

## Re-importing safely

Once a file has been imported, re-importing the same file passes
duplicates by default. To make a file round-trip-stable:

```bash
anki-xml migrate assign-guids deck.xml   # writes stable <note id="...">
```

Then `diff` and `sync` use the `id` / `guid` to compute the
added / changed / removed set.

## Validation rules

`anki-xml validate` reports these as warnings (errors with `--strict`):

- Tags containing commas
- Tags longer than ~80 chars
- Tags containing control characters

And these as errors (always):

- Malformed XML
- Missing `<anki>` root
- `<note>` with unknown `type`
- Required field empty or missing
- Field content exceeding the schema's max length
- Duplicate `<note>` ids within the same file
