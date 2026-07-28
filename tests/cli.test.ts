/**
 * Tests for the CLI argv parser and exit-code behavior.
 *
 * The top-level `main()` function awaits so we spawn it through Bun.spawn
 * and inspect stdout / stderr / exit code.
 */

import { describe, expect, test } from "bun:test";
import { CliError, parseArgs } from "../src/index.ts";

describe("parseArgs", () => {
  test("imports default URL", () => {
    const a = parseArgs(["import", "foo.xml"]);
    expect(a.command).toBe("import");
    expect(a.positional).toEqual(["foo.xml"]);
    expect(a.url).toBe("http://127.0.0.1:8765");
    expect(a.dryRun).toBe(false);
  });

  test("honors --url", () => {
    const a = parseArgs(["import", "foo.xml", "--url", "http://example:9999"]);
    expect(a.url).toBe("http://example:9999");
  });

  test("honors --dry-run", () => {
    const a = parseArgs(["import", "foo.xml", "--dry-run"]);
    expect(a.dryRun).toBe(true);
  });

  test("honors --help", () => {
    expect(parseArgs(["--help"]).showHelp).toBe(true);
    expect(parseArgs(["-h"]).showHelp).toBe(true);
  });

  test("honors --version", () => {
    expect(parseArgs(["--version"]).showVersion).toBe(true);
    expect(parseArgs(["-v"]).showVersion).toBe(true);
  });

  test("throws CliError on unknown option", () => {
    expect(() => parseArgs(["import", "foo.xml", "--nope"])).toThrow(CliError);
  });

  test("throws CliError on --url without value", () => {
    expect(() => parseArgs(["import", "foo.xml", "--url"])).toThrow(/requires a value/);
  });
});

describe("main: end-to-end via spawn", () => {
  test("--help exits 0 with usage", async () => {
    const p = Bun.spawn(["bun", "run", "src/index.ts", "--help"], {
      cwd: import.meta.dir + "/..",
      stdout: "pipe",
      stderr: "pipe",
    });
    const code = await p.exited;
    const out = await new Response(p.stdout).text();
    expect(code).toBe(0);
    expect(out).toContain("Usage:");
  });

  test("--version exits 0 with version", async () => {
    const p = Bun.spawn(["bun", "run", "src/index.ts", "--version"], {
      cwd: import.meta.dir + "/..",
      stdout: "pipe",
      stderr: "pipe",
    });
    const code = await p.exited;
    const out = await new Response(p.stdout).text();
    expect(code).toBe(0);
    expect(out).toMatch(/^anki-xml v\d/);
  });

  test("no args shows help and exits 0", async () => {
    const p = Bun.spawn(["bun", "run", "src/index.ts"], {
      cwd: import.meta.dir + "/..",
      stdout: "pipe",
      stderr: "pipe",
    });
    const code = await p.exited;
    expect(code).toBe(0);
  });

  test("unknown option exits 2", async () => {
    const p = Bun.spawn(["bun", "run", "src/index.ts", "import", "foo.xml", "--bogus"], {
      cwd: import.meta.dir + "/..",
      stdout: "pipe",
      stderr: "pipe",
    });
    const code = await p.exited;
    const err = await new Response(p.stderr).text();
    expect(code).toBe(2);
    expect(err).toMatch(/Unknown option/);
  });

  test("import with missing file exits 2 (file read error)", async () => {
    const p = Bun.spawn(["bun", "run", "src/index.ts", "import", "/tmp/this-file-does-not-exist-99999.xml"], {
      cwd: import.meta.dir + "/..",
      stdout: "pipe",
      stderr: "pipe",
    });
    const code = await p.exited;
    expect(code).toBe(2);
  });

  test("--dry-run on valid file exits 0 without contacting Anki", async () => {
    const path = `${import.meta.dir}/../examples/basic.xml`;
    const p = Bun.spawn(["bun", "run", "src/index.ts", "import", path, "--dry-run"], {
      cwd: import.meta.dir + "/..",
      stdout: "pipe",
      stderr: "pipe",
    });
    const code = await p.exited;
    const out = await new Response(p.stdout).text();
    expect(code).toBe(0);
    expect(out).toContain("Dry run");
  });

  test("validation failures exit 1 and print per-note diagnostics", async () => {
    const tmpPath = `/tmp/anki-xml-cli-invalid-${Math.random().toString(36).slice(2)}.xml`;
    await Bun.write(
      tmpPath,
      `<anki><note type="Basic"><back>A</back></note></anki>`,
    );
    const p = Bun.spawn(["bun", "run", "src/index.ts", "import", tmpPath], {
      cwd: import.meta.dir + "/..",
      stdout: "pipe",
      stderr: "pipe",
    });
    const code = await p.exited;
    const err = await new Response(p.stderr).text();
    await Bun.$`rm -f ${tmpPath}`;
    expect(code).toBe(1);
    expect(err).toContain("Validation errors:");
    expect(err).toContain("Note 1");
  });
});

describe("CliError", () => {
  test("has correct name", () => {
    const e = new CliError("x");
    expect(e.name).toBe("CliError");
    expect(e.message).toBe("x");
  });
});