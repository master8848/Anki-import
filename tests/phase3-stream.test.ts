/**
 * Tests for the export, tag, and untag commands + NDJSON output.
 */

import { describe, expect, test } from "bun:test";
import { formatNdjsonRecord, selectFormat, stripAnsi } from "../src/cli/output.ts";
import { parseArgs, type ParsedArgs } from "../src/cli/args.ts";
import { findCommand } from "../src/cli/registry.ts";

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
  noColor: false,
  quiet: false,
  format: "default",
  rest: [],
};

describe("export command", () => {
  test("is registered in the registry", () => {
    const cmd = findCommand("export");
    expect(cmd?.name).toBe("export");
    expect(cmd?.description).toMatch(/XML/);
  });

  test("declares its expected flags", () => {
    const cmd = findCommand("export")!;
    expect(cmd.flags!["--deck <name>"]).toBeDefined();
    expect(cmd.flags!["--query <s>"]).toBeDefined();
    expect(cmd.flags!["--with-ids"]).toBeDefined();
    expect(cmd.flags!["--out <path>"]).toBeDefined();
  });
});

describe("tag/untag commands", () => {
  test("tag is registered with --tag repeatable", () => {
    const cmd = findCommand("tag")!;
    expect(cmd.name).toBe("tag");
    expect(cmd.flags!["--tag <name>"]).toBeDefined();
    expect(cmd.flags!["--dry-run"]).toBeDefined();
  });

  test("untag is registered with --tag repeatable", () => {
    const cmd = findCommand("untag")!;
    expect(cmd.name).toBe("untag");
    expect(cmd.flags!["--tag <name>"]).toBeDefined();
    expect(cmd.flags!["--dry-run"]).toBeDefined();
  });

  test("--tag can be repeated in args.rest", () => {
    const args = parseArgs(["tag", "--tag", "a", "--tag", "b"]);
    expect(args.rest).toEqual(["--tag", "a", "--tag", "b"]);
  });
});

describe("NDJSON output (P3.6)", () => {
  test("selectFormat returns ndjson when --format=ndjson is set", () => {
    const args = { ...baseArgs, format: "ndjson" as const };
    expect(selectFormat(args)).toBe("ndjson");
  });

  test("selectFormat returns human when --json is off", () => {
    const args = { ...baseArgs, json: false };
    expect(selectFormat(args)).toBe("human");
  });

  test("selectFormat returns json-legacy when jsonVersion=0", () => {
    const args = { ...baseArgs, jsonVersion: 0 as const };
    expect(selectFormat(args)).toBe("json-legacy");
  });

  test("selectFormat returns json-envelope by default", () => {
    expect(selectFormat(baseArgs)).toBe("json-envelope");
  });

  test("formatNdjsonRecord returns one-line JSON", () => {
    const out = formatNdjsonRecord({ x: 1 }, { args: baseArgs, startMs: 0, command: "test" });
    expect(out).toBe('{"x":1}');
  });

  test("formatNdjsonRecord with isLast includes _meta", () => {
    const out = formatNdjsonRecord(
      { x: 1 },
      { args: baseArgs, startMs: 0, command: "test" },
      true,
    );
    const parsed = JSON.parse(out);
    expect(parsed.x).toBe(1);
    expect(parsed._meta.command).toBe("test");
    expect(parsed._meta.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("--format ndjson is parsed by parseArgs", () => {
    const a = parseArgs(["search", "phrase", "--format", "ndjson"]);
    expect(a.format).toBe("ndjson");
  });

  test("--format default is parsed by parseArgs", () => {
    const a = parseArgs(["search", "phrase", "--format", "default"]);
    expect(a.format).toBe("default");
  });

  test("--format with unknown value throws CliError", () => {
    expect(() => parseArgs(["search", "--format", "csv"])).toThrow(/must be 'ndjson'/);
  });

  test("--format without value throws CliError", () => {
    expect(() => parseArgs(["search", "--format"])).toThrow(/requires a value/);
  });
});

describe("stripAnsi", () => {
  test("removes color codes", () => {
    expect(stripAnsi("\x1b[31mhello\x1b[0m")).toBe("hello");
  });
  test("passes through plain text", () => {
    expect(stripAnsi("plain text")).toBe("plain text");
  });
});
