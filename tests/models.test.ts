/**
 * Tests for the NoteModel registry (P2.4), id parsing/validation (P2.5),
 * and the field-name mapping (P2.7).
 */

import { describe, expect, test } from "bun:test";
import { ankiFieldName, getModel, MODELS, SUPPORTED_MODEL_NAMES } from "../src/models.ts";
import { parseDocument, parseNotes, validateNotes } from "../src/xml.ts";

describe("MODELS registry", () => {
  test("contains every supported model", () => {
    expect(SUPPORTED_MODEL_NAMES).toContain("Basic");
    expect(SUPPORTED_MODEL_NAMES).toContain("Basic (and reversed card)");
    expect(SUPPORTED_MODEL_NAMES).toContain("Basic (optional reversed card)");
    expect(SUPPORTED_MODEL_NAMES).toContain("Basic (type in the answer)");
    expect(SUPPORTED_MODEL_NAMES).toContain("Cloze");
  });

  test("getModel returns the registered model for exact name", () => {
    expect(getModel("Basic")?.name).toBe("Basic");
    expect(getModel("Cloze")?.name).toBe("Cloze");
  });

  test("getModel returns undefined for unknown types", () => {
    expect(getModel("Made-Up")).toBeUndefined();
  });

  test("Basic model accepts front and back only", () => {
    const m = getModel("Basic")!;
    expect([...m.accepts].sort()).toEqual(["back", "front"]);
    expect([...m.required].sort()).toEqual(["back", "front"]);
    expect(m.optional.size).toBe(0);
  });

  test("Cloze model requires text and accepts extra", () => {
    const m = getModel("Cloze")!;
    expect(m.required.has("text")).toBe(true);
    expect(m.accepts.has("text")).toBe(true);
    expect(m.optional.has("extra")).toBe(true);
    expect(m.accepts.has("front")).toBe(false);
    expect(m.accepts.has("back")).toBe(false);
  });

  test("Basic (optional reversed card) requires addReverse", () => {
    const m = getModel("Basic (optional reversed card)")!;
    expect(m.required.has("front")).toBe(true);
    expect(m.required.has("back")).toBe(true);
    expect(m.required.has("addReverse")).toBe(true);
    expect(m.optional.has("extra")).toBe(true);
  });

  test("ankiFieldName maps XML tag to Anki display name", () => {
    const basic = getModel("Basic")!;
    expect(ankiFieldName(basic, "front")).toBe("Front");
    expect(ankiFieldName(basic, "back")).toBe("Back");

    const cloze = getModel("Cloze")!;
    expect(ankiFieldName(cloze, "text")).toBe("Text");
    expect(ankiFieldName(cloze, "extra")).toBe("Extra");

    const opt = getModel("Basic (optional reversed card)")!;
    expect(ankiFieldName(opt, "addReverse")).toBe("Add Reverse");
  });

  test("ankiFieldName returns null for a tag the model doesn't accept", () => {
    const basic = getModel("Basic")!;
    expect(ankiFieldName(basic, "text")).toBeNull();
    expect(ankiFieldName(basic, "addReverse")).toBeNull();
  });

  test("every model has a buildFields function", () => {
    for (const name of SUPPORTED_MODEL_NAMES) {
      const m = MODELS.get(name);
      expect(m?.buildFields).toBeTypeOf("function");
    }
  });
});

describe("id attribute (P2.5)", () => {
  test("note without id parses with id=undefined", () => {
    const xml = `<anki><note type="Basic" deck="AI Import">
      <front>Q</front><back>A</back>
    </note></anki>`;
    const { notes } = parseDocument(xml);
    expect(notes[0]?.id).toBeUndefined();
  });

  test("note with id='N' parses with id=N", () => {
    const xml = `<anki><note type="Basic" deck="AI Import" id="1500000000001">
      <front>Q</front><back>A</back>
    </note></anki>`;
    const { notes } = parseDocument(xml);
    expect(notes[0]?.id).toBe(1500000000001);
  });

  test("note with id='0' is treated as no id (parsed as undefined)", () => {
    const xml = `<anki><note type="Basic" deck="AI Import" id="0">
      <front>Q</front><back>A</back>
    </note></anki>`;
    const { notes } = parseDocument(xml);
    expect(notes[0]?.id).toBeUndefined();
  });

  test("note with id='abc' is treated as no id (non-numeric)", () => {
    const xml = `<anki><note type="Basic" deck="AI Import" id="abc">
      <front>Q</front><back>A</back>
    </note></anki>`;
    const { notes } = parseDocument(xml);
    expect(notes[0]?.id).toBeUndefined();
  });

  test("duplicate id in the same file is a validation error", () => {
    const xml = `<anki><note type="Basic" deck="AI Import" id="123">
      <front>Q1</front><back>A1</back>
    </note><note type="Basic" deck="AI Import" id="123">
      <front>Q2</front><back>A2</back>
    </note></anki>`;
    const { notes } = parseDocument(xml);
    const result = validateNotes(notes, "");
    expect(result.errors.some((e) => /id 123 is used more than once/.test(e.message))).toBe(true);
  });

  test("unique ids validate cleanly", () => {
    const xml = `<anki>
      <note type="Basic" deck="AI Import" id="1"><front>A</front><back>a</back></note>
      <note type="Basic" deck="AI Import" id="2"><front>B</front><back>b</back></note>
    </anki>`;
    const { notes } = parseDocument(xml);
    const result = validateNotes(notes, "");
    expect(result.errors).toEqual([]);
    expect(result.notes[0]?.id).toBe(1);
    expect(result.notes[1]?.id).toBe(2);
  });

  test("id propagates to ValidatedNote", () => {
    const xml = `<anki><note type="Basic" deck="AI Import" id="42">
      <front>Q</front><back>A</back>
    </note></anki>`;
    const { notes } = parseDocument(xml);
    const result = validateNotes(notes, "");
    expect(result.notes[0]?.id).toBe(42);
  });
});

