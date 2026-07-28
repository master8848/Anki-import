# Problems solved

A note about the design decisions that shaped this tool, and the
specific bugs that the naive design would produce.

## 1. Why not just round-trip through an XML parser?

The obvious implementation is:

1. Parse the input XML into a DOM.
2. Walk the DOM.
3. For each field, take the field's text content.
4. Re-serialize the text as HTML.

This is wrong in three ways.

### 1.1 Entities get double-escaped

Source:

```xml
<back><![CDATA[(f &deg; g)&#39;(x)]]></back>
```

What the DOM sees:

```
(f ° g)'(x)
```

(The parser decodes `&deg;` to `°` and `&#39;` to `'`.)

What the naive re-serializer emits:

```
(f &deg; g)&#39;(x)
```

Wait, that's actually correct... if the re-serializer is well-behaved
and re-encodes `°` as `&deg;`. The problem is that re-encoders
typically re-encode just the **HTML-significant** characters (`<`,
`>`, `&`, `"`, `'`) and leave the rest of the unicode characters
alone. So we get:

```
(f ° g)'(x)
```

delivered to Anki. That looks fine in the field — but now search,
find-in-page, and copy-paste all see the literal characters instead
of the entities the author wrote. For LaTeX-aware tooling and
editors, the difference matters.

Worse: if the re-serializer is the "safe" one and re-encodes `°` to
`&deg;`, but the field contains a literal `<` (which the original
author escaped as `&lt;`):

Source:

```xml
<back>if &lt;x&gt; then</back>
```

DOM:

```
if <x> then
```

Re-serializer (HTML-safe mode):

```
if &lt;x&gt; then
```

OK that's fine. But consider:

Source:

```xml
<back>if &lt;x&gt; then</back>
```

Naive re-serializer (XML mode):

```
if &lt;x&gt; then
```

So far so good. But what about:

Source:

```xml
<back><![CDATA[if a < b then &amp;]]></back>
```

DOM:

```
if a < b then &
```

Re-serializer (HTML mode, treating the field as HTML):

```
if a &lt; b then &amp;
```

Wait, the `<` got escaped, the `&` got escaped. The original
author's `&amp;` got double-escaped to `&amp;amp;`. **Bug.**

The rule that needs to hold is: "if the author wrote `&lt;`, the
field gets `&lt;`, not `&amp;lt;`." That rule is impossible to honor
with any architecture that lets the DOM decode entities, because
the DOM cannot tell the original `&` from the original `;` apart.

### 1.2 CDATA markers disappear

Source:

```xml
<back><![CDATA[raw < > & text]]></back>
```

DOM sees text:

```
raw < > & text
```

Re-serializer:

```
raw &lt; &gt; &amp; text
```

That's actually fine — but you've now invented HTML escaping rules
inside what was a CDATA section. The author might have written
`&lt;` (intending the literal text `&lt;`) expecting it to survive:

Source:

```xml
<back><![CDATA[write &lt; not <]]></back>
```

DOM:

```
write &lt; not <
```

Re-serializer:

```
write &amp;lt; not &lt;
```

`&lt;` in the source becomes `&amp;lt;` in the field. The author
expected `&lt;` to survive. **Bug.**

The only way to honor "what the author wrote is what Anki gets" is
to never decode. We copy source ranges.

### 1.3 The parser swallows void HTML tags

`<br>` is a void element in HTML — it has no closing tag. Default
XML parsers do not know that and will treat the next tag as the
imaginary closing tag of `<br>`:

Source:

```xml
<back>line one<br>line two</back>
```

Naive parser:

```
<back>
  line one
  <br>
    line two
  </br>
</back>
```

Wait, that's still fine. The problem comes with nested content:

Source:

```xml
<back>line one<br>line two<br>line three</back>
```

Naive parser with `<br>` as a paired tag (the default):

```
<back>
  line one
  <br>
    line two
    <br>
      line three
    </br>
  </br>
</back>
```

Now the `<back>` field's text content is just `line one` — the rest
of the field is nested inside imaginary tags. The author loses
`line two` and `line three`.

The fix is to tell the parser about HTML void tags. We declare
`br, hr, img, input, meta, link, area, base, col, embed, param,
source, track, wbr` as unpaired. The DOM then sees `<br>` as an
empty element and the surrounding text is preserved.

But this is fragile — every time you forget a tag, you ship a bug.
Worse, the declaration is XML-parser-specific; fast-xml-parser has
its own option (`unpairedTags`), but a tool that uses another
library would need a different list.

## 2. Why we tokenize the source ourselves

The alternative to "let fast-xml-parser do everything" is:

1. Use fast-xml-parser **only** to validate well-formedness and get
   source offsets.
2. Walk the source ourselves with a hand-rolled tokenizer that
   recognizes CDATA sections, comments, processing instructions,
   start tags, end tags, self-closing tags, and text runs.
3. For each field, find the matching closing tag by depth-counting
   through the token stream (not by trusting any DOM structure).
4. Concatenate tokens between the open and close into the field
   string. CDATA contents get the escape rule from `cdata.md`.
   Everything else is copied verbatim from the source.

This is what we do. The properties it gives us:

| property                                  | how it's guaranteed                                          |
|-------------------------------------------|--------------------------------------------------------------|
| Entities pass through unchanged           | we never decode them — we copy source bytes                  |
| CDATA doesn't double-escape               | we don't decode CDATA contents — we apply only the safe HTML escape rule |
| `<br>` and friends don't swallow content  | we tokenize, we don't depend on the parser's tag-pairing logic |
| Comments don't leak into fields           | we have a `comment` token kind and skip them                 |
| Nested tags stay nested                   | we depth-count to find matching close                        |
| The author's `&lt;` survives as `&lt;`    | the source slice for a `start`/`end`/text token is taken verbatim |
| Mixed CDATA and markup works              | we concatenate per-token output, with the escape rule only applied to CDATA contents |

## 3. Why the test for the empty-deck attribute uses regex

We want to detect the difference between `<anki deck="">` and
`<anki>`. Both yield `defaultDeck === ""` from our parser, because
fast-xml-parser treats a missing attribute and an empty-string
attribute identically.

A user-supplied `<anki deck="">` is a deliberate "I want the
validator to complain about missing decks" signal. A bare `<anki>`
is "use the default default of 'D' for tests." The parser can't tell
them apart on its own — but a regex on the source text can.

This is one of the very few places we use regex on the source.
We tried to avoid it; we couldn't.

## 4. What we still don't do

We don't upload media. We don't sanitize HTML. We don't decode
entities. We don't apply any whitespace normalization beyond the
final `.trim()`. We don't translate AnkiConnect errors into actionable
guidance. We don't support custom note types.

Each of these is a "do less" decision, and the boundary is the same:
the tool is a bridge between two formats, not a transformation
pipeline. The author should see in Anki exactly what they wrote in
the XML, modulo the documented HTML-escape rule for CDATA contents.