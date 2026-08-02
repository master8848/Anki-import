import { describe, expect, it } from "vitest";
import { Readable } from "node:stream";
import {
  parseXmlStream,
  parseDocument,
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

  describe("chunk boundaries inside note content (regression: silent note drop)", () => {
    it("keeps both notes when a boundary falls inside plain text", async () => {
      const xml =
        `<anki deck="D">` +
        `<note type="Basic"><front>aaaa</front><back>bbbb</back></note>` +
        `<note type="Basic"><front>cccc</front><back>dddd</back></note>` +
        `</anki>`;
      // Split inside the first note's <front> text, after 'aaa'.
      const at = xml.indexOf("aaaa") + 3;
      const stream = Readable.from([xml.slice(0, at), xml.slice(at)]);
      const notes = [];
      for await (const n of parseXmlStream(stream)) notes.push(n);
      expect(notes).toHaveLength(2);
      expect(notes[0]!.number).toBe(1);
      expect(notes[1]!.number).toBe(2);
      expect(notes[0]!.fields[0]!.html).toBe("aaaa");
      expect(notes[1]!.fields[0]!.html).toBe("cccc");
    });

    it("emits every note when many boundaries fall inside text or tags", async () => {
      const parts = [];
      for (let i = 0; i < 30; i++) {
        parts.push(
          `<note type="Basic"><front>front text number ${i} padded</front><back>back ${i}</back></note>`,
        );
      }
      const xml = `<anki deck="D">${parts.join("\n")}</anki>`;
      const chunks: string[] = [];
      for (let i = 0; i < xml.length; i += 37) chunks.push(xml.slice(i, i + 37));
      const notes = [];
      for await (const n of parseXmlStream(Readable.from(chunks))) notes.push(n);
      expect(notes).toHaveLength(30);
      for (let i = 0; i < 30; i++) expect(notes[i]!.number).toBe(i + 1);
    });

    it("keeps a note when a chunk ends exactly after '<'", async () => {
      const xml =
        `<anki deck="D">` +
        `<note type="Basic"><front>q</front><back>a</back></note>` +
        `<note type="Basic"><front>q2</front><back>a2</back></note>` +
        `</anki>`;
      const at = xml.indexOf("<note");
      const stream = Readable.from([xml.slice(0, at), xml.slice(at)]);
      const notes = [];
      for await (const n of parseXmlStream(stream)) notes.push(n);
      expect(notes).toHaveLength(2);
      expect(notes[0]!.number).toBe(1);
      expect(notes[1]!.number).toBe(2);
    });

    it("keeps a note when a chunk ends with a partial <note tag", async () => {
      const xml =
        `<anki deck="D">` +
        `<note type="Basic"><front>q</front><back>a</back></note>` +
        `<note type="Basic"><front>q2</front><back>a2</back></note>` +
        `</anki>`;
      const at = xml.indexOf("<note") + 4; // ends with "<not"
      const stream = Readable.from([xml.slice(0, at), xml.slice(at)]);
      const notes = [];
      for await (const n of parseXmlStream(stream)) notes.push(n);
      expect(notes).toHaveLength(2);
      expect(notes[0]!.number).toBe(1);
      expect(notes[1]!.number).toBe(2);
    });

    it("keeps a large note that spans a chunk boundary and compaction", async () => {
      const filler = "y".repeat(300_000);
      const xml =
        `<anki deck="Root">` +
        `<note type="Basic"><front>${filler}</front><back>a</back></note>` +
        `<note type="Basic"><front>q2</front><back>a2</back></note>` +
        `</anki>`;
      const mid = Math.floor(xml.length / 2);
      const stream = Readable.from([xml.slice(0, mid), xml.slice(mid)]);
      const notes = [];
      for await (const n of parseXmlStream(stream)) notes.push(n);
      expect(notes).toHaveLength(2);
      expect(notes[0]!.number).toBe(1);
      expect(notes[1]!.number).toBe(2);
      expect(notes[0]!.fields[0]!.html).toHaveLength(300_000);
    });
  });

  describe("stream well-formedness checks (regression: --stream accepted what the full path rejects)", () => {
    const expectStreamError = async (xml: string) => {
      await expect(async () => {
        for await (const _n of parseXmlStream(Readable.from([xml]))) {
          /* consume */
        }
      }).rejects.toMatchObject({ code: "XML_PARSE_ERROR" });
      expect(() => parseDocument(xml)).toThrow(XmlParseError);
    };

    it("rejects duplicate attributes", async () => {
      await expectStreamError(
        `<anki deck="D"><note type="Basic" type="Second"><front>q</front><back>a</back></note></anki>`,
      );
    });

    it("rejects duplicate attributes split across chunks", async () => {
      const xml = `<anki deck="D"><note type="Basic" type=` + `"Second"><front>q</front><back>a</back></note></anki>`;
      await expectStreamError(xml);
    });

    it("rejects unquoted attribute values", async () => {
      await expectStreamError(
        `<anki deck="D"><note type=Basic><front>q</front><back>a</back></note></anki>`,
      );
    });

    it("rejects valueless (boolean) attributes", async () => {
      await expectStreamError(
        `<anki deck="D"><note type><front>q</front><back>a</back></note></anki>`,
      );
    });

    it("rejects a stray </note> with no open note", async () => {
      await expectStreamError(
        `<anki deck="D"><note type="Basic"><front>q</front><back>a</back></note></note></anki>`,
      );
    });

    it("rejects </deck> matching no open deck", async () => {
      await expectStreamError(`<anki deck="D"></deck></anki>`);
    });

    it("rejects duplicate deck attributes", async () => {
      await expectStreamError(
        `<anki deck="D"><deck name="A" name="B"><note type="Basic"><front>q</front><back>a</back></note></deck></anki>`,
      );
    });

    it("does not reject valid documents or trailing text", async () => {
      const xml =
        `<anki deck="D"><note type="Basic"><front>q</front><back>a</back></note></anki>` +
        `trailing text outside notes`;
      const notes = [];
      for await (const n of parseXmlStream(Readable.from([xml]))) notes.push(n);
      expect(notes).toHaveLength(1);
    });

    it("does not reject text between notes", async () => {
      const xml =
        `<anki deck="D">` +
        `<note type="Basic"><front>q</front><back>a</back></note>` +
        `junk between notes` +
        `<note type="Basic"><front>q2</front><back>a2</back></note>` +
        `</anki>`;
      const notes = [];
      for await (const n of parseXmlStream(Readable.from([xml]))) notes.push(n);
      expect(notes).toHaveLength(2);
      expect(notes[0]!.number).toBe(1);
      expect(notes[1]!.number).toBe(2);
    });
  });

  it("keeps deck context for every note across many chunk splits", async () => {
    const xml =
      `<anki deck="Root">` +
      `<deck name="A"><note type="Basic"><front>a1</front><back>a2</back></note></deck>` +
      `<deck name="B"><deck name="C"><note type="Basic"><front>b1</front><back>b2</back></note></deck></deck>` +
      `<note type="Basic"><front>c1</front><back>c2</back></note>` +
      `</anki>`;
    const chunks: string[] = [];
    for (let i = 0; i < xml.length; i += 7) chunks.push(xml.slice(i, i + 7));
    const notes = [];
    for await (const n of parseXmlStream(Readable.from(chunks))) notes.push(n);
    expect(notes).toHaveLength(3);
    expect(notes[0]!.number).toBe(1);
    expect(notes[0]!.deck).toBe("A");
    expect(notes[1]!.number).toBe(2);
    expect(notes[1]!.deck).toBe("C");
    expect(notes[2]!.number).toBe(3);
    expect(notes[2]!.deck).toBe("Root");
  });

  it("keeps the root deck attribute when the <anki> tag is split across chunks", async () => {
    const xml = `<anki deck="Root"><note type="Basic"><front>q</front><back>a</back></note></anki>`;
    const at = xml.indexOf('<anki deck="Root">') + 9; // inside 'deck='
    const stream = Readable.from([xml.slice(0, at), xml.slice(at)]);
    const notes = [];
    for await (const n of parseXmlStream(stream)) notes.push(n);
    expect(notes).toHaveLength(1);
    expect(notes[0]!.deck).toBe("Root");
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
