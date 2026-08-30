import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnkiClient } from "@anki-xml/anki";
import * as anki from "@anki-xml/anki";
import { createLogger } from "@anki-xml/logger";
import { runInit } from "@anki-xml/core";

// Required mocks per task: spawn, existsSync, fetch, AnkiClient.diagnose, getAddons
vi.mock("node:child_process", async (importOriginal) => {
  const mod = await importOriginal() as Record<string, unknown>;
  return { ...mod, spawn: vi.fn(), execSync: vi.fn(() => { throw new Error("mocked execSync"); }) };
});
vi.mock("node:fs", async (importOriginal) => {
  const mod = await importOriginal() as Record<string, unknown>;
  return { ...mod, existsSync: vi.fn(() => false) };
});

function makeLogger() {
  const infos: string[] = [];
  const errors: string[] = [];
  const log = {
    info: (m: string) => infos.push(m),
    error: (m: string) => errors.push(m),
    warn: vi.fn(),
    debug: vi.fn(),
  } as unknown as ReturnType<typeof createLogger>;
  return { log, infos, errors };
}

describe("anki-import init", () => {
  beforeEach(() => {
    // fetch mock (global) — init uses fetch to download addon zip
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ result: null, error: null }), body: null } as unknown as Response)));
    vi.spyOn(AnkiClient.prototype, "diagnose").mockResolvedValue({
      reachable: true, cause: "ok", url: "http://127.0.0.1:8765", detail: "ok", hints: [],
    });
    vi.spyOn(AnkiClient.prototype, "version").mockResolvedValue(6);
    vi.spyOn(AnkiClient.prototype, "deckNames").mockResolvedValue(["Default"]);
    vi.spyOn(AnkiClient.prototype, "modelNames").mockResolvedValue(["Basic"]);
    vi.spyOn(AnkiClient.prototype, "getAddons").mockResolvedValue({});
    // avoid real filesystem/network side effects for addon
    vi.spyOn(anki, "installAddon").mockResolvedValue(undefined as never);
    vi.spyOn(anki, "enableAddon").mockImplementation(() => {});
    vi.spyOn(anki, "isAddonInstalled").mockReturnValue(false);
    vi.spyOn(anki, "isAddonEnabled").mockReturnValue(false);
    vi.spyOn(anki, "quitAnki").mockImplementation(() => {});
    vi.spyOn(anki, "launchAnki").mockResolvedValue({ ok: true, command: "anki", detail: "ok" } as never);
  });
  afterEach(() => vi.restoreAllMocks());

  it("--skip-anki-install skips Anki binary check and only does addon", async () => {
    const isInstalledSpy = vi.spyOn(anki, "isAnkiInstalled");
    const { log, infos } = makeLogger();
    const code = await runInit({ skipAnkiInstall: true, timeout: 500 }, log);
    expect(code).toBe(0);
    expect(isInstalledSpy).not.toHaveBeenCalled();
    expect(anki.installAddon).toHaveBeenCalled();
    expect(infos.join("\n")).toMatch(/Skipping Anki install/i);
  });

  it("--check dry run does not install anything, prints would-do messages", async () => {
    const { log, infos } = makeLogger();
    const code = await runInit({ check: true, timeout: 500 }, log);
    expect(code).toBe(0);
    expect(anki.installAddon).not.toHaveBeenCalled();
    expect(infos.join("\n")).toMatch(/\[check\]/i);
    expect(infos.join("\n")).toMatch(/would/i);
    expect(infos.join("\n")).toMatch(/no changes made/i);
  });

  it("when Anki not installed and auto-install fails, prints Please install manually and exits 1", async () => {
    vi.spyOn(anki, "isAnkiInstalled").mockReturnValue(false);
    const { log, errors } = makeLogger();
    const code = await runInit({ timeout: 500 }, log);
    expect(code).toBe(1);
    expect(errors.join("\n") + log).toMatch(/Please install manually/);
  });

  it("when Anki already installed but version too old, fails with version is less than expected unless --force/--update-anki", async () => {
    vi.spyOn(anki, "isAnkiInstalled").mockReturnValue(true);
    vi.spyOn(anki, "getAnkiVersion").mockReturnValue("2.0.0");

    const { log: log1, errors } = makeLogger();
    const code1 = await runInit({ timeout: 500 }, log1);
    expect(code1).toBe(1);
    expect(errors.join("\n")).toMatch(/version is less than expected/i);

    const { log: log2 } = makeLogger();
    const code2 = await runInit({ force: true, timeout: 500 }, log2);
    expect(code2).toBe(0);

    const { log: log3 } = makeLogger();
    const code3 = await runInit({ updateAnki: true, timeout: 500 }, log3);
    expect(code3).toBe(0);
  });

  it("when Anki already installed and version ok, skips install and proceeds to addon", async () => {
    vi.spyOn(anki, "isAnkiInstalled").mockReturnValue(true);
    vi.spyOn(anki, "getAnkiVersion").mockReturnValue("24.06.3");
    const { log, infos } = makeLogger();
    const code = await runInit({ timeout: 500 }, log);
    expect(code).toBe(0);
    expect(infos.join("\n")).toMatch(/already installed/i);
    expect(anki.installAddon).toHaveBeenCalled();
  });

  it("addon install always happens even with --skip-anki-install", async () => {
    vi.spyOn(anki, "isAnkiInstalled").mockReturnValue(true);
    vi.spyOn(anki, "getAnkiVersion").mockReturnValue("24.06.3");
    const { log } = makeLogger();
    await runInit({ skipAnkiInstall: true, timeout: 500 }, log);
    expect(anki.installAddon).toHaveBeenCalled();
    vi.mocked(anki.installAddon).mockClear();
    await runInit({ timeout: 500 }, log);
    expect(anki.installAddon).toHaveBeenCalled();
  });

  it("if Anki was running, restart is triggered", async () => {
    vi.spyOn(anki, "isAnkiInstalled").mockReturnValue(true);
    vi.spyOn(anki, "getAnkiVersion").mockReturnValue("24.06.3");
    vi.mocked(AnkiClient.prototype.diagnose).mockResolvedValue({
      reachable: true, cause: "ok", url: "http://127.0.0.1:8765", detail: "ok", hints: [],
    });
    const quitSpy = vi.spyOn(anki, "quitAnki").mockImplementation(() => {});
    const launchSpy = vi.spyOn(anki, "launchAnki").mockResolvedValue({ ok: true, command: "anki", detail: "ok" } as never);
    const { log, infos } = makeLogger();
    const code = await runInit({ timeout: 500 }, log);
    expect(code).toBe(0);
    expect(quitSpy).toHaveBeenCalled();
    expect(launchSpy).toHaveBeenCalled();
    expect(infos.join("\n")).toMatch(/Restarting Anki/i);
  }, 10000);

  it("human-readable output is used by default (not JSON)", async () => {
    vi.spyOn(anki, "isAnkiInstalled").mockReturnValue(true);
    vi.spyOn(anki, "getAnkiVersion").mockReturnValue("24.06.3");
    const { log, infos } = makeLogger();
    const conSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runInit({ timeout: 500 }, log);
    const jsonCalls = conSpy.mock.calls.filter(([s]) => {
      try { JSON.parse(String(s)); return typeof s === "string" && s.trim().startsWith("{"); } catch { return false; }
    });
    expect(jsonCalls.length).toBe(0);
    expect(infos.length).toBeGreaterThan(0);
    conSpy.mockRestore();
  });
});
