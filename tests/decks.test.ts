/**
 * Tests for the `decks` command.
 *
 * - parseDeckTree: hierarchy parsing
 * - renderDeckTree: human-readable output
 * - fetchDeckReport: mocked AnkiConnect
 */

import { describe, expect, test } from "bun:test";
import type { AnkiConnectResponse } from "../src/types.ts";
import { parseDeckTree, renderDeckTree, fetchDeckReport } from "../src/decks.ts";

describe("parseDeckTree", () => {
  test("returns empty array for empty input", () => {
    expect(parseDeckTree([])).toEqual([]);
  });

  test("treats a single name as one root node", () => {
    const tree = parseDeckTree(["Spanish"]);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.name).toBe("Spanish");
    expect(tree[0]!.fullName).toBe("Spanish");
    expect(tree[0]!.children).toEqual([]);
  });

  test("parses a Parent::Child::Grandchild hierarchy", () => {
    const tree = parseDeckTree(["Languages::Spanish::Vocab"]);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.name).toBe("Languages");
    expect(tree[0]!.fullName).toBe("Languages");
    expect(tree[0]!.children).toHaveLength(1);
    expect(tree[0]!.children[0]!.name).toBe("Spanish");
    expect(tree[0]!.children[0]!.fullName).toBe("Languages::Spanish");
    expect(tree[0]!.children[0]!.children[0]!.name).toBe("Vocab");
    expect(tree[0]!.children[0]!.children[0]!.fullName).toBe("Languages::Spanish::Vocab");
  });

  test("groups siblings under the same parent", () => {
    const tree = parseDeckTree([
      "Languages::Spanish",
      "Languages::French",
      "Languages::German",
    ]);
    expect(tree).toHaveLength(1);
    const langs = tree[0]!.children;
    expect(langs.map((c) => c.name)).toEqual(["Spanish", "French", "German"]);
  });

  test("preserves first-occurrence order across mixed hierarchy", () => {
    const tree = parseDeckTree([
      "Top::A",
      "Other",
      "Top::B",
    ]);
    expect(tree.map((n) => n.name)).toEqual(["Top", "Other"]);
    expect(tree[0]!.children.map((c) => c.name)).toEqual(["A", "B"]);
  });

  test("handles a deck whose name contains extra colons gracefully", () => {
    // Anki deck names can contain "::". We treat every "::" as a
    // hierarchy separator; a name with internal "::" expands into
    // nested nodes. This is the documented behavior.
    const tree = parseDeckTree(["A::B::C"]);
    expect(tree[0]!.name).toBe("A");
    expect(tree[0]!.children[0]!.name).toBe("B");
    expect(tree[0]!.children[0]!.children[0]!.name).toBe("C");
  });
});

describe("renderDeckTree", () => {
  test("renders single deck with card count", () => {
    const tree = parseDeckTree(["Spanish"]);
    tree[0]!.ownCards = 5;
    tree[0]!.totalCards = 5;
    const out = renderDeckTree(tree);
    expect(out).toContain("Spanish");
    expect(out).toContain("5 cards");
  });

  test("shows 'direct' count when a node has both own and descendant cards", () => {
    const tree = parseDeckTree(["Top::Child"]);
    tree[0]!.ownCards = 2;
    tree[0]!.children[0]!.ownCards = 3;
    tree[0]!.totalCards = 5; // computed bottom-up; we set manually here
    tree[0]!.children[0]!.totalCards = 3;
    const out = renderDeckTree(tree);
    expect(out).toContain("5 cards (2 direct)");
    expect(out).toContain("3 cards");
  });

  test("includes Anki deck id when present", () => {
    const tree = parseDeckTree(["Spanish"]);
    tree[0]!.ownCards = 0;
    tree[0]!.totalCards = 0;
    tree[0]!.deckId = 12345;
    const out = renderDeckTree(tree);
    expect(out).toContain("[#12345]");
  });

  test("indents children two spaces per level", () => {
    const tree = parseDeckTree(["A::B::C"]);
    tree[0]!.ownCards = 0;
    tree[0]!.totalCards = 0;
    tree[0]!.children[0]!.ownCards = 0;
    tree[0]!.children[0]!.totalCards = 0;
    tree[0]!.children[0]!.children[0]!.ownCards = 0;
    tree[0]!.children[0]!.children[0]!.totalCards = 0;
    const out = renderDeckTree(tree);
    const lines = out.split("\n");
    // Each line shows the full hierarchical name. Indentation is 2
    // spaces per nesting level.
    expect(lines[0]!.startsWith("A")).toBe(true);
    expect(lines[0]!.startsWith("  ")).toBe(false);
    expect(lines[1]!.startsWith("  A::B")).toBe(true);
    expect(lines[2]!.startsWith("    A::B::C")).toBe(true);
  });
});

describe("fetchDeckReport", () => {
  function makeMockFetch(
    deckNames: string[],
    deckNamesAndIds: Record<string, number>,
    cardCounts: Record<string, number>,
  ): typeof fetch {
    return (async (_input, init) => {
      const body = JSON.parse((init as RequestInit).body as string);
      const env: AnkiConnectResponse<unknown> = { result: null, error: null };
      if (body.action === "deckNames") {
        env.result = deckNames;
      } else if (body.action === "deckNamesAndIds") {
        env.result = deckNamesAndIds;
      } else if (body.action === "findCards") {
        // We send `findCards("\"deck:Name\"")` so the deck name is
        // embedded in the query string.
        const m = /"deck:([^"]+)"/.exec(body.params.query);
        const key = m ? m[1] : "";
        env.result = new Array(cardCounts[key] ?? 0).fill(0).map((_, i) => i);
      }
      return new Response(JSON.stringify(env), { status: 200 });
    }) as unknown as typeof fetch;
  }

  test("reports one entry per deck with own and total counts", async () => {
    const fetch = makeMockFetch(
      ["Top::A", "Top::B"],
      { "Top::A": 1, "Top::B": 2, Top: 3 },
      { "Top::A": 5, "Top::B": 7, Top: 0 },
    );
    const report = await fetchDeckReport({ ankiConnectUrl: "http://x", fetchImpl: fetch });
    expect(report.flat).toHaveLength(3);
    const byName = Object.fromEntries(report.flat.map((d) => [d.name, d]));
    expect(byName["Top::A"]!.ownCards).toBe(5);
    expect(byName["Top::B"]!.ownCards).toBe(7);
    expect(byName["Top"]!.ownCards).toBe(0);
    expect(byName["Top"]!.totalCards).toBe(12);
  });

  test("tree reflects hierarchy order", async () => {
    const fetch = makeMockFetch(
      ["A", "A::B", "A::C"],
      { A: 1, "A::B": 2, "A::C": 3 },
      {},
    );
    const report = await fetchDeckReport({ ankiConnectUrl: "http://x", fetchImpl: fetch });
    expect(report.tree).toHaveLength(1);
    expect(report.tree[0]!.name).toBe("A");
    expect(report.tree[0]!.children.map((c) => c.name)).toEqual(["B", "C"]);
  });

  test("handles empty collection", async () => {
    const fetch = makeMockFetch([], {}, {});
    const report = await fetchDeckReport({ ankiConnectUrl: "http://x", fetchImpl: fetch });
    expect(report.tree).toEqual([]);
    expect(report.flat).toEqual([]);
  });
});
