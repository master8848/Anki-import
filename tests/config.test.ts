/**
 * Tests for config file (M14).
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { loadConfig, mergeConfigInto, resolveConfig, defaultConfigPath, projectConfigPath } from "../src/config.ts";

const TEMP_XDG = path.join(os.tmpdir(), `anki-xml-config-${Date.now()}`);
let originalXdg: string | undefined;

beforeEach(() => {
  originalXdg = process.env["XDG_CONFIG_HOME"];
  process.env["XDG_CONFIG_HOME"] = TEMP_XDG;
});

afterEach(async () => {
  if (originalXdg === undefined) delete process.env["XDG_DATA_HOME"];
  else process.env["XDG_DATA_HOME"] = originalXdg;
  if (originalXdg === undefined) delete process.env["XDG_CONFIG_HOME"];
  else process.env["XDG_CONFIG_HOME"] = originalXdg;
  await fs.rm(TEMP_XDG, { recursive: true, force: true });
});

describe("loadConfig", () => {
  test("parses every supported key", async () => {
    const tmp = await fs.mkdtemp("/tmp/anki-xml-cfg-");
    const file = `${tmp}/cfg.toml`;
    await fs.writeFile(
      file,
      `url     = "http://10.0.0.42:8765"
profile = "work"
format  = "ndjson"
dry_run = true
no_color = true
quiet    = true`,
      "utf8",
    );
    const cfg = await loadConfig(file);
    expect(cfg.url).toBe("http://10.0.0.42:8765");
    expect(cfg.profile).toBe("work");
    expect(cfg.format).toBe("ndjson");
    expect(cfg.dryRun).toBe(true);
    expect(cfg.noColor).toBe(true);
    expect(cfg.quiet).toBe(true);
    await fs.rm(tmp, { recursive: true, force: true });
  });

  test("returns {} when the file is missing", async () => {
    const cfg = await loadConfig("/nonexistent/path/that/does/not/exist");
    expect(cfg).toEqual({});
  });

  test("ignores unknown keys", async () => {
    const tmp = await fs.mkdtemp("/tmp/anki-xml-cfg-");
    const file = `${tmp}/cfg.toml`;
    await fs.writeFile(
      file,
      `url = "http://x"
future_thing = "y"`,
      "utf8",
    );
    const cfg = await loadConfig(file);
    expect(cfg.url).toBe("http://x");
    expect((cfg as Record<string, unknown>)["future_thing"]).toBeUndefined();
    await fs.rm(tmp, { recursive: true, force: true });
  });
});

describe("resolveConfig", () => {
  test("returns {} + null when no file exists anywhere", async () => {
    const result = await resolveConfig();
    expect(result.config).toEqual({});
    expect(result.source).toBeNull();
  });

  test("uses the explicit path when provided", async () => {
    const tmp = await fs.mkdtemp("/tmp/anki-xml-cfg-");
    const file = `${tmp}/myconfig.toml`;
    await fs.writeFile(file, `url = "http://explicit"`, "utf8");
    const result = await resolveConfig(file);
    expect(result.config.url).toBe("http://explicit");
    expect(result.source).toBe(file);
    await fs.rm(tmp, { recursive: true, force: true });
  });

  test("uses the project config when present in cwd", async () => {
    const tmp = await fs.mkdtemp("/tmp/anki-xml-cfg-");
    const originalCwd = process.cwd();
    process.chdir(tmp);
    try {
      await fs.writeFile(`${tmp}/.anki-xmlrc`, `url = "http://project"`, "utf8");
      const result = await resolveConfig();
      expect(result.config.url).toBe("http://project");
      expect(result.source).toContain(".anki-xmlrc");
    } finally {
      process.chdir(originalCwd);
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  test("falls back to XDG path when no project config exists", async () => {
    await fs.mkdir(path.dirname(defaultConfigPath()), { recursive: true });
    await fs.writeFile(defaultConfigPath(), `url = "http://global"`, "utf8");
    const result = await resolveConfig();
    expect(result.config.url).toBe("http://global");
    expect(result.source).toBe(defaultConfigPath());
  });
});

describe("mergeConfigInto", () => {
  test("fills in unset defaults; url defaults are overridden by config (the documented contract)", () => {
    const target = {
      url: "http://default-url",
      profile: null as string | null,
      format: "default" as "default" | "ndjson",
      dryRun: false,
      noColor: false,
      quiet: false,
    };
    mergeConfigInto(
      {
        url: "http://config-url",
        profile: "work",
        format: "ndjson",
        dryRun: true,
        noColor: true,
        quiet: true,
      },
      target,
    );
    // Config fills in the default URL (CLI flags would have been parsed
    // before mergeConfigInto is called, but URL has a default value, so
    // we can't distinguish CLI-set from default at this layer).
    expect(target.url).toBe("http://config-url");
    // Config fills in unset defaults.
    expect(target.profile).toBe("work");
    expect(target.format).toBe("ndjson");
    expect(target.dryRun).toBe(true);
    expect(target.noColor).toBe(true);
    expect(target.quiet).toBe(true);
  });
});

describe("config path helpers", () => {
  test("defaultConfigPath uses XDG_CONFIG_HOME", () => {
    expect(defaultConfigPath()).toBe(path.join(TEMP_XDG, "anki-xml", "config.toml"));
  });
  test("projectConfigPath points at .anki-xmlrc in cwd", () => {
    expect(projectConfigPath()).toBe(path.join(process.cwd(), ".anki-xmlrc"));
  });
});