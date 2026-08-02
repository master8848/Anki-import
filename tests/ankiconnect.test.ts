import { describe, expect, it } from "vitest";
import { AnkiClient, AnkiConnectError } from "@anki-xml/anki";

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

  it("multi runs all actions in a single request and unwraps per-action envelopes", async () => {
    const { client, calls } = makeClient(async () => [
      { result: ["Default"], error: null },
      { result: null, error: null },
    ]);
    const res = await client.multi([
      { action: "deckNames" },
      { action: "updateNote", params: { note: { id: 1, fields: {}, tags: [] } } },
    ]);
    expect(res).toEqual([["Default"], null]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.action).toBe("multi");
    const actions = calls[0]!.params["actions"] as Array<Record<string, unknown>>;
    expect(actions).toHaveLength(2);
    expect(actions[0]).toEqual({ action: "deckNames", version: 6, params: {} });
    expect(actions[1]).toMatchObject({ action: "updateNote", version: 6 });
  });

  it("multi throws on a per-action error envelope", async () => {
    const { client } = makeClient(async () => [
      { result: null, error: "updateNote failed" },
    ]);
    await expect(client.multi([{ action: "updateNote", params: {} }])).rejects.toThrow(
      /AnkiConnect error: updateNote failed/,
    );
  });

  it("classifies malformed JSON bodies as bad-json without retrying", async () => {
    let fetches = 0;
    const client = new AnkiClient({
      url: "http://127.0.0.1:8765",
      retries: 3,
      backoffMs: 1,
      fetchImpl: async () => {
        fetches++;
        return { ok: true, json: async () => JSON.parse("not json") } as unknown as Response;
      },
    });
    try {
      await client.version();
      expect.unreachable();
    } catch (err) {
      const e = err as AnkiConnectError;
      expect(e.cause).toBe("bad-json");
      expect(e.hints?.length).toBeGreaterThan(0);
    }
    expect(fetches).toBe(1);
  });

  it("classifies null JSON envelopes as bad-json", async () => {
    const client = new AnkiClient({
      url: "http://127.0.0.1:8765",
      retries: 1,
      fetchImpl: async () => ({ ok: true, json: async () => null }) as unknown as Response,
    });
    try {
      await client.version();
      expect.unreachable();
    } catch (err) {
      expect((err as AnkiConnectError).cause).toBe("bad-json");
    }
  });

  it("treats HTTP errors as permanent (no retry) with cause http", async () => {
    let fetches = 0;
    const client = new AnkiClient({
      url: "http://127.0.0.1:8765",
      retries: 3,
      backoffMs: 1,
      fetchImpl: async () => {
        fetches++;
        return { ok: false, status: 500, statusText: "Internal Server Error" } as unknown as Response;
      },
    });
    try {
      await client.version();
      expect.unreachable();
    } catch (err) {
      const e = err as AnkiConnectError;
      expect(e.cause).toBe("http");
      expect(e.hints?.length).toBeGreaterThan(0);
    }
    expect(fetches).toBe(1);
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
