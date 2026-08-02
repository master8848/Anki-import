import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCheckpoint, loadCheckpoint } from "@anki-xml/checkpoint";
import { syncFile } from "@anki-xml/core";
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

/** AnkiConnect `multi` returns one envelope per action. */
function multiEnvelope(actions: Array<{ result: unknown; error?: string | null }>) {
  return actions.map((a) => ({ result: a.result, error: a.error ?? null }));
}

function makeClient(handler: (action: string, params: Record<string, unknown>) => Promise<unknown>) {
  const calls: { action: string; params: Record<string, unknown> }[] = [];
  const fetchImpl: typeof fetch = async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as {
      action: string;
      params: Record<string, unknown>;
    };
    calls.push({ action: body.action, params: body.params ?? {} });
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
  it("creates decks, adds notes, batch-updates fields, and writes a checkpoint", async () => {
    const handler = async (action: string, params: Record<string, unknown>) => {
      if (action === "createDeck") return 1;
      if (action === "addNotes") {
        expect(params["notes"]).toHaveLength(2);
        return [1, null];
      }
      if (action === "multi") {
        const actions = params["actions"] as Array<{ action: string; params: Record<string, unknown> }>;
        expect(actions).toHaveLength(1);
        expect(actions[0]).toEqual({
          action: "updateNote",
          version: 6,
          params: {
            // note has no tagsSpecified -> tags key omitted, so the
            // update cannot wipe collection-side tags
            note: { id: 50, fields: { Front: "front", Back: "back" } },
          },
        });
        return multiEnvelope([{ result: null }]);
      }
      throw new Error(`unexpected action: ${action}`);
    };
    const { fetchImpl, calls } = makeClient(handler);

    const result = await applyPlan(plan(), { url: "http://127.0.0.1:8765", fetchImpl });

    expect(result.created).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.failed).toEqual([{ noteNumber: 2, reason: "AnkiConnect returned null id" }]);
    expect(calls.map((c) => c.action)).toEqual(["createDeck", "addNotes", "multi"]);

    expect(result.checkpointId).toMatch(/^sync-\d+$/);
    const dir = path.join(tmpDir, "anki-import", "checkpoints");
    const files = await readdir(dir);
    expect(files).toHaveLength(1);
    const snap = JSON.parse(await readFile(path.join(dir, files[0]!), "utf8"));
    expect(snap).toMatchObject({ id: result.checkpointId, deck: "Deck", noteIds: [1] });
  });

  it("sends all updates in one multi request and clears tags when the source explicitly wrote tags=\"\"", async () => {
    const updates = [
      { id: 50, note: note({ number: 3, id: 50, tags: [], tagsSpecified: true }), changedFields: ["Front"] },
      { id: 51, note: note({ number: 4, id: 51, tags: [], tagsSpecified: true }), changedFields: ["Front"] },
    ];
    const handler = async (action: string, params: Record<string, unknown>) => {
      if (action === "createDeck") return 1;
      if (action === "addNotes") return [1, 2];
      if (action === "multi") {
        const actions = params["actions"] as Array<{ action: string; params: Record<string, unknown> }>;
        expect(actions).toHaveLength(2);
        for (const a of actions) {
          expect(a.action).toBe("updateNote");
          // explicit tags="" must still clear (empty array present)
          expect(a.params["note"]).toMatchObject({ tags: [] });
        }
        return multiEnvelope([{ result: null }, { result: null }]);
      }
      throw new Error(`unexpected action: ${action}`);
    };
    const { fetchImpl, calls } = makeClient(handler);

    const result = await applyPlan(plan({ update: updates }), {
      url: "http://127.0.0.1:8765",
      fetchImpl,
    });

    expect(result.updated).toBe(2);
    const multiCalls = calls.filter((c) => c.action === "multi");
    expect(multiCalls).toHaveLength(1);
  });

  it("omits the tags key when the source note did not specify tags (no wipe of Anki-side tags)", async () => {
    const updates = [
      { id: 50, note: note({ number: 3, id: 50 }), changedFields: ["Front"] },
      { id: 51, note: note({ number: 4, id: 51, tags: [], tagsSpecified: true }), changedFields: ["Front"] },
      { id: 52, note: note({ number: 5, id: 52, tags: ["x"], tagsSpecified: true }), changedFields: ["Front"] },
    ];
    const seenNotes: Record<string, unknown>[] = [];
    const handler = async (action: string, params: Record<string, unknown>) => {
      if (action === "createDeck") return 1;
      if (action === "addNotes") return [1, 2, 3];
      if (action === "multi") {
        const actions = params["actions"] as Array<{ action: string; params: Record<string, unknown> }>;
        for (const a of actions) {
          expect(a.action).toBe("updateNote");
          seenNotes.push(a.params["note"] as Record<string, unknown>);
        }
        return multiEnvelope([{ result: null }, { result: null }, { result: null }]);
      }
      throw new Error(`unexpected action: ${action}`);
    };
    const { fetchImpl } = makeClient(handler);

    const result = await applyPlan(
      plan({ update: updates, add: [note({ number: 1 })] }),
      { url: "http://127.0.0.1:8765", fetchImpl },
    );

    expect(result.updated).toBe(3);
    // no tags attribute -> no tags key at all (AnkiConnect leaves tags untouched)
    expect("tags" in (seenNotes[0] ?? {})).toBe(false);
    // explicit tags="" -> tags: []
    expect(seenNotes[1]).toMatchObject({ tags: [] });
    // explicit tags="x" -> tags: ["x"]
    expect(seenNotes[2]).toMatchObject({ tags: ["x"] });
  });

  it("chunks updates and treats missing addNotes results as failures", async () => {
    const updates = [
      { id: 50, note: note({ number: 3, id: 50 }), changedFields: ["Front"] },
      { id: 51, note: note({ number: 4, id: 51 }), changedFields: ["Front"] },
      { id: 52, note: note({ number: 5, id: 52 }), changedFields: ["Front"] },
    ];
    const handler = async (action: string, params: Record<string, unknown>) => {
      if (action === "createDeck") return 1;
      if (action === "addNotes") return [1]; // fewer results than sent
      if (action === "multi") {
        const actions = params["actions"] as unknown[];
        return multiEnvelope(actions.map(() => ({ result: null })));
      }
      throw new Error(`unexpected action: ${action}`);
    };
    const { fetchImpl, calls } = makeClient(handler);

    const result = await applyPlan(
      plan({ update: updates, add: [note({ number: 1 }), note({ number: 2 })] }),
      { url: "http://127.0.0.1:8765", fetchImpl, batchSize: 2 },
    );

    // 2 adds: only 1 result returned -> 1 created, 1 failed (not silently dropped)
    expect(result.created).toBe(1);
    expect(result.failed).toEqual([{ noteNumber: 2, reason: "AnkiConnect returned null id" }]);
    // 3 updates split into multi calls of 2 + 1
    const multiCalls = calls.filter((c) => c.action === "multi");
    expect(multiCalls).toHaveLength(2);
    expect((multiCalls[0]!.params["actions"] as unknown[])).toHaveLength(2);
    expect((multiCalls[1]!.params["actions"] as unknown[])).toHaveLength(1);
    expect(result.updated).toBe(3);
  });

  it("honors autoCreateDeck=false and a fixed checkpointId", async () => {
    const handler = async (action: string) => {
      if (action === "addNotes") return [1, 2];
      if (action === "multi") return multiEnvelope([{ result: null }]);
      throw new Error(`unexpected action: ${action}`);
    };
    const { fetchImpl, calls } = makeClient(handler);

    const result = await applyPlan(plan(), {
      url: "http://127.0.0.1:8765",
      fetchImpl,
      autoCreateDeck: false,
      checkpointId: "fixed-id",
    });

    expect(calls.map((c) => c.action)).not.toContain("createDeck");
    expect(result.checkpointId).toBe("fixed-id");
    expect(result.created).toBe(2);
  });

  it("writes an empty checkpoint when an explicit id is given but nothing was created", async () => {
    const { fetchImpl } = makeClient(async () => {
      throw new Error("no AnkiConnect calls expected");
    });

    const result = await applyPlan(
      plan({ add: [], update: [] }),
      { url: "http://127.0.0.1:8765", fetchImpl, checkpointId: "empty-sync" },
    );

    expect(result.checkpointId).toBe("empty-sync");
    expect(result.created).toBe(0);
    const snap = await loadCheckpoint("empty-sync");
    expect(snap.noteIds).toEqual([]);
  });

  it("skips the checkpoint entirely when nothing was created and no explicit id was given", async () => {
    const { fetchImpl } = makeClient(async () => {
      throw new Error("no AnkiConnect calls expected");
    });

    const result = await applyPlan(plan({ add: [], update: [] }), {
      url: "http://127.0.0.1:8765",
      fetchImpl,
    });

    expect(result.checkpointId).toBeUndefined();
    expect(await readdir(path.join(tmpDir, "anki-import", "checkpoints")).catch(() => [])).toHaveLength(0);
  });
});