describe("field-name mapping (P2.7)", () => {
  test("Basic produces Front and Back keys", () => {
    const xml = `<anki><note type="Basic" deck="AI">
      <front>Hola</front><back>Hello</back>
    </note></anki>`;
    const { notes } = parseDocument(xml);
    const result = validateNotes(notes, "");
    expect(Object.keys(result.notes[0]!.fields).sort()).toEqual(["Back", "Front"]);
  });

  test("Basic (optional reversed card) produces Add Reverse and optionally Extra", () => {
    const xml = `<anki><note type="Basic (optional reversed card)" deck="AI">
      <front>Q</front><back>A</back>
      <addReverse>yes</addReverse>
    </note></anki>`;
    const { notes } = parseDocument(xml);
    const result = validateNotes(notes, "");
    expect(Object.keys(result.notes[0]!.fields).sort()).toEqual([
      "Add Reverse",
      "Back",
      "Front",
    ]);
  });

  test("Cloze produces Text and optionally Extra", () => {
    const xml = `<anki><note type="Cloze" deck="AI">
      <text>The capital is {{c1::Paris}}.</text>
    </note></anki>`;
    const { notes } = parseDocument(xml);
    const result = validateNotes(notes, "");
    expect(Object.keys(result.notes[0]!.fields).sort()).toEqual(["Text"]);
  });

  test("Cloze with extra produces Text and Extra", () => {
    const xml = `<anki><note type="Cloze" deck="AI">
      <text>The capital is {{c1::Paris}}.</text>
      <extra>Central Europe</extra>
    </note></anki>`;
    const { notes } = parseDocument(xml);
    const result = validateNotes(notes, "");
    expect(Object.keys(result.notes[0]!.fields).sort()).toEqual(["Extra", "Text"]);
  });

  test("forbidden field on a model is a validation error", () => {
    const xml = `<anki><note type="Basic" deck="AI">
      <front>Q</front><back>A</back>
      <text>Not allowed on Basic</text>
    </note></anki>`;
    const { notes } = parseDocument(xml);
    const result = validateNotes(notes, "");
    expect(result.errors.some((e) => /<text> is not accepted by Basic/.test(e.message))).toBe(true);
  });
});

describe("registry-driven validation", () => {
  test("Cloze without cloze markers fails via validateExtras", () => {
    const xml = `<anki><note type="Cloze" deck="AI">
      <text>No markers here</text>
    </note></anki>`;
    const { notes } = parseDocument(xml);
    const result = validateNotes(notes, "");
    expect(result.errors[0]?.message).toMatch(/marker/i);
  });

  test("Basic (optional reversed card) with bad addReverse value fails", () => {
    const xml = `<anki><note type="Basic (optional reversed card)" deck="AI">
      <front>Q</front><back>A</back>
      <addReverse>maybe</addReverse>
    </note></anki>`;
    const { notes } = parseDocument(xml);
    const result = validateNotes(notes, "");
    expect(result.errors[0]?.message).toMatch(/addReverse/);
  });

  test("unknown model name fails before registry lookup", () => {
    const xml = `<anki><note type="Made-Up" deck="AI">
      <front>Q</front><back>A</back>
    </note></anki>`;
    const notes = parseNotes(xml);
    const result = validateNotes(notes, "");
    expect(result.errors[0]?.message).toMatch(/unsupported note type/);
  });
});
