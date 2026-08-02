import { describe, expect, it } from "vitest";
import { AnkiClient } from "@anki-xml/anki";
import { collectionStats, deckStats } from "@anki-xml/stats";

function jsonResponse(result: unknown, error: string | null = null) {
  return {
    ok: true,
    json: async () => ({ result, error }),
  } as unknown as Response;
}

function makeClient(handler: (action: string, params: Record<string, unknown>) => Promise<unknown>) {
  const calls: { action: string; params: Record<string, unknown> }[] = [];
  const client = new AnkiClient({
    url: "http://127.0.0.1:8765",
    retries: 1,
    fetchImpl: async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        action: string;
        params: Record<string, unknown>;
      };
      calls.push({ action: body.action, params: body.params ?? {} });
      return jsonResponse(await handler(body.action, body.params ?? {}));
    },
  });
  return { client, calls };
}

describe("deckStats", () => {
  it("queries a single deck when given", async () => {
    const { client, calls } = makeClient(async () => ({
      "German::Vocab": { new: 2, learning: 1, review: 10, suspended: 0, buried: 1 },
    }));
    const res = await deckStats(client, "German::Vocab");
    expect(res["German::Vocab"]).toEqual({ new: 2, learning: 1, review: 10, suspended: 0, buried: 1 });
    expect(calls[0]!.action).toBe("cardCounts");
    expect(calls[0]!.params).toEqual({ decks: ["German::Vocab"] });
  });

  it("queries all decks when none is given", async () => {
    const { client, calls } = makeClient(async (action) => {
      if (action === "deckNames") return ["A", "B"];
      return { A: { new: 1, learning: 0, review: 0, suspended: 0, buried: 0 } };
    });
    await deckStats(client);
    expect(calls[0]!.action).toBe("deckNames");
    expect(calls[1]!.action).toBe("cardCounts");
    expect(calls[1]!.params).toEqual({ decks: ["A", "B"] });
  });
});

describe("collectionStats", () => {
  it("computes totals from mocked deckNames/modelNames/findNotes/cardCounts", async () => {
    const { client, calls } = makeClient(async (action) => {
      switch (action) {
        case "deckNames":
          return ["A", "B"];
        case "modelNames":
          return ["Basic", "Cloze"];
        case "findNotes":
          return [1, 2, 3, 4, 5];
        case "cardCounts":
          return {
            A: { new: 5, learning: 2, review: 10, suspended: 1, buried: 0 },
            B: { new: 0, learning: 1, review: 3, suspended: 0, buried: 2 },
          };
        default:
          throw new Error(`unexpected action ${action}`);
      }
    });
    const stats = await collectionStats(client);
    expect(stats).toEqual({
      decks: 2,
      models: 2,
      notes: 5,
      cards: 5 + 2 + 10 + 1 + 0 + 0 + 1 + 3 + 0 + 2,
      perDeck: {
        A: { new: 5, learning: 2, review: 10, suspended: 1, buried: 0 },
        B: { new: 0, learning: 1, review: 3, suspended: 0, buried: 2 },
      },
    });
    expect(calls.map((c) => c.action)).toEqual([
      "deckNames",
      "cardCounts",
      "deckNames",
      "modelNames",
      "findNotes",
    ]);
  });

  it("handles an empty collection", async () => {
    const { client } = makeClient(async (action) => {
      switch (action) {
        case "deckNames":
          return [];
        case "modelNames":
          return [];
        case "findNotes":
          return [];
        case "cardCounts":
          return {};
        default:
          throw new Error(`unexpected action ${action}`);
      }
    });
    const stats = await collectionStats(client);
    expect(stats.cards).toBe(0);
    expect(stats.perDeck).toEqual({});
  });
});
