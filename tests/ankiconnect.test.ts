import { describe, expect, it } from "vitest";
import { AnkiClient } from "@anki-xml/anki";

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
      const body = JSON.parse(String(init?.body)) as { action: string; params: Record<string, unknown> };
      calls.push({ action: body.action, params: body.params ?? {} });
      return jsonResponse(await handler(body.action, body.params ?? {}));
    },
  });
  return { client, calls };
}

describe("AnkiClient", () => {
  it("canAddNotes forwards payloads", async () => {
    const { client, calls } = makeClient(async () => [true, false]);
    const res = await client.canAddNotes([
      { deckName: "D", modelName: "Basic", fields: { Front: "a" }, tags: [], options: { allowDuplicate: false } },
      { deckName: "D", modelName: "Basic", fields: { Front: "b" }, tags: [], options: { allowDuplicate: false } },
    ]);
    expect(res).toEqual([true, false]);
    expect(calls[0]!.action).toBe("canAddNotes");
    expect(calls[0]!.params["notes"]).toHaveLength(2);
  });

  it("updateNoteFields forwards id + fields", async () => {
    const { client, calls } = makeClient(async () => null);
    await client.updateNoteFields({ id: 42, fields: { Front: "x" } });
    expect(calls[0]!.action).toBe("updateNoteFields");
    expect(calls[0]!.params["note"]).toEqual({ id: 42, fields: { Front: "x" } });
  });

  it("storeMedia base64-encodes payload", async () => {
    const { client, calls } = makeClient(async () => "ok");
    await client.storeMedia("pic.png", Buffer.from("hello"));
    expect(calls[0]!.action).toBe("storeMedia");
    expect(calls[0]!.params["filename"]).toBe("pic.png");
    expect(calls[0]!.params["data"]).toBe("aGVsbG8=");
  });

  it("retrieveMedia decodes base64 result", async () => {
    const { client } = makeClient(async () => Buffer.from("world").toString("base64"));
    const buf = await client.retrieveMedia("a.txt");
    expect(buf.toString()).toBe("world");
  });

  it("addTags/removeTags join tags into a single string", async () => {
    const { client, calls } = makeClient(async () => null);
    await client.addTags([1, 2], ["a", "b"]);
    expect(calls[0]!.params).toEqual({ notes: [1, 2], tags: "a b" });
    await client.removeTags([1], ["a"]);
    expect(calls[1]!.action).toBe("removeTags");
  });

  it("cardCounts returns per-deck counts", async () => {
    const { client } = makeClient(async () => ({ D: { new: 1, learning: 0, review: 5, suspended: 0, buried: 0 } }));
    const res = await client.cardCounts(["D"]);
    expect(res["D"]?.review).toBe(5);
  });

  it("modelFieldNames returns fields", async () => {
    const { client } = makeClient(async () => ["Front", "Back"]);
    expect(await client.modelFieldNames("Basic")).toEqual(["Front", "Back"]);
  });

  it("propagates AnkiConnect envelope errors unchanged", async () => {
    const client = new AnkiClient({
      url: "http://127.0.0.1:8765",
      retries: 1,
      fetchImpl: async () => jsonResponse(null, "addNotes not available"),
    });
    await expect(client.version()).rejects.toThrow(/AnkiConnect error: addNotes not available/);
  });
});
