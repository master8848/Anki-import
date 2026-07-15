# CDATA handling

CDATA sections are the single most important feature of this format.
They let an author write backslash-heavy formulas and markup-looking
text without drowning in escape sequences. This document explains
exactly what we do with CDATA contents.

## 1. Syntax

```xml
<front><![CDATA[
  any text at all, including < > & and " '
]]></front>
```

A CDATA section opens with `<![CDATA[` and closes with `]]>`. Anything
between those delimiters is **literal text** as far as XML is
concerned — the parser does not interpret `<`, `>`, or `&` as markup
or entity references.

## 2. Why CDATA exists here

An Anki HTML field does interpret `<`, `>`, and `&` (the first two as
tag delimiters, the third as the start of an entity reference). So CDATA
contents cannot be dropped into Anki verbatim — `<` and `>` would
either close the surrounding HTML tag or be parsed as new HTML.

We have to do **just enough** escaping to make CDATA contents safe in
the destination HTML field, but **no more** — and crucially we must
not double-escape entities the author already wrote.

## 3. The escape rule

For each character of a CDATA body, in source order:

| character | action                                                      |
|-----------|-------------------------------------------------------------|
| `<`       | emit `&lt;`                                                 |
| `>`       | emit `&gt;`                                                 |
| `&`       | emit `&amp;` **unless** it begins a valid entity reference  |

A "valid entity reference" is one of:

- `&name;` where `name` matches `[a-zA-Z][a-zA-Z0-9]*` (e.g. `&lt;`,
  `&amp;`, `&nbsp;`, `&copy;`, `&middot;`, `&deg;`)
- `&#digits;` (e.g. `&#39;`, `&#160;`)
- `&#xhexdigits;` (e.g. `&#x27;`, `&#xA0;`)

The end-of-entity `;` is required for the entity to be considered
already-escaped. A bare `&` not followed by that pattern is treated
as a literal ampersand and re-escaped to `&amp;`.

## 4. Worked examples

### 4.1 Backslashes pass through

```xml
<front><![CDATA[\(x^2 - 5x + 6 = 0\)]]></front>
```

becomes (in the Anki field):

```
\(x^2 - 5x + 6 = 0\)
```

Backslashes have no special meaning in CDATA. We never touch them.

### 4.2 Pre-existing entities are preserved

```xml
<back><![CDATA[(f &deg; g)&#39;(x)]]></back>
```

becomes:

```
(f &deg; g)&#39;(x)
```

Both `&deg;` (named entity) and `&#39;` (numeric entity) survive
unchanged. They would otherwise have been turned into
`&amp;deg;&#39;` by a naive "replace every `&`" pass.

### 4.3 Bare `&` gets escaped

```xml
<back><![CDATA[Q & A]]></back>
```

becomes:

```
Q &amp; A
```

`&` followed by a space is not an entity, so it must be escaped.

### 4.4 Markup-looking text becomes text

```xml
<back><![CDATA[the <not> tag is fake]]></back>
```

becomes:

```
the &lt;not&gt; tag is fake
```

In Anki, this renders as the literal text `the <not> tag is fake`,
not as an HTML `<not>` tag. (Anki treats the field as HTML, so the
unescaped form would either drop the `<not>` and the rest of the
field or be filtered as invalid markup.)

### 4.5 CDATA + nested markup in the same field

```xml
<text><![CDATA[
  Speed of light: <b>{{c1::299,792,458}}</b> m/s.
]]></text>
```

The CDATA contains a real HTML `<b>` tag. Because that tag is part of
the CDATA's literal text, our escape rule would normally turn it into
`&lt;b&gt;`. But that's not what we want — we want `<b>` to remain a
real tag.

In our format, **nested markup inside CDATA is only meaningful as a
literal text**. The author who wants a real `<b>` tag inside a CDATA
field should close CDATA, write the tag, and reopen:

```xml
<text><![CDATA[Speed of light: ]]><b><![CDATA[{{c1::299,792,458}}]]></b><![CDATA[ m/s.]]></text>
```

This is split by our tokenizer into three CDATA sections and two
start/end tags. The result, concatenated:

```
Speed of light: <b>{{c1::299,792,458}}</b> m/s.
```

`<b>` survives as a real HTML tag; the surrounding CDATA bodies
(`Speed of light: ` and ` m/s.`) are escaped for HTML safety.

## 5. The `]]>` problem

The literal sequence `]]>` cannot appear inside a CDATA section
because it would close the section prematurely. To embed it, split
the CDATA:

```xml
<front><![CDATA[a]] > b]]></front>
```

(Note the space between `]]` and `>`.) Our tokenizer treats this as a
CDATA section with content `a]] > b`. The literal `]]>` is then
absent from the field entirely — the author wrote it as `]] >` to
get it past the parser, and the human-visible text is `a]]>b`.

## 6. Why we don't escape whole fields

We do **not** strip CDATA wrappers and then re-encode the whole field
as HTML. Re-encoding the entire field would also re-encode characters
in nested markup, breaking the "pre-existing entities survive"
guarantee. The escape rule is applied **only** to the substring
between `<![CDATA[` and `]]>`; everything else is copied from the
source verbatim.

## 7. Common CDATA mistakes

| mistake                                               | result                                                |
|-------------------------------------------------------|-------------------------------------------------------|
| Forget `]]>` at the end                               | parser error: "Unterminated CDATA section"            |
| Nest CDATA inside CDATA (`<![CDATA[<![CDATA[...]]>`)  | parser error: the inner `<![CDATA[` closes nothing   |
| Write `&entity;` outside a CDATA section             | parser error or double-escaped text, depending on context |
| Mix CDATA and the same character entities             | prefer CDATA for content; entities work either way     |