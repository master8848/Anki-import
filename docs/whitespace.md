# Whitespace

Whitespace handling is split into three regimes: between elements,
inside fields, and around field values at the boundaries.

## 1. Whitespace between elements

Whitespace between top-level elements (between `</note>` and the next
`<note>`, between comments and notes, etc.) is irrelevant — it is
not inside any field and does not affect the result.

```xml
<anki deck="X">
  <note type="Basic" tags="t"><front>Q</front><back>A</back></note>

  <note type="Basic" tags="t"><front>Q2</front><back>A2</back></note>
</anki>
```

The blank line between the two notes is fine. The same applies to
indentation before and after elements.

## 2. Whitespace inside fields (non-CDATA)

For fields that are not wrapped in CDATA, the field's text is the
characters between the closing `>` of the opening tag and the `<` of
the matching closing tag, with **whatever internal whitespace the
author wrote**. Tags inside the field are also part of the field's
content; the bytes between them are text.

```xml
<front>State the   chain rule.</front>
```

becomes (in the Anki field):

```
State the   chain rule.
```

The three spaces are preserved verbatim. Anki collapses runs of
whitespace in display, but the underlying HTML still has them — which
matters for things like `<code>` content.

```xml
<back><pre>  def f(x):
    return x * 2</pre></back>
```

becomes (in the field):

```
<pre>  def f(x):
    return x * 2</pre>
```

The leading two-space indent of `def f(x):` survives.

### 2.1 Why we don't normalize

XML parsers that read PCDATA (parsed character data) may normalize
whitespace by default. We use a tokenizer that operates on raw
source bytes and never collapses runs of whitespace in PCDATA.

The exception is the final `.trim()` applied when building the
AnkiConnect payload — see §4.

## 3. Whitespace inside CDATA fields

Inside CDATA, whitespace is preserved **even more strictly** than in
PCDATA, because CDATA is not even tokenized by the XML parser. Our
tokenizer preserves every byte:

```xml
<front><![CDATA[
  The integral is:
  \[
    \int_0^1 x^2 dx
  \]
]]></front>
```

becomes (after our escape rule, which doesn't touch newlines or
spaces):

```
\n  The integral is:\n  \[\n    \int_0^1 x^2 dx\n  \]\n
```

The leading newline after `<![CDATA[`, the indentation, and the
trailing newline before `]]>` are all in the field.

## 4. The final `.trim()`

When we build the AnkiConnect payload (the JSON object that goes to
the `addNotes` API), we apply `.trim()` to each field's HTML. This
strips leading and trailing whitespace, including the newlines that
the CDATA example above would otherwise carry.

Why?

- Anki treats the field HTML as a string. Trailing whitespace is
  usually unwanted.
- HTML editors and the Anki browser both collapse trailing
  whitespace visually, but having it in the string makes copy-paste
  and find-in-page behave oddly.
- The user-visible result of a field with `"\n  Q\n"` and `Q` is the
  same.

`.trim()` only strips leading and trailing whitespace. Internal
whitespace runs (including newlines between tags) are preserved.

```xml
<front>  Q with leading and trailing space.  </front>
```

becomes (in the AnkiConnect payload field value):

```
Q with leading and trailing space.
```

```xml
<back>Line 1
Line 2</back>
```

becomes:

```
Line 1
Line 2
```

The newline in the middle is kept.

### 4.1 What is "whitespace" for the trim?

JavaScript's `String.prototype.trim()` removes characters that match
`\s` — ASCII space, tab, carriage return, line feed, vertical tab,
form feed, and a handful of Unicode space characters. This matches
what the author would intuitively expect.

If you need a non-trimmed field (you almost certainly don't), the
tool does not give you one in v1.

## 5. Empty fields

A field is "empty" if, after stripping every `<...>` tag and
trimming whitespace, nothing remains:

```xml
<front></front>                  empty
<front>   </front>               empty
<front><br/></front>             empty
<front><br/><br/></front>        empty
<front><b></b></front>           empty
<front><b> </b></front>          empty (the space is inside a tag, stripped)
<front><b>&nbsp;</b></front>     NOT empty (the &nbsp; is text, not a tag)
```

A required field that is empty fails validation with a message like
`<front> is empty or contains only whitespace/HTML tags`.

`<extra>` is exempt from this check for `Cloze` notes — it is the
only field where empty is acceptable. The validator still flags it
as empty in other models.