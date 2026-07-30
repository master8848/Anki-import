import { describe, expect, it } from "vitest";
import { parseDocument, XmlParseError } from "../src/parser/xml-parser.ts";

describe("xml parser", () => {
  it("parses legacy short field tags", () => {
    const doc = parseDocument(`
      <anki deck="Spanish">
        <note type="Basic" tags="greetings">
          <front>Hola</front>
          <back>Hello</back>
        </note>
      </anki>
    `);
    expect(doc.defaultDeck).toBe("Spanish");
    expect(doc.notes).toHaveLength(1);
    expect(doc.notes[0]!.type).toBe("Basic");
    expect(doc.notes[0]!.fields.map((f) => f.name)).toEqual(["front", "back"]);
    expect(doc.notes[0]!.fields[0]!.html.trim()).toBe("Hola");
  });

  it("parses field name= and nested deck + tag children", () => {
    const doc = parseDocument(`
      <anki version="1">
        <deck name="Spanish">
          <note type="Basic">
            <field name="Front"><![CDATA[<h1>Hola</h1>]]></field>
            <field name="Back"><![CDATA[Hello]]></field>
            <tag>language</tag>
            <tag>spanish</tag>
          </note>
        </deck>
      </anki>
    `);
    expect(doc.notes).toHaveLength(1);
    const n = doc.notes[0]!;
    expect(n.deck).toBe("Spanish");
    expect(n.fields).toHaveLength(2);
    expect(n.fields[0]!.name).toBe("front");
    expect(n.fields[0]!.html).toContain("&lt;h1&gt;Hola&lt;/h1&gt;");
    expect(n.tags).toContain("language");
    expect(n.tags).toContain("spanish");
  });

  it("rejects malformed XML", () => {
    expect(() => parseDocument(`<anki><note type="Basic"><front>x</note></anki>`)).toThrow(
      XmlParseError,
    );
  });

  it("rejects wrong root", () => {
    expect(() => parseDocument(`<cards><note type="Basic"/></cards>`)).toThrow(/anki/);
  });

  it("preserves void HTML tags in fields", () => {
    const doc = parseDocument(`
      <anki deck="D">
        <note type="Basic">
          <front>line one<br>line two</front>
          <back>ok</back>
        </note>
      </anki>
    `);
    expect(doc.notes[0]!.fields[0]!.html).toContain("<br>");
    expect(doc.notes[0]!.fields[0]!.html).toContain("line two");
  });

  it("handles media img references in CDATA", () => {
    const doc = parseDocument(`
      <anki deck="D">
        <note type="Basic">
          <front><![CDATA[<img src="cat.png">]]></front>
          <back>cat</back>
        </note>
      </anki>
    `);
    expect(doc.notes[0]!.fields[0]!.html).toContain("cat.png");
  });
});
