# LaTeX: MathJax and native Anki `[latex]`

Anki supports two ways to embed LaTeX in a card. Both pass through
this tool unchanged when you put them inside CDATA, because the
content of a CDATA section is opaque to our escape rule except for
the three HTML-significant characters `<`, `>`, and `&`.

## 1. MathJax inline: `\( ... \)`

The standard LaTeX inline delimiter.

```xml
<front><![CDATA[Solve \(x^2 - 5x + 6 = 0\).]]></front>
```

becomes (in the Anki field):

```
Solve \(x^2 - 5x + 6 = 0\).
```

Anki (with the MathJax add-on) renders this as a typeset equation.

**Why CDATA?** Without CDATA, the parentheses and backslashes are
fine in XML PCDATA, but the surrounding toolchain (your LLM, the
serializer you use to produce the XML, etc.) tends to add extra
escapes. Putting the whole formula in CDATA is the cleanest contract:
"this is literal text, do not touch it."

## 2. MathJax display: `\[ ... \]`

The standard LaTeX display delimiter.

```xml
<front><![CDATA[Evaluate the integral:

\[
\int_0^1 x^2 \, dx
\]
]]></front>
```

This is a multi-line CDATA. Our tokenizer handles newlines inside
CDATA as ordinary text, so the result contains a real newline that
Anki will render as a line break.

**Important:** in XML, the byte sequence `\]` is fine inside CDATA,
but if you write `]]>` inside a CDATA, the section closes early.
This format is why you sometimes see authors split `]] >`:

```xml
<back><![CDATA[\[ ... \]] ></back>
```

(The space after `]]` is the workaround; Anki treats the literal
text `]]>` as the closing delimiter and there is no way to embed it
verbatim in a single CDATA section.)

## 3. Native Anki LaTeX: `[latex] ... [/latex]`

Anki has its own LaTeX system that is independent of MathJax. You
write `[latex]...[/latex]` directly in the field and Anki wraps the
contents in the right `\(...\)` delimiters itself.

```xml
<back><![CDATA[
[latex]
E = mc^2
[/latex]
]]></back>
```

becomes (in the Anki field):

```

[latex]
E = mc^2
[/latex]

```

Anki renders this with its own LaTeX renderer.

**Why CDATA?** `[latex]` and `[/latex]` look like XML open/close tags,
but they are not — they're plain text that Anki matches with a
literal-string scan. Putting them in CDATA protects them from XML
parsers (including fast-xml-parser) that might otherwise interpret
them as unknown tags.

You can also write `[latex]` outside CDATA:

```xml
<back>[latex]E = mc^2[/latex]</back>
```

Both forms are accepted by this tool. The CDATA form is recommended
because it makes the author's intent obvious and survives authors who
do not know XML.

## 4. Why backslashes pass through

Backslashes have no special meaning in XML. `\` is just an ordinary
character. The only XML-significant characters are `<`, `>`, `&`,
`'`, and `"`. Inside CDATA, even those are literal except for the
closing `]]>`.

Our escape rule operates on `<`, `>`, and `&` only. So a backslash
in `\(x\)` is never touched, never doubled, never re-encoded.

## 5. Multiple equations in one field

```xml
<back><![CDATA[
  \(x = 2\) or \(x = 3\).
  Factor: \((x-2)(x-3)\).
]]></back>
```

The CDATA contains four `\(...\)` pairs. Each is independent — our
parser does not interpret or balance them, it just passes the whole
block through with HTML-significant characters escaped.

## 6. MathJax commands that contain `<` or `>`

Some LaTeX commands write `<` or `>` verbatim (rare but legal). When
those appear inside CDATA, our escape rule turns them into `&lt;` /
`&gt;` in the Anki field. Anki then un-escapes them for the MathJax
renderer. The end result is that the rendered equation contains the
correct character.

```xml
<front><![CDATA[\langle a, b \rangle]]></front>
```

becomes `\&langle; a, b \&rangle;` in the field — wait, no: it
becomes `⟨a, b⟩` only if MathJax sees `<` and `>` directly, which it
does not after our escape. **If you need raw `<` or `>` to reach
MathJax unescaped, do not put them inside CDATA; close CDATA,
write the characters in regular markup, and reopen.**

In practice, the LaTeX commands that look like `<thing>` (e.g.
`\langle`, `\rangle`) are written with backslashes and the
characters are already ASCII `<` and `>`, so the simple workaround is
to use the LaTeX names that don't need angle brackets:

```xml
<front><![CDATA[\langle a, b \rangle]]></front>
```

MathJax handles `\langle` and `\rangle` correctly without any HTML
angle brackets. So the issue is rare.

## 7. Worked example: combining all three

```xml
<note type="Basic" tags="math">
  <front><![CDATA[
    Solve \(x^2 = 4\). Display form:
    \[x = \pm 2\]
    Native Anki LaTeX: [latex]\pm[/latex] also works.
  ]]></front>
  <back><![CDATA[
    The roots are \(x = 2\) and \(x = -2\).
  ]]></back>
</note>
```

All three LaTeX styles coexist in the front field, separated by
visual newlines and prose. Our tokenizer treats the entire CDATA as
one opaque block and produces the field:

```

    Solve \(x^2 = 4\). Display form:
    \[x = \pm 2\]
    Native Anki LaTeX: [latex]\pm[/latex] also works.

```

(With `<`, `>`, and bare `&` escaped per `cdata.md`; there are none
of those in this example.)