/**
 * Tests for the CLI argv parser and exit-code behavior.
 *
 * The top-level `main()` function awaits so we spawn it through Bun.spawn
 * and inspect stdout / stderr / exit code.
 */

import { describe, expect, test } from "bun:test";
import { CliError, parseArgs } from "../src/index.ts";

// Spawn a CLI invocation and drain stdout/stderr in parallel with the
// exit-code wait. Reading only stdout (or only after p.exited) deadlocks
// when the child's pipe buffer fills - the child blocks on its next
// write, the parent waits for exit, and nothing drains the pipe.
async function runCli(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const p = Bun.spawn(["bun", "run", "src/index.ts", ...args], {
    cwd: `${import.meta.dir}/..`,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
    p.exited,
  ]);
  return { code, stdout, stderr };
}

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

  test("autoCreateDeck defaults to null (caller decides -> true)", () => {
    expect(parseArgs(["import", "foo.xml"]).autoCreateDeck).toBeNull();
  });

  test("honors --auto-create-deck", () => {
    expect(parseArgs(["import", "foo.xml", "--auto-create-deck"]).autoCreateDeck).toBe(true);
  });

  test("honors --no-auto-create-deck", () => {
    expect(parseArgs(["import", "foo.xml", "--no-auto-create-deck"]).autoCreateDeck).toBe(false);
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
    const { code, stdout } = await runCli(["--help"]);
    expect(code).toBe(0);
    expect(stdout).toContain("Usage:");
  });

  test("--version exits 0 with version", async () => {
    const { code, stdout } = await runCli(["--version"]);
    expect(code).toBe(0);
    expect(stdout).toMatch(/^anki-xml v\d/);
  });

  test("no args shows help and exits 0", async () => {
    const { code } = await runCli([]);
    expect(code).toBe(0);
  });

  test("unknown option exits 2", async () => {
    const { code, stderr } = await runCli(["import", "foo.xml", "--bogus"]);
    expect(code).toBe(2);
    expect(stderr).toMatch(/Unknown option/);
  });

  test("import with missing file exits 2 (file read error)", async () => {
    const { code } = await runCli(["import", "/tmp/this-file-does-not-exist-99999.xml"]);
    expect(code).toBe(2);
  });

  test("--dry-run on valid file exits 0 without contacting Anki", async () => {
    const path = `${import.meta.dir}/../examples/basic.xml`;
    const { code, stdout } = await runCli(["import", path, "--dry-run"]);
    expect(code).toBe(0);
    expect(stdout).toContain("Dry run");
  });

  test("validation failures exit 1 and print per-note diagnostics", async () => {
    const tmpPath = `/tmp/anki-xml-cli-invalid-${Math.random().toString(36).slice(2)}.xml`;
    await Bun.write(
      tmpPath,
      `<anki><note type="Basic"><back>A</back></note></anki>`,
    );
    try {
      const { code, stderr } = await runCli(["import", tmpPath]);
      expect(code).toBe(1);
      expect(stderr).toContain("Validation errors:");
      expect(stderr).toContain("Note 1");
    } finally {
      await Bun.$`rm -f ${tmpPath}`.quiet();
    }
  });

  test("validate on valid file exits 0", async () => {
    const path = `${import.meta.dir}/../examples/basic.xml`;
    const { code, stdout } = await runCli(["validate", path]);
    expect(code).toBe(0);
    expect(stdout).toContain("Valid:");
  });

  test("validate on invalid file exits 1", async () => {
    const tmpPath = `/tmp/anki-xml-cli-bad-${Math.random().toString(36).slice(2)}.xml`;
    await Bun.write(
      tmpPath,
      `<anki><note type="Basic"><back>A</back></note></anki>`,
    );
    try {
      const { code } = await runCli(["validate", tmpPath]);
      expect(code).toBe(1);
    } finally {
      await Bun.$`rm -f ${tmpPath}`.quiet();
    }
  });

  test("validate on missing file exits 2", async () => {
    const { code } = await runCli(["validate", "/tmp/no-such-anki-file-99999.xml"]);
    expect(code).toBe(2);
  });

  test("validate --json on valid file exits 0 with envelope", async () => {
    const path = `${import.meta.dir}/../examples/basic.xml`;
    const { code, stdout } = await runCli(["validate", path, "--json"]);
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.version).toBe(1);
    expect(parsed.command).toBe("validate");
    expect(parsed.ok).toBe(true);
    expect(parsed.data.valid).toBe(true);
    expect(Array.isArray(parsed.data.errors)).toBe(true);
    expect(Array.isArray(parsed.data.warnings)).toBe(true);
  });

  test("validate --json-legacy returns raw payload (no envelope)", async () => {
    const path = `${import.meta.dir}/../examples/basic.xml`;
    const { code, stdout } = await runCli(["validate", path, "--json-legacy"]);
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.valid).toBe(true);
    expect(parsed.version).toBeUndefined();
  });

  test("completion bash exits 0 and emits script", async () => {
    const { code, stdout } = await runCli(["completion", "bash"]);
    expect(code).toBe(0);
    expect(stdout).toContain("complete -F _anki_xml_commands");
  });

  test("completion with unknown shell exits 2", async () => {
    const { code, stderr } = await runCli(["completion", "elvish"]);
    expect(code).toBe(2);
    expect(stderr).toMatch(/unknown shell/i);
  });

  test("completion without shell arg exits 2", async () => {
    const { code, stderr } = await runCli(["completion"]);
    expect(code).toBe(2);
    expect(stderr).toMatch(/missing <shell>/);
  });
});

describe("CliError", () => {
  test("has correct name", () => {
    const e = new CliError("x");
    expect(e.name).toBe("CliError");
    expect(e.message).toBe("x");
  });
});
