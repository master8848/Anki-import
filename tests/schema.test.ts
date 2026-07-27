/**
 * Tests for the schema discovery commands (M1).
 */

import { describe, expect, test } from "bun:test";
import { AnkiConnectClient } from "../src/anki-connect.ts";
import { fetchFields, fetchModelInfo, fetchNoteInfo, fetchTagInfo } from "../src/schema.ts";

function mockClient(handler: (action: string, params: unknown) => unknown) {
  const fetchImpl: typeof fetch = (async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(init?.body as string) as { action: string; params?: unknown };
    const result = handler(body.action, body.params);
    return new Response(JSON.stringify({ result, error: null }), {
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { fetchImpl };
}

describe("fetchModelInfo", () => {
  test("returns one ModelInfo per registered model with fields and templates", async () => {
    const { fetchImpl } = mockClient((action, params) => {
      if (action === "modelNamesAndIds") {
        return [
          { name: "Basic", id: 1 },
          { name: "Cloze", id: 2 },
        ];
      }
      if (action === "modelFieldNames") {
        const p = params as { modelName: string };
        return p.modelName === "Basic" ? ["Front", "Back"] : ["Text", "Extra"];
      }
      if (action === "modelTemplates") {
        const p = params as { modelName: string };
        return p.modelName === "Basic"
          ? { Card1: { Name: "Card 1", Ord: 0 } }
          : { Cloze: { Name: "Cloze", Ord: 0 } };
      }
      return null;
    });
    const result = await fetchModelInfo({ fetchImpl });
    expect(result).toHaveLength(2);
    expect(result[0]?.name).toBe("Basic");
    expect(result[0]?.fields).toEqual(["Front", "Back"]);
    expect(result[0]?.templates[0]?.name).toBe("Card 1");
    expect(result[1]?.name).toBe("Cloze");
  });

  test("returns an empty array when the collection has no models", async () => {
    const { fetchImpl } = mockClient(() => []);
    const result = await fetchModelInfo({ fetchImpl });
    expect(result).toEqual([]);
  });
});

describe("fetchFields", () => {
  test("returns field names for a single model", async () => {
    const { fetchImpl } = mockClient((action, params) => {
      if (action === "modelFieldNames") {
        const p = params as { modelName: string };
        return p.modelName === "Basic" ? ["Front", "Back"] : [];
      }
      return null;
    });
    const result = await fetchFields("Basic", { fetchImpl });
    expect(result).toEqual(["Front", "Back"]);
  });

  test("returns [] for an unknown model", async () => {
    const { fetchImpl } = mockClient(() => []);
    const result = await fetchFields("Bogus", { fetchImpl });
    expect(result).toEqual([]);
  });
});

describe("fetchTagInfo", () => {
  test("returns each tag with its note count, sorted in client code", async () => {
    const { fetchImpl } = mockClient((action) => {
      if (action === "getTags") return ["spanish", "verbs", "review"];
      if (action === "findNotes") return [1, 2, 3];
      return null;
    });
    const result = await fetchTagInfo({ fetchImpl });
    expect(result).toHaveLength(3);
    expect(result.every((t) => t.count === 3)).toBe(true);
    expect(result.map((t) => t.name).sort()).toEqual(["review", "spanish", "verbs"]);
  });

  test("returns [] when no tags exist", async () => {
    const { fetchImpl } = mockClient(() => []);
    const result = await fetchTagInfo({ fetchImpl });
    expect(result).toEqual([]);
  });
});

describe("fetchNoteInfo", () => {
  test("returns full info for an existing note", async () => {
    const { fetchImpl } = mockClient((action) => {
      if (action === "notesInfo") {
        return [
          {
            noteId: 1234,
            guid: "abc",
            modelName: "Basic",
            deckName: "Spanish",
            fields: { Front: { value: "hola", order: 0 }, Back: { value: "hello", order: 1 } },
            tags: ["spanish", "greetings"],
            mod: 1700000000,
          },
        ];
      }
      if (action === "cardsOfNote") return [9001];
      return null;
    });
    const info = await fetchNoteInfo(1234, { fetchImpl });
    expect(info).not.toBeNull();
    expect(info!.noteId).toBe(1234);
    expect(info!.modelName).toBe("Basic");
    expect(info!.deckName).toBe("Spanish");
    expect(info!.fields["Front"]?.value).toBe("hola");
    expect(info!.tags).toEqual(["spanish", "greetings"]);
    expect(info!.cards).toEqual([9001]);
    expect(info!.mod).toBe(1700000000);
  });

  test("returns null when the note doesn't exist", async () => {
    const { fetchImpl } = mockClient(() => []);
    const info = await fetchNoteInfo(9999, { fetchImpl });
    expect(info).toBeNull();
  });
});

describe("M1 command shape", () => {
  test("AnkiConnectClient exposes the new schema methods", () => {
    expect(typeof AnkiConnectClient.prototype.modelNamesAndIds).toBe("function");
    expect(typeof AnkiConnectClient.prototype.modelFieldNames).toBe("function");
    expect(typeof AnkiConnectClient.prototype.modelTemplates).toBe("function");
    expect(typeof AnkiConnectClient.prototype.getTags).toBe("function");
  });
});