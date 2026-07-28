/**
 * Tests for Phase 3 low-effort features: schema version declaration,
 * --no-color / --quiet flags, and the find-and-update pipeline recipe.
 */

import { describe, expect, test } from "bun:test";
import { parseDocument } from "../src/xml.ts";
import { parseArgs } from "../src/cli/args.ts";
import { stripAnsi } from "../src/cli/output.ts";

describe("P3.7 schema version", () => {
  test("v1 doc without version attribute parses cleanly", () => {
    const xml = `<anki><note type="Basic" deck="AI">
      <front>Q</front><back>A</back>
    </note></anki>`;
    expect(() => parseDocument(xml)).not.toThrow();
  });

  test("v1 doc with version=\"1\" parses cleanly", () => {
    const xml = `<anki version="1"><note type="Basic" deck="AI">
      <front>Q</front><back>A</back>
    </note></anki>`;
    expect(() => parseDocument(xml)).not.toThrow();
  });

  test("v2 doc with version=\"2\" throws XmlParseError", () => {
    const xml = `<anki version="2"><note type="Basic" deck="AI">
      <front>Q</front><back>A</back>
    </note></anki>`;
    expect(() => parseDocument(xml)).toThrow(/Unsupported <anki version="2">/);
  });

  test("non-numeric version also throws", () => {
    const xml = `<anki version="abc"><note type="Basic" deck="AI">
      <front>Q</front><back>A</back>
    </note></anki>`;
    expect(() => parseDocument(xml)).toThrow(/Unsupported <anki version="abc">/);
  });
});

describe("P3.8 --no-color and --quiet", () => {
  test("parseArgs sets noColor=true", () => {
    expect(parseArgs(["--no-color"]).noColor).toBe(true);
    expect(parseArgs(["--no-colour"]).noColor).toBe(true);
  });

  test("parseArgs sets quiet=true", () => {
    expect(parseArgs(["--quiet"]).quiet).toBe(true);
  });

  test("stripAnsi removes ANSI color codes", () => {
    const input = "\x1b[31mred\x1b[0m and \x1b[32mgreen\x1b[0m";
    expect(stripAnsi(input)).toBe("red and green");
  });

  test("stripAnsi is a no-op for plain text", () => {
    expect(stripAnsi("plain text")).toBe("plain text");
  });

  test("stripAnsi handles complex codes", () => {
    const input = "\x1b[1;32mbold green\x1b[0m then \x1b[4munderlined\x1b[24m";
    expect(stripAnsi(input)).toBe("bold green then underlined");
  });
});

describe("P3.9 find-and-update pipeline", () => {
  test("documents the search -> update pipeline via two commands", () => {
    // The pipeline is:
    //   ids=$(anki-xml search "phrase" --json --json-legacy | jq -r '.hits[].noteId')
    //   anki-xml update --ids "$ids" --field Front="new"
    //
    // We assert the search command supports --json (the registry
    // delegates to args.json), and that the update command supports
    // --ids (already verified in tests/cli.test.ts).
    const args = parseArgs(["search", "phrase", "--json"]);
    expect(args.json).toBe(true);
    expect(args.command).toBe("search");
  });
});
