# XML schema

Root: `<anki version="1" deck="...">`.

Notes: `<note type="Basic|Cloze|...">`.

Fields (either style):

- Short: `<front>`, `<back>`, `<text>`, `<extra>`, `<addReverse>`
- Explicit: `<field name="Front">...</field>`

Optional: `<deck name="...">`, `<tag>...</tag>`, `tags="a b"`.

CDATA for HTML:

```xml
<field name="Front"><![CDATA[<div>Hello</div>]]></field>
```

XSD: `schema/anki.xsd` at repo root.
