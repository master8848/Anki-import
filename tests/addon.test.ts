/**
 * Tests for the `addon` command and AnkiConnect add-on helpers.
 */

import { describe, expect, test } from "bun:test";
import { AnkiConnectClient } from "../src/anki-connect.ts";
import { MATHJAX_ADDON_CODE, runDoctor } from "../src/doctor.ts";

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

describe("AnkiConnectClient add-on helpers", () => {
  test("getAddons returns the parsed add-on map", async () => {
    const fetchImpl = makeFetch(
      new Map<string, unknown>([
        ["getAddons", { "1610307553": true, "2055492159": true }],
      ]),
    );
    const client = new AnkiConnectClient({
      url: "http://x",
      fetchImpl,
    });
    const addons = await client.getAddons();
    expect(addons["1610307553"]).toBe(true);
    expect(addons["2055492159"]).toBe(true);
  });

  test("getAddons throws on a non-object response", async () => {
    const fetchImpl = makeFetch(new Map<string, unknown>([["getAddons", null]]));
    const client = new AnkiConnectClient({ url: "http://x", fetchImpl });
    await expect(client.getAddons()).rejects.toThrow(/getAddons/);
  });

  test("installAddon returns the installed code", async () => {
    const fetchImpl = makeFetch(
      new Map<string, unknown>([["installAddon", "1610307553"]]),
    );
    const client = new AnkiConnectClient({ url: "http://x", fetchImpl });
    expect(await client.installAddon("1610307553")).toBe("1610307553");
  });

  test("toggleAddon forwards the enable flag", async () => {
    const seen: Array<{ action: string; params: unknown }> = [];
    const fetchImpl: typeof fetch = (async (
      _url: string,
      init?: RequestInit,
    ) => {
      const body = JSON.parse(init?.body as string) as {
        action: string;
        params: unknown;
      };
      seen.push(body);
      return new Response(JSON.stringify({ result: null, error: null }), {
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    const client = new AnkiConnectClient({ url: "http://x", fetchImpl });
    await client.toggleAddon("1610307553", false);
    expect(seen[0]?.action).toBe("toggleAddon");
    expect(seen[0]?.params).toEqual({
      addonId: "1610307553",
      enable: false,
    });
  });
});

describe("doctor add-on integration", () => {
  test("MathJax add-on code is the documented AnkiWeb code", () => {
    expect(MATHJAX_ADDON_CODE).toBe("1610307553");
  });

  test("doctor surfaces a missing MathJax add-on with an actionable hint", async () => {
    const fetchImpl = makeFetch(
      new Map<string, unknown>([
        ["version", 6],
        ["deckNames", ["Default"]],
        ["modelNames", ["Basic"]],
        ["getAddons", {}],
      ]),
    );
    const result = await runDoctor({ fetchImpl });
    const mathjax = result.checks.find(
      (c) => c.name === "mathjax-addon-installed",
    );
    expect(mathjax?.ok).toBe(false);
    expect(mathjax?.detail).toContain("not installed");
    expect(mathjax?.detail).toContain("addon install 1610307553");
  });
});
