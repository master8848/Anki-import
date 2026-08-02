import { describe, expect, it } from "vitest";
import { Readable } from "node:stream";
import {
  parseXmlStream,
  XmlParseError,
  JsonParseError,
  CsvParseError,
  YamlParseError,
  parseJson,
  parseCsv,
  parseYaml,
  parseMarkdown,
} from "@anki-xml/parser";
import { validateNote } from "@anki-xml/validation";

function makeHugeXml(n: number): string {
  const parts = ['<anki deck="Huge">'];
  for (let i = 0; i < n; i++) {
    parts.push(`<note type="Basic"><front>Q${i}</front><back>A${i}</back></note>`);
  }
  parts.push("</anki>");
  return parts.join("\n");
}

describe("stream parser", () => {
  it("streams notes from a readable", async () => {
    const xml = makeHugeXml(25);
    const notes = [];
    for await (const note of parseXmlStream(Readable.from([xml]))) {
      notes.push(note);
    }
    expect(notes).toHaveLength(25);
    expect(notes[0]!.number).toBe(1);
    expect(notes[24]!.number).toBe(25);
  });

  it("handles chunked input", async () => {
    const xml = makeHugeXml(10);
    const mid = Math.floor(xml.length / 2);
    const stream = Readable.from([xml.slice(0, mid), xml.slice(mid)]);
    let count = 0;
    for await (const note of parseXmlStream(stream)) {
      const { note: valid } = validateNote(note, "Huge");
      expect(valid).toBeDefined();
      count++;
    }
    expect(count).toBe(10);
  });

  it("handles notes with CDATA spanning logic", async () => {
    const xml = `<anki deck="D">
      <note type="Basic">
        <front><![CDATA[<b>one</b>]]></front>
        <back>two</back>
      </note>
    </anki>`;
    const notes = [];
    for await (const n of parseXmlStream(Readable.from([xml]))) notes.push(n);
    expect(notes).toHaveLength(1);
    expect(notes[0]!.fields[0]!.html).toContain("&lt;b&gt;");
  });

  it("preserves deck context across deep nesting", async () => {
    const xml = `<anki deck="Root">
  <deck name="A"><deck name="B"><deck name="C">
    <note type="Basic"><front>q1</front><back>a1</back></note>
  </deck></deck></deck>
  <deck name="D">
    <note type="Basic"><front>q2</front><back>a2</back></note>
  </deck>
</anki>`;
    const notes = [];
    for await (const n of parseXmlStream(Readable.from([xml]))) notes.push(n);
    expect(notes).toHaveLength(2);
    expect(notes[0]!.deck).toBe("C");
    expect(notes[1]!.deck).toBe("D");
  });

  it("keeps deck context when tags are split across chunks", async () => {
    const xml =
      `<anki deck="Root"><deck name="Japan"><deck name="N4">` +
      `<note type="Basic"><front>q</front><back>a</back></note>` +
      `</deck></deck></anki>`;
    const chunks: string[] = [];
    for (let i = 0; i < xml.length; i += 7) chunks.push(xml.slice(i, i + 7));
    const notes = [];
    for await (const n of parseXmlStream(Readable.from(chunks))) notes.push(n);
    expect(notes).toHaveLength(1);
    expect(notes[0]!.deck).toBe("N4");
  });

  it("tolerates </note > with trailing whitespace", async () => {
    const xml = `<anki deck="D"><note type="Basic"><front>q</front><back>a</back></note ></anki>`;
    const notes = [];
    for await (const n of parseXmlStream(Readable.from([xml]))) notes.push(n);
    expect(notes).toHaveLength(1);
    expect(notes[0]!.fields[0]!.html).toBe("q");
  });

  it("ignores <note text inside CDATA", async () => {
    const xml = `<anki deck="D"><note type="Basic"><front><![CDATA[<note>fake</note>]]></front><back>a</back></note></anki>`;
    const notes = [];
    for await (const n of parseXmlStream(Readable.from([xml]))) notes.push(n);
    expect(notes).toHaveLength(1);
    expect(notes[0]!.fields[0]!.html).toContain("&lt;note&gt;fake&lt;/note&gt;");
  });

  it("keeps deck context across buffer compaction", async () => {
    const filler = "x".repeat(300_000);
    const xml =
      `<anki deck="Root"><deck name="Deep">` +
      `<note type="Basic"><front>${filler}</front><back>a</back></note>` +
      `<note type="Basic"><front>q2</front><back>a2</back></note>` +
      `</deck></anki>`;
    const notes = [];
    for await (const n of parseXmlStream(Readable.from([xml]))) notes.push(n);
    expect(notes).toHaveLength(2);
    expect(notes[0]!.deck).toBe("Deep");
    expect(notes[1]!.deck).toBe("Deep");
  });

  it("surfaces malformed note content as XmlParseError", async () => {
    const xml = `<anki deck="D"><note type="Basic"><front>q</back></note></anki>`;
    await expect(async () => {
      for await (const _n of parseXmlStream(Readable.from([xml]))) {
        /* consume */
      }
    }).rejects.toThrow(XmlParseError);
  });

  it("surfaces illegal PCDATA from the tokenizer pass", async () => {
    const xml = `<anki deck="D"><note type="Basic"><front>a < b</front><back>c</back></note></anki>`;
    await expect(async () => {
      for await (const _n of parseXmlStream(Readable.from([xml]))) {
        /* consume */
      }
    }).rejects.toThrow(/Illegal '<' in PCDATA/);
  });

  describe("non-XML parser error codes", () => {
    it("json errors carry JSON_PARSE_ERROR", () => {
      expect(() => parseJson(`{"notes": [`)).toThrow(JsonParseError);
      try {
        parseJson(`{"notes": [`);
        expect.unreachable();
      } catch (err) {
        expect((err as { code: string }).code).toBe("JSON_PARSE_ERROR");
      }
    });

    it("csv errors carry CSV_PARSE_ERROR", () => {
      expect(() => parseCsv(`front,back\n"unclosed`)).toThrow(CsvParseError);
      try {
        parseCsv(`front,back\n"unclosed`);
        expect.unreachable();
      } catch (err) {
        expect((err as { code: string }).code).toBe("CSV_PARSE_ERROR");
      }
    });

    it("yaml errors carry YAML_PARSE_ERROR", () => {
      expect(() => parseYaml(`notes: [1,`)).toThrow(YamlParseError);
      try {
        parseYaml(`notes: [1,`);
        expect.unreachable();
      } catch (err) {
        expect((err as { code: string }).code).toBe("YAML_PARSE_ERROR");
      }
    });

    it("malformed markdown frontmatter throws the YAML code", () => {
      expect(() => parseMarkdown(`---\ndeck: [unclosed\n---\n# Q\nA`)).toThrow(YamlParseError);
      try {
        parseMarkdown(`---\ndeck: [unclosed\n---\n# Q\nA`);
        expect.unreachable();
      } catch (err) {
        expect((err as { code: string }).code).toBe("YAML_PARSE_ERROR");
        expect((err as Error).message).toMatch(/frontmatter/);
      }
    });
  });
});
