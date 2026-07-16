# XML authoring cookbook

Practical patterns for humans and AI systems that generate bulk Anki notes.
The examples here are input for `anki-xml`, not card-template files.

## First choose the destination format

`anki-xml` currently targets Anki's five **built-in note types**. Their fields
are HTML strings.

That means:

- `<b>answer</b>` is rendered bold.
- `**answer**` is stored and displayed as literal Markdown punctuation unless
  the user's card template independently installs a Markdown renderer.
- A fenced block such as `` ```js `` is preserved as text, but built-in Anki
  does not turn it into a highlighted code block.
- CDATA makes authoring literal text easier; it does not enable Markdown.

The upstream add-on reviewed in
[`upstream-anki-markdown-review.md`](./upstream-anki-markdown-review.md) owns
custom Markdown note types. Those custom models are not supported in v1. See
[`FUTURE_FEATURES.md`](../FUTURE_FEATURES.md) rather than putting
`type="Anki Markdown"` into a current file—it will fail validation.

## 1. Smallest useful document

```xml
<?xml version="1.0" encoding="UTF-8"?>
<anki deck="AI Import::Vocabulary">
  <note type="Basic" tags="spanish greeting">
    <front>Hola</front>
    <back>Hello</back>
  </note>
</anki>
```

- The root `deck` is inherited by every note without its own `deck`.
- `deck="Parent::Child"` uses Anki's hierarchy syntax.
- `tags` is whitespace-separated; use `tags="one two three"`, not commas.
- Missing decks are created by default. Use `--no-auto-create-deck` for a
  strict pre-provisioned workflow.

Override one note's deck:

```xml
<anki deck="Languages">
  <note type="Basic" deck="Languages::French" tags="french">
    <front>Bonjour</front>
    <back>Hello</back>
  </note>
</anki>
```

## 2. Plain text and XML-significant characters

Ordinary Unicode needs no special treatment:

```xml
<front>你好 👋 — مرحبا</front>
```

In normal XML text, escape XML-significant characters:

```xml
<front>Is 1 &lt; 2 &amp;&amp; 3 &gt; 2?</front>
<back>Yes &mdash; both comparisons are true.</back>
```

The importer preserves those entity spellings in the Anki field. The browser
then renders `<`, `&&`, `>`, and an em dash.

Never emit a bare ampersand in parsed text:

```xml
<!-- wrong --> <front>Q & A</front>
<!-- right --> <front>Q &amp; A</front>
```

## 3. CDATA for literal text

CDATA is convenient when a field contains many `<`, `>`, or `&` characters:

```xml
<back><![CDATA[
if (a < b && ready) {
  return "<tag>";
}
]]></back>
```

The importer turns the CDATA body into safe field HTML:

```html
if (a &lt; b &amp;&amp; ready) {
  return "&lt;tag&gt;";
}
```

The browser displays the original operators and angle brackets as text.
Backslashes, quotes, Unicode, and internal indentation pass through.

### CDATA does not contain real HTML

```xml
<back><![CDATA[This is <b>literal</b>.]]></back>
```

This displays the literal text `<b>literal</b>`; it is not bold. Put real tags
outside CDATA:

```xml
<back><![CDATA[This is ]]><b><![CDATA[bold]]></b><![CDATA[.]]></back>
```

### Put a literal `]]>` in a field

`]]>` closes CDATA. Split it across adjacent sections using the standard XML
pattern:

```xml
<back><![CDATA[literal ]]]]><![CDATA[> token]]></back>
```

The resulting field HTML is `literal ]]&gt; token`, which displays as
`literal ]]> token`.

## 4. Rendered HTML

Use real nested HTML when the built-in card should render structure:

```xml
<back>
  <p><b>Direct answer.</b></p>
  <p>Supporting <i>context</i> with H<sub>2</sub>O.</p>
