/**
 * Tests for the CLI shared helpers (output formatting and error wrapping)
 * and the command registry.
 */

import { describe, expect, test } from "bun:test";
import { CliError, parseArgs, type ParsedArgs } from "../src/cli/args.ts";
import { COMMAND_NAMES, COMMANDS, findCommand } from "../src/cli/registry.ts";
import { printCommandHelp, printHelp, VERSION } from "../src/cli/help.ts";
import { fatal, formatOutput, withFatal, writeStdout } from "../src/cli/output.ts";

describe("parseArgs", () => {
  test("parses simple command + positional", () => {
    const a = parseArgs(["import", "foo.xml"]);
    expect(a.command).toBe("import");
    expect(a.positional).toEqual(["foo.xml"]);
    expect(a.url).toBe("http://127.0.0.1:8765");
    expect(a.dryRun).toBe(false);
  });

  test("parses repeated --tag into rest", () => {
    const a = parseArgs(["search", "phrase", "--tag", "a", "--tag", "b"]);
    expect(a.command).toBe("search");
    expect(a.positional).toEqual(["phrase"]);
    expect(a.rest).toEqual(["--tag", "a", "--tag", "b"]);
  });

  test("rejects unknown double-dash flags", () => {
    expect(() => parseArgs(["import", "--nope"])).toThrow(CliError);
  });
});

describe("formatOutput", () => {
  const baseArgs: ParsedArgs = {
    command: "decks",
    positional: [],
    url: "http://127.0.0.1:8765",
    dryRun: false,
    json: true,
    jsonVersion: 0,
    autoCreateDeck: null,
    showHelp: false,
    showVersion: false,
    rest: [],
  };

  test("returns JSON when args.json is true and jsonVersion=0 (legacy)", () => {
    const out = formatOutput({ a: 1 }, { args: baseArgs, startMs: 0, command: "decks" }, "human");
    expect(out).toBe('{\n  "a": 1\n}');
  });

  test("wraps in envelope when args.json=true and jsonVersion=1 (default new)", () => {
    const out = formatOutput({ a: 1 }, { args: { ...baseArgs, jsonVersion: 1 }, startMs: 0, command: "decks" }, "human");
    const parsed = JSON.parse(out);
    expect(parsed.version).toBe(1);
    expect(parsed.command).toBe("decks");
    expect(parsed.ok).toBe(true);
    expect(parsed.data).toEqual({ a: 1 });
    expect(parsed.meta).toBeDefined();
  });

  test("returns human string when args.json is false", () => {
    const out = formatOutput({ a: 1 }, { args: { ...baseArgs, json: false }, startMs: 0, command: "decks" }, "human");
    expect(out).toBe("human");
  });
});

describe("withFatal", () => {
  test("returns the function's exit code on success", async () => {
    const code = await withFatal(async () => 0);
    expect(code).toBe(0);
  });

  test("catches errors and returns 2", async () => {
    const code = await withFatal(async () => {
      throw new Error("boom");
    });
    expect(code).toBe(2);
  });

  test("catches non-Error throws and returns 2 with String(err)", async () => {
    const code = await withFatal(async () => {
      throw "string thrown";
    });
    expect(code).toBe(2);
  });
});

describe("fatal", () => {
  test("returns 2 (caller logs the message)", () => {
    expect(fatal("nope")).toBe(2);
  });
});

describe("writeStdout", () => {
  test("writes text to stdout without newline", () => {
    const orig = process.stdout.write.bind(process.stdout);
    const writes: string[] = [];
    (process.stdout as { write: (s: string) => boolean }).write = (s: string) => {
      writes.push(s);
      return true;
    };
    try {
      writeStdout("hello");
    } finally {
      (process.stdout as { write: typeof orig }).write = orig;
    }
    expect(writes).toEqual(["hello"]);
  });
});

describe("command registry", () => {
  test("contains every shipping command", () => {
    expect(COMMAND_NAMES).toEqual([
      "import",
      "validate",
      "plan",
      "decks",
      "stats",
      "search",
      "update",
      "tag",
      "untag",
      "export",
      "delete",
      "rename-deck",
      "delete-deck",
      "move-notes",
      "suspend",
      "unsuspend",
      "bury",
      "migrate",
      "diff",
      "sync",
      "preview",
      "profile",
      "models",
      "fields",
      "tags",
      "note-info",
      "checkpoint",
      "rollback",
      "audit-log",
      "completion",
    ]);
  });

  test("findCommand returns the registered command", () => {
    const cmd = findCommand("import");
    expect(cmd?.name).toBe("import");
    expect(typeof cmd?.run).toBe("function");
  });

  test("findCommand returns undefined for unknown commands", () => {
    expect(findCommand("nonexistent")).toBeUndefined();
  });

  test("every command has a non-empty description", () => {
    for (const c of COMMANDS) {
      expect(c.description.length).toBeGreaterThan(0);
    }
  });
});

describe("help", () => {
  test("VERSION is a semver-ish string", () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("printHelp writes to stdout and mentions every command", () => {
    const orig = console.log;
    const lines: string[] = [];
    (console as { log: (...args: unknown[]) => void }).log = (...args: unknown[]) => {
      lines.push(args.map((a) => String(a)).join(" "));
    };
    try {
      printHelp();
    } finally {
      console.log = orig;
    }
    const all = lines.join("\n");
    for (const name of COMMAND_NAMES) {
      expect(all).toContain(name);
    }
    expect(all).toContain("Usage:");
    expect(all).toContain("Common options:");
  });

  test("printCommandHelp returns true for known commands", () => {
    const orig = console.log;
    (console as { log: (...args: unknown[]) => void }).log = () => {};
    let ok = false;
    try {
      ok = printCommandHelp("import");
    } finally {
      console.log = orig;
    }
    expect(ok).toBe(true);
  });

  test("printCommandHelp returns false for unknown commands", () => {
    const orig = console.log;
    (console as { log: (...args: unknown[]) => void }).log = () => {};
    let ok = true;
    try {
      ok = printCommandHelp("nonexistent");
    } finally {
      console.log = orig;
    }
    expect(ok).toBe(false);
  });
});
