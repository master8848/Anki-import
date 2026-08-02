import { describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { main, parseNoteIds } from "@anki-xml/cli";
import {
  createCheckpoint,
  listCheckpoints,
  loadCheckpoint,
  checkpointDir,
} from "@anki-xml/checkpoint";
import { rollback } from "@anki-xml/rollback";

describe("cli", () => {
  it("prints version", async () => {
    const code = await main(["--version"]);
    expect(code).toBe(0);
  });

  it("prints help", async () => {
    const code = await main(["--help"]);
    expect(code).toBe(0);
  });

  it("validates an example file", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "anki-import-"));
    const file = path.join(dir, "cards.xml");
    await fs.writeFile(
      file,
      `<anki deck="Test"><note type="Basic"><front>a</front><back>b</back></note></anki>`,
    );
    const code = await main(["validate", file, "--quiet"]);
    expect(code).toBe(0);
  });

  it("fails validate on missing field", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "anki-import-"));
    const file = path.join(dir, "bad.xml");
    await fs.writeFile(
      file,
      `<anki deck="Test"><note type="Basic"><front>a</front></note></anki>`,
    );
    const code = await main(["validate", file, "--quiet"]);
    expect(code).toBe(1);
  });

  it("rejects unknown commands", async () => {
    const code = await main(["safe-import"]);
    expect(code).toBe(2);
  });
});

describe("parseNoteIds", () => {
  it("parses comma-separated positive ids and drops junk", () => {
    expect(parseNoteIds("1,2, 3")).toEqual([1, 2, 3]);
    expect(parseNoteIds("1,abc,-2,0,3.5,4")).toEqual([1, 3.5, 4]);
    expect(parseNoteIds("")).toEqual([]);
    expect(parseNoteIds(undefined)).toEqual([]);
  });
});

describe("checkpoint + rollback", () => {
  it("creates, lists, and dry-run rollbacks", async () => {
    const prev = process.env["XDG_DATA_HOME"];
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "anki-data-"));
    process.env["XDG_DATA_HOME"] = tmp;

    try {
      const snap = await createCheckpoint({
        id: "test-cp",
        deck: "Spanish",
        noteIds: [10, 20, 30],
      });
      expect(snap.noteIds).toEqual([10, 20, 30]);
      expect(snap.created).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      const listed = await listCheckpoints();
      expect(listed.some((c) => c.id === "test-cp")).toBe(true);

      const loaded = await loadCheckpoint("test-cp");
      expect(loaded.deck).toBe("Spanish");

      const dry = await rollback({
        checkpointId: "test-cp",
        dryRun: true,
        fetchImpl: async () => {
          throw new Error("should not call network in dry-run");
        },
      });
      expect(dry.deleted).toBe(3);
      expect(dry.dryRun).toBe(true);

      // still exists after dry-run
      await loadCheckpoint("test-cp");
      expect(checkpointDir()).toContain("anki-import");
    } finally {
      if (prev === undefined) delete process.env["XDG_DATA_HOME"];
      else process.env["XDG_DATA_HOME"] = prev;
    }
  });
});
