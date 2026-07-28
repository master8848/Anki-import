/**
 * Tests for doctor (M13).
 */

import { describe, expect, test } from "bun:test";
import { runDoctor } from "../src/doctor.ts";

function makeFetch(responses: Map<string, unknown>): typeof fetch {
  return (async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(init?.body as string) as { action: string };
    const result = responses.has(body.action)
      ? responses.get(body.action)
      : null;
    return new Response(JSON.stringify({ result, error: null }), {
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

describe("runDoctor", () => {
  test("returns ok=true on a healthy collection", async () => {
    const fetchImpl = makeFetch(
      new Map<string, unknown>([
        ["version", 6],
        ["deckNames", ["Default", "Spanish"]],
        ["modelNames", ["Basic", "Cloze"]],
      ]),
    );
    const result = await runDoctor({ fetchImpl });
    expect(result.ok).toBe(true);
    expect(result.checks.every((c) => c.ok)).toBe(true);
    expect(result.checks.length).toBe(4);
    expect(result.checks.every((c) => c.ok)).toBe(true);
    expect(result.checks.length).toBe(4);
  });

  test("flags an unreachable AnkiConnect", async () => {
    const fetchImpl: typeof fetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;
    const result = await runDoctor({ fetchImpl });
    expect(result.ok).toBe(false);
    const first = result.checks[0];
    expect(first?.name).toBe("anki-connect-reachable");
    expect(first?.ok).toBe(false);
  });

  test("flags an old AnkiConnect version", async () => {
    const fetchImpl = makeFetch(
      new Map<string, unknown>([
        ["version", 3],
        ["deckNames", ["Default"]],
        ["modelNames", ["Basic"]],
      ]),
    );
    const result = await runDoctor({ fetchImpl });
    expect(result.ok).toBe(false);
    expect(
      result.checks.some((c) => c.name === "anki-connect-version" && !c.ok),
    ).toBe(true);
  });

  test("flags an empty collection (no decks)", async () => {
    const fetchImpl = makeFetch(
      new Map<string, unknown>([
        ["version", 6],
        ["deckNames", []],
        ["modelNames", ["Basic"]],
      ]),
    );
    const result = await runDoctor({ fetchImpl });
    expect(result.ok).toBe(false);
    expect(
      result.checks.some((c) => c.name === "collection-has-decks" && !c.ok),
    ).toBe(true);
  });
});