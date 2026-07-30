import { describe, expect, it } from "vitest";
import { parseDocument } from "../src/parser/xml-parser.ts";
import { validateNotes, formatValidationError } from "../src/core/validator/validate.ts";

describe("validator", () => {
  it("accepts a valid Basic note", () => {
    const src = `<anki deck="D"><note type="Basic"><front>a</front><back>b</back></note></anki>`;
    const doc = parseDocument(src);
    const result = validateNotes(doc.notes, doc.defaultDeck, src);
    expect(result.errors).toHaveLength(0);
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0]!.fields).toEqual({ Front: "a", Back: "b" });
  });

  it("reports missing fields with line info", () => {
    const src = `<anki deck="D">
  <note type="Basic">
    <front>only front</front>
  </note>
</anki>`;
    const doc = parseDocument(src);
    const result = validateNotes(doc.notes, doc.defaultDeck, src);
    expect(result.errors.length).toBeGreaterThan(0);
    const msg = result.errors.map(formatValidationError).join("\n");
    expect(msg).toMatch(/Missing field:\s*Back/i);
  });

  it("rejects empty deck", () => {
    const src = `<anki><note type="Basic"><front>a</front><back>b</back></note></anki>`;
    const doc = parseDocument(src);
    const result = validateNotes(doc.notes, doc.defaultDeck, src);
    expect(result.errors.some((e) => /deck/i.test(e.message))).toBe(true);
  });

  it("rejects cloze without markers", () => {
    const src = `<anki deck="D"><note type="Cloze"><text>no cloze here</text></note></anki>`;
    const doc = parseDocument(src);
    const result = validateNotes(doc.notes, doc.defaultDeck, src);
    expect(result.errors.some((e) => /cN::/.test(e.message))).toBe(true);
  });

  it("detects duplicate note ids", () => {
    const src = `<anki deck="D">
      <note type="Basic" id="1"><front>a</front><back>b</back></note>
      <note type="Basic" id="1"><front>c</front><back>d</back></note>
    </anki>`;
    const doc = parseDocument(src);
    const result = validateNotes(doc.notes, doc.defaultDeck, src);
    expect(result.errors.some((e) => /more than once/.test(e.message))).toBe(true);
  });
});