describe("syncFile", () => {
  it("records an explicit checkpoint id even when the plan is empty (0 adds/updates)", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "anki-xml-syncfile-"));
    const file = path.join(dir, "dup.xml");
    await writeFile(
      file,
      `<anki deck="D"><note type="Basic"><front>a</front><back>b</back></note></anki>`,
      "utf8",
    );
    const { fetchImpl } = makeClient(async (action) => {
      if (action === "canAddNotes") return [false]; // duplicate -> empty plan
      if (action === "notesInfo") return [];
      throw new Error(`unexpected action: ${action}`);
    });

    const result = await syncFile(file, {
      url: "http://127.0.0.1:8765",
      fetchImpl,
      checkpointId: "empty-syncfile",
    });

    expect(result.applied.checkpointId).toBe("empty-syncfile");
    expect(result.applied.created).toBe(0);
    const snap = await loadCheckpoint("empty-syncfile");
    expect(snap.noteIds).toEqual([]);
    await rm(dir, { recursive: true, force: true });
  });

  it("skips the checkpoint when the plan is empty and no id was given", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "anki-xml-syncfile-"));
    const file = path.join(dir, "dup.xml");
    await writeFile(
      file,
      `<anki deck="D"><note type="Basic"><front>a</front><back>b</back></note></anki>`,
      "utf8",
    );
    const { fetchImpl } = makeClient(async (action) => {
      if (action === "canAddNotes") return [false];
      if (action === "notesInfo") return [];
      throw new Error(`unexpected action: ${action}`);
    });

    const result = await syncFile(file, { url: "http://127.0.0.1:8765", fetchImpl });

    expect(result.applied.checkpointId).toBeUndefined();
    expect(
      await readdir(path.join(tmpDir, "anki-import", "checkpoints")).catch(() => []),
    ).toHaveLength(0);
    await rm(dir, { recursive: true, force: true });
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
