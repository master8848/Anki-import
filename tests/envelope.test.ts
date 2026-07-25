/**
 * Tests for the JSON envelope (P2.8) and structured error locations (P1.3).
 */

import { describe, expect, test } from "bun:test";
import {
  envelope,
  errorEnvelope,
  ENVELOPE_VERSION,
  ErrorCode,
} from "../src/cli/envelope.ts";
import type { ParsedArgs } from "../src/cli/args.ts";
import { parseDocument, validateNotes } from "../src/xml.ts";

const baseArgs: ParsedArgs = {
  command: "test",
  positional: [],
  url: "http://127.0.0.1:8765",
  dryRun: false,
  json: true,
  jsonVersion: 1,
  autoCreateDeck: null,
  showHelp: false,
  showVersion: false,
  rest: [],
};

describe("envelope", () => {
  test("version constant is 1", () => {
    expect(ENVELOPE_VERSION).toBe(1);
  });

  test("envelope() wraps data with version, command, ok, meta", () => {
    const e = envelope("import", baseArgs, 0, { created: 3 });
    expect(e.version).toBe(1);
    expect(e.command).toBe("import");
    expect(e.ok).toBe(true);
    expect(e.data).toEqual({ created: 3 });
    expect(e.meta.duration_ms).toBeGreaterThanOrEqual(0);
    expect(e.meta.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(e.meta.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("envelope() includes args snapshot without redaction surprises", () => {
    const e = envelope("decks", baseArgs, 0, []);
    expect(e.args).toBeDefined();
    expect(e.args?.url).toBe("http://127.0.0.1:8765");
    expect(e.args?.dryRun).toBe(false);
  });

  test("envelope() includes warnings when provided", () => {
    const e = envelope("import", baseArgs, 0, { created: 1 }, [
      { noteNumber: 2, message: "tag warning" },
    ]);
    expect(e.warnings).toHaveLength(1);
    expect(e.warnings?.[0]?.message).toBe("tag warning");
  });

  test("errorEnvelope() sets ok=false and populates error", () => {
    const e = errorEnvelope("import", baseArgs, 0, ErrorCode.VALIDATION_ERROR, "bad input", { errors: [] });
    expect(e.ok).toBe(false);
    expect(e.error?.code).toBe("VALIDATION_ERROR");
    expect(e.error?.message).toBe("bad input");
    expect(e.error?.details).toEqual({ errors: [] });
    expect(e.data).toBeUndefined();
  });

  test("ErrorCode values are uppercase snake_case", () => {
    for (const v of Object.values(ErrorCode)) {
      expect(v).toMatch(/^[A-Z][A-Z0-9_]*$/);
    }
  });

  test("essential error codes are present", () => {
    expect(ErrorCode.VALIDATION_ERROR).toBe("VALIDATION_ERROR");
    expect(ErrorCode.FILE_NOT_FOUND).toBe("FILE_NOT_FOUND");
    expect(ErrorCode.XML_PARSE_ERROR).toBe("XML_PARSE_ERROR");
    expect(ErrorCode.UNK_NOWN_COMMAND).toBeUndefined(); // typo guard
    expect(ErrorCode.UNK_NOWN_SHELL).toBeUndefined();
  });
});

describe("structured error locations (P1.3)", () => {
  test("validation errors get line/column when source is provided", () => {
    const xml = `<anki>
  <note type="Basic" deck="AI">
    <front>Q</front>
  </note>
</anki>`;
    const { notes } = parseDocument(xml);
    const result = validateNotes(notes, "", xml);
    expect(result.errors.length).toBeGreaterThan(0);
    for (const e of result.errors) {
      expect(e.line).toBeDefined();
      expect(e.column).toBeDefined();
      expect(e.line).toBeGreaterThan(0);
      expect(e.column).toBeGreaterThan(0);
    }
  });

  test("errors point at the right line for a multi-note file", () => {
    const xml = `<?xml version="1.0"?>
<anki>
  <note type="Basic" deck="AI">
    <front>Q1</front><back>A1</back>
  </note>
  <note type="Basic" deck="AI">
    <front>Q2</front>
  </note>
</anki>
`;
    const { notes } = parseDocument(xml);
    const result = validateNotes(notes, "", xml);
    // Note 2 starts on line 6; the missing-required error should point there.
    const missing = result.errors.find((e) => /requires <back>/.test(e.message));
    expect(missing?.line).toBe(6);
  });

  test("without source parameter, errors have no line/column", () => {
    const xml = `<anki><note type="Basic" deck="AI"><front>Q</front></note></anki>`;
    const { notes } = parseDocument(xml);
    const result = validateNotes(notes, "");
    expect(result.errors[0]?.line).toBeUndefined();
    expect(result.errors[0]?.column).toBeUndefined();
  });
});
