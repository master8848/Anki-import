import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createCheckpoint,
  createCheckpointForNotes,
  loadCheckpoint,
} from "@anki-xml/checkpoint";

const originalXdg = process.env.XDG_DATA_HOME;
let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(tmpdir(), "anki-xml-checkpoint-"));
  process.env.XDG_DATA_HOME = tmpDir;
});

afterEach(async () => {
  if (originalXdg === undefined) delete process.env.XDG_DATA_HOME;
  else process.env.XDG_DATA_HOME = originalXdg;
  await rm(tmpDir, { recursive: true, force: true });
});

const checkpointDir = (): string => path.join(tmpDir, "anki-import", "checkpoints");

describe("createCheckpointForNotes", () => {
  it("returns null when there are no noteIds (nothing to record)", async () => {
    const snap = await createCheckpointForNotes(new Set(["Deck"]), [], "import", {
      id: "empty",
    });
    expect(snap).toBeNull();
    expect(await readdir(checkpointDir()).catch(() => [])).toHaveLength(0);
  });

  it("uses the single deck when exactly one deck was touched", async () => {
    const snap = await createCheckpointForNotes(new Set(["Spanish"]), [1, 2], "import", {
      id: "single",
    });
    expect(snap).toMatchObject({ id: "single", deck: "Spanish", noteIds: [1, 2] });
  });

  it("falls back to defaultDeck when multiple decks were touched", async () => {
    const snap = await createCheckpointForNotes(new Set(["A", "B"]), [1], "import", {
      id: "multi",
      defaultDeck: "Fallback",
    });
    expect(snap?.deck).toBe("Fallback");
  });

  it("generates a prefix-timestamp id when none is given", async () => {
    const snap = await createCheckpointForNotes(new Set(["D"]), [1], "sync");
    expect(snap?.id).toMatch(/^sync-\d+$/);
  });

  it("writes an empty checkpoint when force is set with an explicit id", async () => {
    const snap = await createCheckpointForNotes(new Set(["Deck"]), [], "import", {
      id: "forced-empty",
      force: true,
    });
    expect(snap).not.toBeNull();
    expect(snap?.noteIds).toEqual([]);
    expect(await loadCheckpoint("forced-empty")).toMatchObject({ id: "forced-empty", noteIds: [] });
  });

  it("still skips empty checkpoints for auto-generated ids", async () => {
    const snap = await createCheckpointForNotes(new Set(["Deck"]), [], "sync");
    expect(snap).toBeNull();
    expect(await readdir(checkpointDir()).catch(() => [])).toHaveLength(0);
  });
});

describe("checkpoint shape validation", () => {
  it("rejects a corrupt JSON file with a stable error instead of noteIds undefined", async () => {
    await mkdir(checkpointDir(), { recursive: true });
    await writeFile(
      path.join(checkpointDir(), "broken.json"),
      '{"id": "broken", "deck": "D"}',
      "utf8",
    );
    await expect(loadCheckpoint("broken")).rejects.toThrow(/corrupt/);
  });

  it("rejects invalid JSON", async () => {
    await mkdir(checkpointDir(), { recursive: true });
    await writeFile(path.join(checkpointDir(), "bad.json"), "{nope", "utf8");
    await expect(loadCheckpoint("bad")).rejects.toThrow(/invalid JSON/);
  });

  it("still throws Checkpoint not found for missing files", async () => {
    await expect(loadCheckpoint("nope")).rejects.toThrow("Checkpoint not found: nope");
  });
});

describe("checkpoint id -> filename mapping", () => {
  it("maps distinct ids to distinct files", async () => {
    await createCheckpoint({ id: "import-1/2", deck: "D", noteIds: [1] });
    await createCheckpoint({ id: "import-1_2", deck: "D", noteIds: [2] });
    const files = await readdir(checkpointDir());
    expect(files).toHaveLength(2);
    const snap1 = await loadCheckpoint("import-1/2");
    const snap2 = await loadCheckpoint("import-1_2");
    expect(snap1.noteIds).toEqual([1]);
    expect(snap2.noteIds).toEqual([2]);
  });

  it("loads legacy checkpoints written with the unescaped filename", async () => {
    await mkdir(checkpointDir(), { recursive: true });
    await writeFile(
      path.join(checkpointDir(), "my_import.json"),
      JSON.stringify({ id: "my_import", deck: "D", created: "2026-01-01", noteIds: [1, 2] }),
      "utf8",
    );
    const snap = await loadCheckpoint("my_import");
    expect(snap).toMatchObject({ id: "my_import", noteIds: [1, 2] });
  });

  it("roundtrips ids with underscores through the escaped write mapping", async () => {
    await createCheckpoint({ id: "my_import", deck: "D", noteIds: [3] });
    const files = await readdir(checkpointDir());
    expect(files).toEqual(["my_5fimport.json"]);
    expect((await loadCheckpoint("my_import")).noteIds).toEqual([3]);
  });
});
