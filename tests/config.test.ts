import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CONFIG_FILE_NAMES, findConfig, loadConfig } from "@anki-xml/config";

async function makeTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "anki-config-"));
}

describe("CONFIG_FILE_NAMES", () => {
  it("lists json and yaml variants in precedence order", () => {
    expect(CONFIG_FILE_NAMES).toEqual([
      "anki.config.json",
      "anki.config.yaml",
      "anki.config.yml",
    ]);
  });
});

describe("findConfig", () => {
  it("returns the config file in the start dir", async () => {
    const dir = await makeTempDir();
    await writeFile(join(dir, "anki.config.json"), "{}");
    expect(await findConfig(dir)).toBe(join(dir, "anki.config.json"));
  });

  it("walks up parent directories", async () => {
    const root = await makeTempDir();
    await mkdir(join(root, "a", "b"), { recursive: true });
    await writeFile(join(root, "anki.config.yaml"), "deck: D");
    expect(await findConfig(join(root, "a", "b"))).toBe(join(root, "anki.config.yaml"));
  });

  it("returns null when no config exists above the start dir", async () => {
    const dir = await makeTempDir();
    expect(await findConfig(dir)).toBeNull();
  });
});

describe("loadConfig", () => {
  it("loads deck/model/url from a json config", async () => {
    const dir = await makeTempDir();
    await writeFile(
      join(dir, "anki.config.json"),
      JSON.stringify({ deck: "  German::Vocab  ", model: "Basic", url: "http://localhost:8765" }),
    );
    expect(await loadConfig({ cwd: dir })).toEqual({
      deck: "German::Vocab",
      model: "Basic",
      url: "http://localhost:8765",
    });
  });

  it("loads deck/model/url from a yaml config", async () => {
    const dir = await makeTempDir();
    await writeFile(join(dir, "anki.config.yaml"), "deck: Spanish\nmodel: Cloze\nurl: http://x:1\n");
    expect(await loadConfig({ cwd: dir })).toEqual({
      deck: "Spanish",
      model: "Cloze",
      url: "http://x:1",
    });
  });

  it("returns {} for a yaml config without recognized keys", async () => {
    const dir = await makeTempDir();
    await writeFile(join(dir, "anki.config.yml"), "unrelated: value\n");
    expect(await loadConfig({ cwd: dir })).toEqual({});
  });

  it("ignores empty and non-string values", async () => {
    const dir = await makeTempDir();
    await writeFile(
      join(dir, "anki.config.json"),
      JSON.stringify({ deck: "   ", model: 42, url: null }),
    );
    expect(await loadConfig({ cwd: dir })).toEqual({});
  });

  it("returns {} when no config exists", async () => {
    const dir = await makeTempDir();
    expect(await loadConfig({ cwd: dir })).toEqual({});
  });

  it("throws a helpful error naming the file on invalid json", async () => {
    const dir = await makeTempDir();
    await writeFile(join(dir, "anki.config.json"), "{ not json");
    await expect(loadConfig({ cwd: dir })).rejects.toThrow(
      `Invalid JSON in config file ${join(dir, "anki.config.json")}`,
    );
  });
});
