import { describe, expect, it } from "vitest";
import { Readable } from "node:stream";
import { parseXmlStream } from "../src/parser/xml-stream.ts";
import { validateNote } from "../src/core/validator/validate.ts";

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
});
