/**
 * Tests for the AnkiConnect HTTP client.
 *
 * Every test uses an injected `fetch` implementation so we never hit
 * the network. The mocks cover:
 *   - version handshake
 *   - successful addNotes with all-new ids
 *   - partial failures (some ids are null)
 *   - envelope-level error
 *   - HTTP error
 *   - network failure
 *   - invalid JSON
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { AnkiConnectClient, AnkiConnectError } from "../src/anki-connect.ts";
import type { AnkiConnectNote, AnkiConnectResponse } from "../src/types.ts";

interface MockOptions {
  status?: number;
  envelope?: AnkiConnectResponse<unknown>;
  body?: string;
  throwOnFetch?: Error;
}

function makeFetch(opts: MockOptions): typeof fetch {
  const fn = async (): Promise<Response> => {
    if (opts.throwOnFetch) throw opts.throwOnFetch;
    if (opts.body !== undefined) {
      return new Response(opts.body, { status: opts.status ?? 200 });
    }
    return new Response(JSON.stringify(opts.envelope ?? { result: null, error: null }), {
      status: opts.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  return fn as unknown as typeof fetch;
}

function note(overrides: Partial<AnkiConnectNote> = {}): AnkiConnectNote {
  return {
    deckName: "Default",
    modelName: "Basic",
    fields: { Front: "Q", Back: "A" },
    tags: [],
    options: { allowDuplicate: false },
    ...overrides,
  };
}

let client: AnkiConnectClient;

beforeEach(() => {
  client = new AnkiConnectClient({ url: "http://127.0.0.1:8765" });
});

// ─── version ──────────────────────────────────────────────────────────────

describe("AnkiConnectClient.version", () => {
  test("returns the version number", async () => {
    const c = new AnkiConnectClient({ url: "http://x", fetchImpl: makeFetch({ envelope: { result: 6, error: null } }) });
    expect(await c.version()).toBe(6);
  });

  test("strips trailing slash from URL", async () => {
    let captured = "";
    const c = new AnkiConnectClient({
      url: "http://x:8765///",
      fetchImpl: makeFetch({ envelope: { result: 6, error: null } }),
    });
    const realFetch: typeof fetch = async (input) => {
      captured = String(input);
      return new Response(JSON.stringify({ result: 6, error: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const c2 = new AnkiConnectClient({ url: "http://x:8765///", fetchImpl: realFetch });
    await c2.version();
    expect(captured).toBe("http://x:8765/");
    void captured;
    void c;
  });

  test("throws on envelope error", async () => {
    const c = new AnkiConnectClient({
      url: "http://x",
      fetchImpl: makeFetch({ envelope: { result: null, error: "api key required" } }),
    });
    await expect(c.version()).rejects.toThrow(/api key required/);
  });

  test("throws on non-numeric version", async () => {
    const c = new AnkiConnectClient({
      url: "http://x",
      fetchImpl: makeFetch({ envelope: { result: "six", error: null } }),
    });
    await expect(c.version()).rejects.toThrow(/Unexpected/);
  });

  test("throws on HTTP error", async () => {
    const c = new AnkiConnectClient({
      url: "http://x",
      fetchImpl: makeFetch({ status: 500, body: "boom" }),
    });
    await expect(c.version()).rejects.toThrow(/HTTP 500/);
  });

  test("throws on network failure", async () => {
    const c = new AnkiConnectClient({
      url: "http://x",
      fetchImpl: makeFetch({ throwOnFetch: new Error("ECONNREFUSED") }),
    });
    await expect(c.version()).rejects.toThrow(/Failed to reach/);
  });

  test("throws on invalid JSON", async () => {
    const c = new AnkiConnectClient({
      url: "http://x",
      fetchImpl: makeFetch({ body: "<<<not json>>>" }),
    });
    await expect(c.version()).rejects.toThrow(/Invalid JSON/);
  });
});

// ─── addNotes ─────────────────────────────────────────────────────────────

describe("AnkiConnectClient.addNotes", () => {
  test("returns empty array when given no notes", async () => {
    const c = new AnkiConnectClient({
      url: "http://x",
      fetchImpl: makeFetch({ envelope: { result: [], error: null } }),
    });
    expect(await c.addNotes([])).toEqual([]);
  });

  test("returns ids array on full success", async () => {
    const c = new AnkiConnectClient({
      url: "http://x",
      fetchImpl: makeFetch({ envelope: { result: [1001, 1002, 1003], error: null } }),
    });
    const ids = await c.addNotes([note(), note(), note()]);
    expect(ids).toEqual([1001, 1002, 1003]);
  });

  test("returns null entries for per-note failures", async () => {
    const c = new AnkiConnectClient({
      url: "http://x",
      fetchImpl: makeFetch({ envelope: { result: [1001, null, 1003], error: null } }),
    });
    const ids = await c.addNotes([note(), note(), note()]);
    expect(ids).toEqual([1001, null, 1003]);
  });

  test("sends POST with JSON body containing action and notes", async () => {
    let captured: { url: string; method: string; body: string; contentType: string } | null = null;
    const realFetch: typeof fetch = async (input, init) => {
      captured = {
        url: String(input),
        method: (init as RequestInit).method as string,
        body: (init as RequestInit).body as string,
        contentType: ((init as RequestInit).headers as Record<string, string>)["Content-Type"] as string,
      };
      return new Response(JSON.stringify({ result: [42], error: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const c = new AnkiConnectClient({ url: "http://x:8765", fetchImpl: realFetch });
    await c.addNotes([note({ fields: { Front: "Q", Back: "A" } })]);
    expect(captured!.url).toBe("http://x:8765/");
    expect(captured!.method).toBe("POST");
    expect(captured!.contentType).toBe("application/json");
    const parsed = JSON.parse(captured!.body);
    expect(parsed.action).toBe("addNotes");
    expect(parsed.version).toBe(6);
    expect(parsed.params.notes).toHaveLength(1);
    expect(parsed.params.notes[0].fields.Front).toBe("Q");
  });

  test("throws on envelope error", async () => {
    const c = new AnkiConnectClient({
      url: "http://x",
      fetchImpl: makeFetch({ envelope: { result: null, error: "deck not found" } }),
    });
    await expect(c.addNotes([note()])).rejects.toThrow(/deck not found/);
  });

  test("throws on non-array result", async () => {
    const c = new AnkiConnectClient({
      url: "http://x",
      fetchImpl: makeFetch({ envelope: { result: "oops", error: null } }),
    });
    await expect(c.addNotes([note()])).rejects.toThrow(/Unexpected/);
  });
});

// ─── AnkiConnectError class ───────────────────────────────────────────────

describe("AnkiConnectError", () => {
  test("has correct name", () => {
    const e = new AnkiConnectError("boom");
    expect(e.name).toBe("AnkiConnectError");
    expect(e.message).toBe("boom");
    expect(e instanceof Error).toBe(true);
  });
});