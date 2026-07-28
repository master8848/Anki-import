# HTML and entities

Anki field content is HTML. The format this tool consumes lets you
write HTML two ways:

1. **As real HTML markup** outside CDATA — `<b>`, `<i>`, `<code>`,
   `<br>`, and friends. Entities are written as XML entities and pass
   through unchanged.
2. **As literal text** inside CDATA — useful when you want the field
   to contain angle brackets that look like markup but should render
   as text. See `cdata.md` for that case.

This document covers case 1. Case 2 is mostly mechanical — see the
CDATA escape rule — and is detailed in `cdata.md`.

## 1. Inline markup

The usual inline tags work:

```xml
<note type="Basic" tags="derivatives">
  <front>State the chain rule for <i>f</i>(<i>g</i>(<i>x</i>)).</front>
  <back><b>(f &deg; g)&#39;(x) = f&#39;(g(x)) &middot; g&#39;(x)</b></back>
</note>
```

becomes, in the Anki field:

```
State the chain rule for f(g(x)).            <-- rendered
(f ∘ g)'(x) = f'(g(x)) · g'(x)               <-- rendered bold
```

Specifically we preserve: `<i>`, `<b>`, `<code>`, `<u>`, `<em>`,
`<strong>`, `<span>`, `<sub>`, `<sup>`, and any other HTML Anki
accepts. The tool does not validate the tag set; whatever Anki would
reject is your problem, not ours.

We do preserve **nested** tags:

```xml
<back>The <b>second <i>word</i></b> is special.</back>
```

becomes (in the field, verbatim) the same string. Anki renders it as
"second *word*" bold.

## 2. Block markup

The void HTML elements `<br>`, `<hr>`, and `<img>` are recognized and
do not eat later tags:

```xml
<back>Line one<br>Line two<br>Line three</back>
```

becomes (in the field):

```
Line one<br>Line two<br>Line three
```

Anki renders the `<br>` tags as line breaks.

**Why is this called out?** Some XML parsers, by default, treat `<br>`
as a paired tag. That would lead them to swallow `Line two<br>Line
three</back>` as the contents of an imagined `<br>` element. We
explicitly declare a list of HTML void elements so the parser does
not get confused by HTML inside an XML file.

The full list of void tags we declare:

```
br, hr, img, input, meta, link, area, base, col, embed, param,
source, track, wbr
```

## 3. Entities

Named entities pass through verbatim:

| source                  | field (verbatim)         |
|-------------------------|--------------------------|
| `&lt;`                  | `&lt;`                   |
| `&gt;`                  | `&gt;`                   |
| `&amp;`                 | `&amp;`                  |
| `&quot;`                | `&quot;`                 |
| `&apos;`                | `&apos;`                 |
| `&nbsp;`                | `&nbsp;`                 |
| `&deg;`                 | `&deg;`                  |
| `&middot;`              | `&middot;`               |
| `&copy;`                | `&copy;`                 |
| `&hellip;`              | `&hellip;`               |
| `&mdash;`, `&ndash;`    | `&mdash;`, `&ndash;`     |

Numeric entities likewise:

| source      | field (verbatim) |
|-------------|------------------|
| `&#39;`     | `&#39;`          |
| `&#160;`    | `&#160;`         |
| `&#x27;`    | `&#x27;`         |
| `&#xA0;`    | `&#xA0;`         |

We do **not** decode entities to characters. The author wrote `&deg;`
in the source; we deliver `&deg;` to Anki. Anki is responsible for
the final decode step into the actual character `°`.

### 3.1 The "double-escape" trap

The naive implementation of a tool like this looks like: "let XML
parse the file into a DOM, then re-serialize the DOM back to a
string." The re-serialization converts every entity in the DOM into
its character form, then HTML-encodes characters that are unsafe in
HTML — which produces `&amp;lt;` from a source `&lt;`. The author
sees `&lt;` in the field and is confused: their text reads
`&amp;lt;` in Anki.

We avoid this by never round-tripping. We tokenize the source and
copy ranges of bytes into the field; entities in the source stay as
entities in the field.

## 4. Attributes on nested tags

Attributes are preserved exactly as written:

```xml
<back>The <a href="https://example.com">link</a> here.</back>
```

becomes (in the field):

```
The <a href="https://example.com">link</a> here.
```

The attribute value is **not** entity-decoded or re-encoded. We treat
the source range between `<a ` and the closing `>` of the tag as an
opaque string.

If you need a `<` or `&` inside an attribute value, you must use
CDATA for that — but CDATA cannot appear inside a tag's attributes
in XML. So in practice: keep attribute values simple.

## 5. Comments inside fields

XML comments inside field content are dropped during extraction:

```xml
<front>first<!-- hidden -->second</front>
```

becomes (in the field):

```
firstsecond
```

The comment and its three dashes are gone. This is intentional: an
author who wants to comment a field should use a real XML comment
outside the field, not inside it.

## 6. `<img>` and media

Anki uses HTML `<img src="filename.jpg">` to embed media. The tool
preserves the tag exactly:

```xml
<back>Look: <img src="diagram.png" alt="diagram"/></back>
```

The author is responsible for the media file existing in Anki's
collection.media directory; anki-xml does not upload media.

## 7. Sanitization

We do **no** sanitization. If you write `<script>alert(1)</script>`
in a field, it goes to Anki verbatim. Anki's own renderer will
probably strip it (and Anki desktop does), but the tool does not
second-guess the author.

The reasoning: sanitization at the import boundary would silently
change the author's intent. If the author wrote something unsafe,
they should see exactly that in the field so they can fix it.

If you want sanitization, do it before this tool sees the file — in
the agent that produces the XML.