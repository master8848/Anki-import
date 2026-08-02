import { describe, expect, it } from "vitest";
import { buildPlan, toAnkiConnectNote } from "@anki-xml/planner";
import type { ValidatedNote } from "@anki-xml/utils";

function jsonResponse(result: unknown, error: string | null = null) {
  return {
    ok: true,
    json: async () => ({ result, error }),
  } as unknown as Response;
}

function makeClient(handler: (action: string, params: Record<string, unknown>) => Promise<unknown>) {
  return new AnkiClientMock(handler);
}

class AnkiClientMock {
  constructor(private readonly handler: (action: string, params: Record<string, unknown>) => Promise<unknown>) {}

  fetchImpl: typeof fetch = async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { action: string; params: Record<string, unknown> };
    return jsonResponse(await this.handler(body.action, body.params ?? {}));
  };
}

function collectionInfo(id: number, tags: string[], fields?: Record<string, string>) {
  return {
    noteId: id,
    modelName: "Basic",
    tags,
    deckName: "Deck",
    fields: {
      Front: { value: fields?.["Front"] ?? "front", order: 0 },
      Back: { value: fields?.["Back"] ?? "back", order: 1 },
    },
    cards: [id],
  };
}

function note(partial: Partial<ValidatedNote> & { number: number }): ValidatedNote {
  return {
    deckName: "Deck",
    modelName: "Basic",
    fields: { Front: "front", Back: "back" },
    tags: ["tag2", "tag1"],
    ...partial,
  };
}

describe("toAnkiConnectNote", () => {
  it("converts a validated note to an AnkiConnect payload", () => {
    const n = note({ number: 1, id: 5 });
    expect(toAnkiConnectNote(n)).toEqual({
      deckName: "Deck",
      modelName: "Basic",
      fields: { Front: "front", Back: "back" },
      tags: ["tag2", "tag1"],
      options: { allowDuplicate: false },
    });
  });

  it("forwards allowDuplicate", () => {
    const n = note({ number: 1 });
    expect(toAnkiConnectNote(n, true).options.allowDuplicate).toBe(true);
  });
});

describe("buildPlan", () => {
  it("classifies unchanged, update, missing, add, and duplicate notes", async () => {
    const handler = async (action: string, params: Record<string, unknown>) => {
      if (action === "notesInfo") {
        expect(params["notes"]).toEqual([11, 12, 13]);
        return [
          {
            noteId: 11,
            modelName: "Basic",
            tags: ["tag1", "tag2"],
            deckName: "Deck",
            fields: {
              Front: { value: "front", order: 0 },
              Back: { value: "back", order: 1 },
            },
            cards: [1],
          },
          {
            noteId: 12,
            modelName: "Basic",
            tags: ["tag1", "tag2"],
            deckName: "Deck",
            fields: {
              Front: { value: "old front", order: 0 },
              Back: { value: "back", order: 1 },
            },
            cards: [2],
          },
          null,
        ];
      }
      if (action === "canAddNotes") {
        expect(params["notes"]).toHaveLength(2);
        return [true, false];
      }
      throw new Error(`unexpected action: ${action}`);
    };
    const client = makeClient(handler);

    const plan = await buildPlan(
      [
        note({ number: 1, id: 11 }),
        note({ number: 2, id: 12, fields: { Front: "new front", Back: "back" } }),
        note({ number: 3, id: 13, fields: { Front: "missing" } }),
        note({ number: 4 }),
        note({ number: 5, fields: { Front: "dup" } }),
      ],
      { url: "http://127.0.0.1:8765", fetchImpl: client.fetchImpl },
    );

    expect(plan.unchanged).toBe(1);
    expect(plan.add).toHaveLength(2);
    expect(plan.add[0]!.number).toBe(4);
    expect(plan.add[1]).toMatchObject({ number: 3, id: undefined });
    expect(plan.update).toHaveLength(1);
    expect(plan.update[0]).toMatchObject({ id: 12, changedFields: ["Front"] });
    expect(plan.duplicates.map((d) => d.number)).toEqual([5]);
    expect(plan.remove).toEqual([]);
  });

  it("returns empty plan for no notes", async () => {
    const client = makeClient(async () => {
      throw new Error("should not be called");
    });
    const plan = await buildPlan([], { url: "http://127.0.0.1:8765", fetchImpl: client.fetchImpl });
    expect(plan).toEqual({ add: [], update: [], remove: [], duplicates: [], unchanged: 0 });
  });

  it("respects batchSize for notesInfo chunks", async () => {
    const seen: number[][] = [];
    const handler = async (action: string, params: Record<string, unknown>) => {
      if (action === "notesInfo") {
        seen.push(params["notes"] as number[]);
        return (params["notes"] as number[]).map((id) => ({
          noteId: id,
          modelName: "Basic",
          tags: [],
          fields: { Front: { value: "front", order: 0 }, Back: { value: "back", order: 1 } },
          cards: [],
        }));
      }
      return [];
    };
    const client = makeClient(handler);
    const notes = Array.from({ length: 5 }, (_, i) => note({ number: i + 1, id: 100 + i }));
    await buildPlan(notes, { url: "http://127.0.0.1:8765", fetchImpl: client.fetchImpl, batchSize: 2 });
    expect(seen).toEqual([[100, 101], [102, 103], [104]]);
  });

  it("does not treat a tag diff as an edit when the source omitted tags", async () => {
    const handler = async (action: string) => {
      if (action === "notesInfo") return [collectionInfo(11, ["collection-tag"])];
      return [];
    };
    const client = makeClient(handler);

    // source note carries no tags attribute -> tagsSpecified undefined,
    // and its parsed (default) tags differ from the collection's
    const plan = await buildPlan([note({ number: 1, id: 11 })], {
      url: "http://127.0.0.1:8765",
      fetchImpl: client.fetchImpl,
    });

    expect(plan.unchanged).toBe(1);
    expect(plan.update).toHaveLength(0);
  });

  it("treats explicitly-specified tags as an edit when they differ", async () => {
    const handler = async (action: string) => {
      if (action === "notesInfo") return [collectionInfo(11, ["collection-tag"])];
      return [];
    };
    const client = makeClient(handler);

    const plan = await buildPlan(
      [note({ number: 1, id: 11, tags: ["source-tag"], tagsSpecified: true })],
      { url: "http://127.0.0.1:8765", fetchImpl: client.fetchImpl },
    );

    expect(plan.unchanged).toBe(0);
    expect(plan.update).toHaveLength(1);
    expect(plan.update[0]).toMatchObject({ id: 11 });
  });
});
