import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCheckpoint } from "@anki-xml/checkpoint";
import { applyPlan, driftFromCheckpoint } from "@anki-xml/sync";
import type { ImportPlan } from "@anki-xml/planner";
import type { ValidatedNote } from "@anki-xml/utils";

const originalXdg = process.env.XDG_DATA_HOME;
let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(tmpdir(), "anki-xml-sync-"));
  process.env.XDG_DATA_HOME = tmpDir;
});

afterEach(async () => {
  if (originalXdg === undefined) delete process.env.XDG_DATA_HOME;
  else process.env.XDG_DATA_HOME = originalXdg;
  await rm(tmpDir, { recursive: true, force: true });
});

function jsonResponse(result: unknown, error: string | null = null) {
  return {
    ok: true,
    json: async () => ({ result, error }),
  } as unknown as Response;
}

function makeClient(handler: (action: string, params: Record<string, unknown>) => Promise<unknown>) {
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { action: string; params: Record<string, unknown> };
    calls.push(body.action);
    return jsonResponse(await handler(body.action, body.params ?? {}));
  };
  return { fetchImpl, calls };
}

function note(partial: Partial<ValidatedNote> & { number: number }): ValidatedNote {
  return {
    deckName: "Deck",
    modelName: "Basic",
    fields: { Front: "front", Back: "back" },
    tags: ["t"],
    ...partial,
  };
}

function plan(partial: Partial<ImportPlan> = {}): ImportPlan {
  return {
    add: [note({ number: 1 }), note({ number: 2 })],
    update: [{ id: 50, note: note({ number: 3, id: 50 }), changedFields: ["Front"] }],
    remove: [],
    duplicates: [],
    unchanged: 0,
    ...partial,
  };
}

describe("applyPlan", () => {
  it("creates decks, adds notes, updates fields, and writes a checkpoint", async () => {
    const handler = async (action: string, params: Record<string, unknown>) => {
      if (action === "createDeck") return 1;
      if (action === "addNotes") {
        expect(params["notes"]).toHaveLength(2);
        return [1, null];
      }
      if (action === "updateNoteFields") {
        expect(params["note"]).toEqual({ id: 50, fields: { Front: "front", Back: "back" }, tags: ["t"] });
        return null;
      }
      throw new Error(`unexpected action: ${action}`);
    };
    const { fetchImpl, calls } = makeClient(handler);

    const result = await applyPlan(plan(), { url: "http://127.0.0.1:8765", fetchImpl });

    expect(result.created).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.failed).toEqual([{ noteNumber: 2, reason: "AnkiConnect returned null id" }]);
    expect(calls).toEqual(["createDeck", "addNotes", "updateNoteFields"]);

    expect(result.checkpointId).toMatch(/^sync-\d+$/);
    const dir = path.join(tmpDir, "anki-import", "checkpoints");
    const files = await readdir(dir);
    expect(files).toHaveLength(1);
    const snap = JSON.parse(await readFile(path.join(dir, files[0]!), "utf8"));
    expect(snap).toMatchObject({ id: result.checkpointId, deck: "Deck", noteIds: [1] });
  });

  it("honors autoCreateDeck=false and a fixed checkpointId", async () => {
    const handler = async (action: string) => {
      if (action === "addNotes") return [1, 2];
      if (action === "updateNoteFields") return null;
      throw new Error(`unexpected action: ${action}`);
    };
    const { fetchImpl, calls } = makeClient(handler);

    const result = await applyPlan(plan(), {
      url: "http://127.0.0.1:8765",
      fetchImpl,
      autoCreateDeck: false,
      checkpointId: "fixed-id",
    });

    expect(calls).not.toContain("createDeck");
    expect(result.checkpointId).toBe("fixed-id");
    expect(result.created).toBe(2);
  });
});

describe("driftFromCheckpoint", () => {
  it("reports existence for each recorded note id", async () => {
    await createCheckpoint({ id: "drift-check", deck: "Deck", noteIds: [101, 202] });
    const handler = async (action: string, params: Record<string, unknown>) => {
      if (action === "notesInfo") {
        expect(params["notes"]).toEqual([101, 202]);
        return [
          { noteId: 101, modelName: "Basic", tags: [], fields: { Front: { value: "x", order: 0 } }, cards: [] },
          null,
        ];
      }
      throw new Error(`unexpected action: ${action}`);
    };
    const { fetchImpl } = makeClient(handler);

    const entries = await driftFromCheckpoint("drift-check", {
      url: "http://127.0.0.1:8765",
      fetchImpl,
    });
    expect(entries).toEqual([
      { id: 101, exists: true },
      { id: 202, exists: false },
    ]);
  });

  it("throws when the checkpoint does not exist", async () => {
    await expect(driftFromCheckpoint("nope")).rejects.toThrow("Checkpoint not found: nope");
  });
});