</back>
```

The importer does not sanitize nested HTML. Only import files you trust.
Whether Anki permits or executes a specific element is controlled by Anki and
the card template.

Prefer XML-style self-closing void tags:

```xml
Line one<br/>Line two<hr/>
```

For compatibility with HTML authored by Anki, the parser also accepts common
void tags such as `<br>`, `<img>`, `<hr>`, `<input>`, `<source>`, and `<wbr>`
without `/>`.

### Links and attributes

Use XML entities inside attribute values:

```xml
<back><a href="https://example.test/search?a=anki&amp;b=xml">Reference</a></back>
```

Do not put CDATA inside an attribute; XML does not allow that.

## 5. Code: three different intentions

### A. Render a code block in a built-in note

Use real `<pre><code>` around a CDATA body:

```xml
<back><pre><code><![CDATA[const link = "<a>";
if (x < 10 && ready) {
  run();
}]]></code></pre></back>
```

`<pre><code>` remains markup; code operators become safe entities. This gives
monospace, whitespace-preserving HTML. It does not add syntax highlighting by
itself.

### B. Render a short inline code token

```xml
<front>What does <code>Array.prototype.map</code> return?</front>
```

### C. Store Markdown source literally

```xml
<back><![CDATA[```js
const answer = 42;
```]]></back>
```

This preserves the fence, useful if a custom template later processes Markdown.
With a stock built-in template, the backticks display literally. Do not confuse
source preservation with Markdown rendering.

## 6. Lists

For a rendered list in a built-in model, use HTML:

```xml
<back>
  <ol>
    <li>Short term
      <ul>
        <li>NAT</li>
        <li>L4/L7 reverse proxy</li>
      </ul>
    </li>
    <li>Long term</li>
  </ol>
</back>
```

Markdown list indentation can also be preserved exactly:

```xml
<back><![CDATA[1. Short term
   - NAT
   - L4/L7 reverse proxy
1. Long term
   - Re-plan IP ranges]]></back>
```

But that second form remains literal text unless the destination template is a
Markdown renderer. This distinction is the important lesson from upstream
issues #43/#44/#45.

## 7. Tables and line breaks

Use an HTML table for built-in cards:

```xml
<back><table>
  <thead><tr><th>Protocol</th><th>Ports</th></tr></thead>
  <tbody><tr><td>Web</td><td>80<br/>443<br/>8443</td></tr></tbody>
</table></back>
```

The importer preserves the table and each `<br/>`. If it still looks wrong in
review, inspect the note type's CSS/template—the transport has no table layout
engine.

Plain newlines in ordinary HTML text are usually collapsed by the browser. Use
`<br/>`, block elements, or `<pre>` when a visual line break matters.

## 8. Cloze notes

Use Anki's built-in `Cloze` note type with `<text>` and optional `<extra>`.

### One deletion

```xml
<note type="Cloze">
  <text>The capital of France is {{c1::Paris}}.</text>
</note>
```

### Multiple cards and repeated deletions

```xml
<note type="Cloze">
  <text>{{c1::HTML}} provides structure, {{c2::CSS}} provides style, and another {{c1::HTML}} marker hides on card 1.</text>
</note>
```

Different ordinals create different cards. Reusing one ordinal hides all of its
regions on that card.

### Hint

```xml
<text>The capital is {{c1::Paris::largest French city}}.</text>
```

### Nested deletion

```xml
<text>{{c1::Canberra was {{c2::founded}}}} in 1913.</text>
```

The importer validates/preserves nested syntax; Anki decides final card
behavior.

### Code-rich Cloze

```xml
<text><pre><code>pub enum {{c2::Entry}}&lt;...&gt; {
  {{c1::Occupied}}({{c1::OccupiedEntry&lt;...&gt;}}),
  {{c1::Vacant}}({{c1::VacantEntry&lt;...&gt;}}),
}</code></pre></text>
```

### Comma-separated ordinals

```xml
<text>{{c1,2::shared answer}}</text>
```

The importer accepts this forward-compatible syntax and rejects malformed forms
such as `c1,,2`. Confirm that the installed Anki release creates the expected
cards before using it in production; support appeared upstream before all
released clients handled it.

## 9. Reverse and type-in models

### Always reversed

```xml
<note type="Basic (and reversed card)">
  <front>Hola</front>
  <back>Hello</back>
</note>
```

Anki creates both directions.

### Optional reverse

```xml
<note type="Basic (optional reversed card)">
  <front>Nepal</front>
  <back>Kathmandu</back>
  <addReverse>yes</addReverse>
  <extra>Capital of Nepal</extra>
