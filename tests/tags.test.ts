import { describe, expect, it } from "vitest";
import { AnkiClient } from "@anki-xml/anki";
import { addTags, listTags, parseTagList, removeTags } from "@anki-xml/tags";

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

describe("parseTagList", () => {
  it("splits on whitespace, trims, and drops empties", () => {
    expect(parseTagList("  aaa   bbb\tccc\n ddd ")).toEqual(["aaa", "bbb", "ccc", "ddd"]);
    expect(parseTagList("   ")).toEqual([]);
    expect(parseTagList("")).toEqual([]);
    expect(parseTagList("one,two")).toEqual(["one,two"]);
  });
});

describe("listTags", () => {
  it("returns sorted tags from getTags", async () => {
    const { client, calls } = makeClient(async () => ["zebra", "apple", "Mango"]);
    const tags = await listTags(client);
    expect(tags).toEqual(["Mango", "apple", "zebra"]);
    expect(calls[0]!.action).toBe("getTags");
    expect(calls[0]!.params).toEqual({});
  });
});

describe("addTags", () => {
  it("adds tags with notes array and joined tags string", async () => {
    const { client, calls } = makeClient(async () => null);
    await addTags(client, [1, 2, 3], ["alpha", "beta"]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.action).toBe("addTags");
    expect(calls[0]!.params).toEqual({ notes: [1, 2, 3], tags: "alpha beta" });
  });

  it("chunks note ids larger than 500 into multiple requests", async () => {
    const { client, calls } = makeClient(async () => null);
    const ids = Array.from({ length: 1200 }, (_, i) => i + 1);
    await addTags(client, ids, ["tag"]);
    expect(calls).toHaveLength(3);
    expect((calls[0]!.params["notes"] as number[]).length).toBe(500);
    expect((calls[1]!.params["notes"] as number[]).length).toBe(500);
    expect((calls[2]!.params["notes"] as number[]).length).toBe(200);
    for (const call of calls) {
      expect(call.action).toBe("addTags");
      expect(call.params["tags"]).toBe("tag");
    }
    expect(calls[2]!.params["notes"]).toEqual(Array.from({ length: 200 }, (_, i) => i + 1001));
  });

  it("makes no requests for empty note ids", async () => {
    const { client, calls } = makeClient(async () => null);
    await addTags(client, [], ["tag"]);
    expect(calls).toHaveLength(0);
  });
});

describe("removeTags", () => {
  it("removes tags with the same chunking behaviour", async () => {
    const { client, calls } = makeClient(async () => null);
    const ids = Array.from({ length: 600 }, (_, i) => i + 1);
    await removeTags(client, ids, ["old"]);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.action).toBe("removeTags");
    expect(calls[0]!.params).toEqual({ notes: ids.slice(0, 500), tags: "old" });
    expect(calls[1]!.params).toEqual({ notes: ids.slice(500), tags: "old" });
  });
});
