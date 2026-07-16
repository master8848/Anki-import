/**
 * Tests for the `stats` command.
 *
 * - fetchStats: mocked AnkiConnect; verifies each is: filter is sent
 *   correctly, the counts add up, and deck filter prefixes the query.
 * - renderStats: text output format.
 */

import { describe, expect, test } from "bun:test";
import type { AnkiConnectResponse } from "../src/types.ts";
import { fetchStats, renderStats } from "../src/stats.ts";

function makeMockFetch(counts: {
  new?: number;
  learn?: number;
  review?: number;
  suspended?: number;
  buried?: number;
  notes?: number;
}): { fetch: typeof fetch; queries: string[] } {
  const queries: string[] = [];
  const fetch = (async (_input, init) => {
    const body = JSON.parse((init as RequestInit).body as string);
    queries.push(body.params.query);
    const env: AnkiConnectResponse<unknown> = { result: null, error: null };
    if (body.action === "findCards") {
      const q: string = body.params.query;
      const n = q.includes("is:new") ? (counts.new ?? 0)
        : q.includes("is:learn") ? (counts.learn ?? 0)
        : q.includes("is:review") ? (counts.review ?? 0)
        : q.includes("is:suspended") ? (counts.suspended ?? 0)
        : q.includes("is:buried") ? (counts.buried ?? 0)
        : 0;
      env.result = new Array(n).fill(0).map((_, i) => i);
    } else if (body.action === "findNotes") {
      env.result = new Array(counts.notes ?? 0).fill(0).map((_, i) => i);
    }
    return new Response(JSON.stringify(env), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetch, queries };
}

describe("fetchStats", () => {
  test("queries each is: filter and totals them", async () => {
    const { fetch, queries } = makeMockFetch({
      new: 10, learn: 3, review: 100, suspended: 2, buried: 1, notes: 80,
    });
    const stats = await fetchStats({ ankiConnectUrl: "http://x", fetchImpl: fetch });
    expect(stats.new).toBe(10);
    expect(stats.learn).toBe(3);
    expect(stats.review).toBe(100);
    expect(stats.suspended).toBe(2);
    expect(stats.buried).toBe(1);
    expect(stats.total).toBe(116);
    expect(stats.notes).toBe(80);
    expect(stats.completed).toBe(100);
    expect(stats.incomplete).toBe(13);
    // 5 findCards + 1 findNotes = 6 queries.
    expect(queries).toHaveLength(6);
    expect(queries.some((q) => q.includes("is:new"))).toBe(true);
    expect(queries.some((q) => q.includes("is:review"))).toBe(true);
    expect(queries.some((q) => q.includes("is:suspended"))).toBe(true);
  });

  test("completed == review and incomplete == new + learn", async () => {
    const { fetch } = makeMockFetch({ new: 4, learn: 1, review: 50 });
    const stats = await fetchStats({ ankiConnectUrl: "http://x", fetchImpl: fetch });
    expect(stats.completed).toBe(50);
    expect(stats.incomplete).toBe(5);
  });

  test("--deck prefixes the state filter with a quoted deck: clause", async () => {
    const { fetch, queries } = makeMockFetch({});
    await fetchStats({ ankiConnectUrl: "http://x", fetchImpl: fetch, deck: "Spanish" });
    // Every findCards query should contain the deck prefix.
    for (const q of queries) {
      if (q.length > 0) {
        // findNotes for the deck uses "deck:Spanish" as well.
        expect(q).toContain("deck:Spanish");
      }
    }
  });

  test("returns zeros for an empty collection", async () => {
    const { fetch } = makeMockFetch({});
    const stats = await fetchStats({ ankiConnectUrl: "http://x", fetchImpl: fetch });
    expect(stats).toEqual({
      new: 0, learn: 0, review: 0, suspended: 0, buried: 0,
      total: 0, completed: 0, incomplete: 0,
      notes: 0,
      deck: null,
    });
  });

  test("deck field is null when not provided", async () => {
    const { fetch } = makeMockFetch({});
    const stats = await fetchStats({ ankiConnectUrl: "http://x", fetchImpl: fetch });
    expect(stats.deck).toBeNull();
  });

  test("deck field echoes input", async () => {
    const { fetch } = makeMockFetch({});
    const stats = await fetchStats({
      ankiConnectUrl: "http://x", fetchImpl: fetch, deck: "Top::A",
    });
    expect(stats.deck).toBe("Top::A");
  });
});

describe("renderStats", () => {
  test("shows collection title and per-state counts", () => {
    const text = renderStats({
      new: 10, learn: 2, review: 100, suspended: 1, buried: 0,
      total: 113, completed: 100, incomplete: 12,
      notes: 80, deck: null,
    });
    expect(text).toContain("Collection");
    expect(text).toContain("Cards: 113");
    expect(text).toContain("review:    100");
    expect(text).toContain("Completed (review):    100");
    expect(text).toContain("Incomplete (new+learn): 12");
    expect(text).toContain("Notes: 80");
  });

  test("uses 'Deck: <name>' when filtered", () => {
    const text = renderStats({
      new: 0, learn: 0, review: 5, suspended: 0, buried: 0,
      total: 5, completed: 5, incomplete: 0,
      notes: 5, deck: "Spanish",
    });
    expect(text).toContain("Deck: Spanish");
    expect(text).not.toContain("Collection");
  });
});
