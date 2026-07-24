/**
 * Tests for the `validate` command.
 *
 * Validates that `runValidate` parses + structurally validates an XML
 * file without contacting AnkiConnect, and that warnings (--strict)
 * promote to errors.
 */

import { describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { runValidate } from "../src/validate.ts";

async function stageXml(xml: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "anki-xml-validate-"));
  const file = path.join(dir, "cards.xml");
  await fs.writeFile(file, xml, "utf8");
  return file;
}

const VALID_BASIC = `<?xml version="1.0"?>
<anki>
  <note type="Basic" deck="AI Import::Test">
    <front>Hola</front>
    <back>Hello</back>
  </note>
  <note type="Basic" deck="AI Import::Test">
    <front>Adios</front>
    <back>Goodbye</back>
  </note>
</anki>
`;

describe("runValidate", () => {
  test("happy path: valid file reports no errors", async () => {
    const file = await stageXml(VALID_BASIC);
    const report = await runValidate({ filePath: file });

    expect(report.valid).toBe(true);
    expect(report.noteCount).toBe(2);
    expect(report.errors).toEqual([]);
    expect(report.decks).toEqual(["AI Import::Test"]);
  });

  test("missing required field produces error", async () => {
    const file = await stageXml(`<anki>
  <note type="Basic" deck="AI Import">
    <front>Hola</front>
  </note>
</anki>`);
    const report = await runValidate({ filePath: file });

    expect(report.valid).toBe(false);
    expect(report.errors.length).toBeGreaterThan(0);
    expect(report.errors.some((e) => e.message.includes("<back>"))).toBe(true);
  });

  test("unknown model produces error", async () => {
    const file = await stageXml(`<anki>
  <note type="Made-Up Model" deck="AI Import">
    <front>Hola</front>
    <back>Hello</back>
  </note>
</anki>`);
    const report = await runValidate({ filePath: file });

    expect(report.valid).toBe(false);
    expect(report.errors[0]?.message).toMatch(/unsupported note type/);
  });

  test("Cloze without marker produces error", async () => {
    const file = await stageXml(`<anki>
  <note type="Cloze" deck="AI Import">
    <text>Hola without a cloze</text>
  </note>
</anki>`);
    const report = await runValidate({ filePath: file });

    expect(report.valid).toBe(false);
    expect(report.errors[0]?.message).toMatch(/cloze/i);
  });

  test("duplicate field tag within a note produces error", async () => {
    const file = await stageXml(`<anki>
  <note type="Basic" deck="AI Import">
    <front>Q1</front>
    <back>A1</back>
    <front>Q2</front>
    <back>A2</back>
  </note>
</anki>`);
    const report = await runValidate({ filePath: file });

    expect(report.valid).toBe(false);
    expect(report.errors.some((e) => /more than once/.test(e.message))).toBe(true);
  });

  test("comma inside tag produces warning", async () => {
    const file = await stageXml(`<anki>
  <note type="Basic" deck="AI Import" tags="foo,bar baz">
    <front>Q</front><back>A</back>
  </note>
</anki>`);
    const report = await runValidate({ filePath: file });

    expect(report.valid).toBe(true);
    expect(report.warnings.some((w) => w.message.includes("comma"))).toBe(true);
  });

  test("long tag produces warning", async () => {
    const longTag = "x".repeat(120);
    const file = await stageXml(`<anki>
  <note type="Basic" deck="AI Import" tags="${longTag}">
    <front>Q</front><back>A</back>
  </note>
</anki>`);
    const report = await runValidate({ filePath: file });

    expect(report.warnings.some((w) => w.message.includes("unusually long"))).toBe(true);
  });

  test("--strict promotes warnings to errors", async () => {
    const file = await stageXml(`<anki>
  <note type="Basic" deck="AI Import" tags="foo,bar">
    <front>Q</front><back>A</back>
  </note>
</anki>`);

    const lenient = await runValidate({ filePath: file, strict: false });
    expect(lenient.valid).toBe(true);
    expect(lenient.warnings.length).toBeGreaterThan(0);

    const strict = await runValidate({ filePath: file, strict: true });
    expect(strict.valid).toBe(false);
    expect(strict.warnings).toEqual([]);
    expect(strict.errors.length).toBeGreaterThan(0);
  });

  test("empty <anki> produces error", async () => {
    const file = await stageXml(`<anki></anki>`);
    const report = await runValidate({ filePath: file });

    expect(report.valid).toBe(false);
    expect(report.noteCount).toBe(0);
    expect(report.errors[0]?.message).toMatch(/no <note>/i);
  });

  test("malformed XML throws XmlParseError", async () => {
    const file = await stageXml(`<anki><note type="Basic"><front>oops`);
    await expect(runValidate({ filePath: file })).rejects.toThrow();
  });

  test("wrong root element throws", async () => {
    const file = await stageXml(`<wrongroot></wrongroot>`);
    await expect(runValidate({ filePath: file })).rejects.toThrow(/Root element/);
  });

  test("file not found rejects with read error", async () => {
    await expect(runValidate({ filePath: "/nonexistent/file.xml" })).rejects.toThrow();
  });

  test("decks list is unique and excludes empty", async () => {
    const file = await stageXml(`<anki>
  <note type="Basic" deck="A"><front>1</front><back>1</back></note>
  <note type="Basic" deck="A"><front>2</front><back>2</back></note>
  <note type="Basic" deck="B"><front>3</front><back>3</back></note>
</anki>`);
    const report = await runValidate({ filePath: file });

    expect(report.decks).toEqual(["A", "B"]);
  });
});