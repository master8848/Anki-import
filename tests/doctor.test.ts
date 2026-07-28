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
        ["getAddons", { "1610307553": true }],
      ]),
    );
    const result = await runDoctor({ fetchImpl });
    expect(result.ok).toBe(true);
    expect(result.checks.every((c) => c.ok)).toBe(true);
    expect(result.checks.length).toBe(6);
    expect(result.checks.every((c) => c.ok)).toBe(true);
    expect(result.checks.length).toBe(6);
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

  test("flags MathJax as missing when the add-on is not installed", async () => {
    const fetchImpl = makeFetch(
      new Map<string, unknown>([
        ["version", 6],
        ["deckNames", ["Default"]],
        ["modelNames", ["Basic"]],
        ["getAddons", { "1111111111": true }],
      ]),
    );
    const result = await runDoctor({ fetchImpl });
    expect(result.ok).toBe(false);
    const mathjax = result.checks.find(
      (c) => c.name === "mathjax-addon-installed",
    );
    expect(mathjax?.ok).toBe(false);
    expect(mathjax?.detail).toContain("not installed");
    expect(mathjax?.detail).toContain("addon install 1610307553");
  });

  test("flags MathJax as installed-but-disabled", async () => {
    const fetchImpl = makeFetch(
      new Map<string, unknown>([
        ["version", 6],
        ["deckNames", ["Default"]],
        ["modelNames", ["Basic"]],
        ["getAddons", { "1610307553": false }],
      ]),
    );
    const result = await runDoctor({ fetchImpl });
    expect(result.ok).toBe(false);
    const mathjax = result.checks.find(
      (c) => c.name === "mathjax-addon-installed",
    );
    expect(mathjax?.ok).toBe(false);
    expect(mathjax?.detail).toContain("disabled");
  });

  test("passes MathJax when the add-on is enabled", async () => {
    const fetchImpl = makeFetch(
      new Map<string, unknown>([
        ["version", 6],
        ["deckNames", ["Default"]],
        ["modelNames", ["Basic"]],
        ["getAddons", { "1610307553": true }],
      ]),
    );
    const result = await runDoctor({ fetchImpl });
    expect(result.ok).toBe(true);
    const mathjax = result.checks.find(
      (c) => c.name === "mathjax-addon-installed",
    );
    expect(mathjax?.ok).toBe(true);
    expect(mathjax?.detail).toContain("installed and enabled");
  });

  test("flags addons-queryable when AnkiConnect does not support getAddons", async () => {
    const fetchImpl = makeFetch(
      new Map<string, unknown>([
        ["version", 6],
        ["deckNames", ["Default"]],
        ["modelNames", ["Basic"]],
      ]),
    );
    // No 'getAddons' entry -> mock returns null and the client throws.
    const result = await runDoctor({ fetchImpl });
    expect(result.ok).toBe(false);
    const addons = result.checks.find((c) => c.name === "addons-queryable");
    expect(addons?.ok).toBe(false);
    expect(addons?.detail).toContain("older build");
    // The MathJax check is skipped when add-ons cannot be queried.
    expect(
      result.checks.some((c) => c.name === "mathjax-addon-installed"),
    ).toBe(false);
  });
});