</note>
```

`addReverse` must be `yes` or `no`.

### Type in the answer

```xml
<note type="Basic (type in the answer)">
  <front>Which Rust trait provides <code>Future::map</code>?</front>
  <back>FutureExt</back>
</note>
```

This is the stock Anki typing model. It supports field HTML, but it is not the
still-open upstream “Anki Markdown type-in” feature.

## 10. MathJax and native LaTeX

MathJax delimiters pass through inside CDATA:

```xml
<front><![CDATA[Solve \(x^2 - 5x + 6 = 0\).]]></front>
<back><![CDATA[\(x = 2\) or \(x = 3\).]]></back>
```

Display math:

```xml
<back><![CDATA[\[
\int_0^1 x^2\,dx = \frac{1}{3}
\]]]></back>
```

Native Anki markers also pass through:

```xml
<back><![CDATA[[latex]E = mc^2[/latex]]]></back>
```

See [`latex.md`](./latex.md) for more examples.

## 11. Images and audio

References are preserved, but this tool does not upload files:

```xml
<front>Identify this: <img src="diagram.png" alt="diagram"/></front>
<back>Diagram A<br/>[sound:diagram-a.mp3]</back>
```

`diagram.png` and `diagram-a.mp3` must already exist in Anki's
`collection.media`. Include explanatory text because v1's meaningful-content
check treats an image-only field as empty.

## 12. Scripts and interactive cards

Nested scripts are transported verbatim:

```xml
<back><textarea id="draft"></textarea><script>
const saved = sessionStorage.getItem("currentDraft");
</script></back>
```

This is not a guarantee that scripts execute or that storage survives a front ↔
back transition. Those are reviewer/template behaviors (the subject of upstream
issue #12). Scripts can also be unsafe. AI generation should not emit scripts
unless the user explicitly asks for and reviews them.

## 13. Bulk AI workflow

Recommended workflow:

1. Ask the model for one `<anki>` root and only supported note types.
2. Require one fact per note and stable, whitespace-separated tags.
3. Require HTML—not Markdown—when rendered structure is needed.
4. Require CDATA for code/operator-heavy literal text.
5. Save the response directly as UTF-8; do not extract it with a lossy HTML
   parser.
6. Validate first:

   ```bash
   anki-xml import ./generated.xml --dry-run
   ```

7. Review the complete XML and validation output.
8. Start Anki with AnkiConnect, then import:

   ```bash
   anki-xml import ./generated.xml
   ```

9. Spot-check cards in Anki before generating a much larger batch.

A useful generation contract:

```text
Return only one well-formed XML document rooted at <anki>.
Use only Basic, Basic (and reversed card), Basic (optional reversed card),
Basic (type in the answer), or Cloze. Fields target HTML, not Markdown.
Escape XML text, use CDATA for literal code, use <pre><code> for rendered code,
and include at least one valid {{cN::answer}} in each Cloze note.
Never emit scripts. Keep each note atomic and add space-separated tags.
```

Imports are atomic with respect to local XML validation: if any note has a
validation error, no deck or note is sent. AnkiConnect may still reject
individual notes after a valid batch is submitted (for example, duplicates).

## 14. Common mistakes

| Mistake | Result / fix |
|---|---|
| `type="Anki Markdown"` | Unsupported in v1; use a built-in type or wait for custom-model support. |
| Bare `&` or `<` in normal text | Malformed XML; use `&amp;`, `&lt;`, or CDATA. |
| HTML inside CDATA expecting formatting | It displays as literal tags; put real tags outside CDATA. |
| Markdown list/fence expecting stock Anki to render it | It remains Markdown source; use HTML structure. |
| Newline expecting a visual break | HTML collapses it; use `<br/>`, blocks, or `<pre>`. |
| `tags="one,two"` | One tag containing a comma; use `tags="one two"`. |
| Image/audio reference without media file | Broken media in Anki; pre-populate `collection.media`. |
| Re-import expecting idempotent success | `allowDuplicate` is false; duplicates are reported as failures. |
| One invalid note among valid notes | The local validation gate aborts the entire file before AnkiConnect. |

## Complete compatibility fixture

See [`examples/issue-cases.xml`](../examples/issue-cases.xml). It includes code,
nested lists, tables with breaks, rich Cloze fields, comma ordinals, a type-in
note, links, keyboard markup, media references, and split CDATA.
