/**
 * Tests for the `search` command.
 *
 * - buildSearchQuery: query construction (phrase, deck, tag, limit)
 * - stripHtml: HTML removal and entity decoding
 * - makeSnippet: snippet truncation and match highlighting
 * - runSearch: mocked AnkiConnect
 * - renderSearch: human output
 */

import { describe, expect, test } from "bun:test";
import type { AnkiConnectResponse, AnkiConnectNoteInfo } from "../src/anki-connect.ts";
import { buildSearchQuery, stripHtml, makeSnippet, runSearch, renderSearch } from "../src/search.ts";

describe("buildSearchQuery", () => {
  test("wraps a phrase in double quotes", () => {
    expect(buildSearchQuery({ phrase: "serendipity" })).toBe('"serendipity"');
  });

  test("escapes embedded double quotes in the phrase", () => {
    expect(buildSearchQuery({ phrase: 'say "hi"' })).toBe('"say \\"hi\\""');
  });

  test("joins phrase + deck with a space", () => {
    expect(buildSearchQuery({ phrase: "hola", deck: "Spanish" })).toBe('"hola" "deck:Spanish"');
  });

  test("adds tag: for each tag", () => {
    expect(buildSearchQuery({ phrase: "hola", tags: ["greeting", "common"] })).toBe(
      '"hola" tag:greeting tag:common',
    );
  });

  test("uses raw query when given", () => {
    expect(buildSearchQuery({ query: "deck:Spanish is:review" })).toBe("deck:Spanish is:review");
  });

  test("combines raw query with phrase", () => {
    expect(buildSearchQuery({ query: "deck:Spanish", phrase: "hola" })).toBe('deck:Spanish "hola"');
  });

  test("empty options yields empty string", () => {
    expect(buildSearchQuery({})).toBe("");
  });
});

describe("stripHtml", () => {
  test("removes simple tags", () => {
    expect(stripHtml("hello <b>world</b>")).toBe("hello world");
  });

  test("decodes common entities", () => {
    expect(stripHtml("a &amp; b &lt; c &gt; d &quot;e&quot;")).toBe("a & b < c > d \"e\"");
  });

  test("decodes &nbsp; to space", () => {
    expect(stripHtml("a&nbsp;b")).toBe("a b");
  });

  test("strips Cloze markers but keeps the content", () => {
    expect(stripHtml("The capital is {{c1::Paris}}.")).toBe("The capital is Paris.");
  });

  test("strips Cloze with hint", () => {
    expect(stripHtml("{{c1::Paris::capital of France}}")).toBe("Paris");
  });

  test("strips multiple Cloze markers", () => {
    expect(stripHtml("{{c1::A}} and {{c2::B}}")).toBe("A and B");
  });

  test("collapses whitespace", () => {
    expect(stripHtml("a\n\nb\t\tc")).toBe("a b c");
  });

  test("returns empty for empty input", () => {
    expect(stripHtml("")).toBe("");
  });
});

describe("makeSnippet", () => {
  test("returns full text when shorter than maxLen", () => {
    expect(makeSnippet("hello", "x", 100)).toBe("hello");
  });

  test("truncates with ellipsis when longer than maxLen and no match", () => {
    const text = "a".repeat(200);
    const snippet = makeSnippet(text, "x", 50);
    expect(snippet.length).toBeLessThanOrEqual(50);
    expect(snippet.endsWith("…")).toBe(true);
  });

  test("centers snippet around match", () => {
    const text = "a".repeat(100) + "MATCH" + "b".repeat(100);
    const snippet = makeSnippet(text, "match", 30);
    expect(snippet.toLowerCase()).toContain("match");
    expect(snippet.startsWith("…")).toBe(true);
    expect(snippet.endsWith("…")).toBe(true);
  });

  test("uses first maxLen chars when needle not found", () => {
    const text = "alpha beta gamma";
    const snippet = makeSnippet(text, "zzz", 5);
    // Implementation: when no match, truncate to maxLen-1 chars + ellipsis.
    expect(snippet.endsWith("…")).toBe(true);
    expect(snippet.length).toBe(5);
    expect(snippet.startsWith("alph")).toBe(true);
  });

  test("handles empty text", () => {
    expect(makeSnippet("", "x", 10)).toBe("");
  });
});

describe("runSearch", () => {
  function makeMockFetch(opts: {
    noteIds: number[];
    notes: AnkiConnectNoteInfo[];
  }): typeof fetch {
    return (async (_input, init) => {
      const body = JSON.parse((init as RequestInit).body as string);
      const env: AnkiConnectResponse<unknown> = { result: null, error: null };
      if (body.action === "findNotes") {
        env.result = opts.noteIds;
      } else if (body.action === "notesInfo") {
        env.result = opts.notes;
      }
      return new Response(JSON.stringify(env), { status: 200 });
    }) as unknown as typeof fetch;
  }

  test("returns one hit per note with stripped text and snippet", async () => {
    const fetch = makeMockFetch({
      noteIds: [42, 43],
      notes: [
        {
          noteId: 42,
          modelName: "Basic",
          tags: ["greeting"],
          fields: {
            Front: { value: "<b>Hola</b>", order: 0 },
            Back: { value: "Hello", order: 1 },
          },
          cards: [101, 102],
        },
        {
          noteId: 43,
          modelName: "Basic",
          tags: [],
          fields: {
            Front: { value: "Adios", order: 0 },
            Back: { value: "Goodbye", order: 1 },
          },
          cards: [103],
        },
      ],
    });

    const hits = await runSearch({
      ankiConnectUrl: "http://x",
      fetchImpl: fetch,
      phrase: "hola",
    });

    expect(hits).toHaveLength(2);
    expect(hits[0]!.noteId).toBe(42);
    expect(hits[0]!.cards).toEqual([101, 102]);
    expect(hits[0]!.snippet).toContain("Hola");
    expect(hits[0]!.snippetField).toBe("Front");
    expect(hits[0]!.plainText).toContain("[Front] Hola");
    expect(hits[0]!.plainText).toContain("[Back] Hello");
  });

  test("skips null entries from notesInfo", async () => {
    const fetch = makeMockFetch({ noteIds: [1, 2], notes: [null, null] });
    const hits = await runSearch({ ankiConnectUrl: "http://x", fetchImpl: fetch });
    expect(hits).toEqual([]);
  });

  test("respects limit", async () => {
    const ids = [1, 2, 3, 4, 5];
    const notes = ids.map((id) => ({
      noteId: id, modelName: "Basic", tags: [], fields: {}, cards: [],
    }));
    const fetch = (async (_input, init) => {
      const body = JSON.parse((init as RequestInit).body as string);
      const env: AnkiConnectResponse<unknown> = { result: null, error: null };
      if (body.action === "findNotes") {
        env.result = ids; // search hit 5
      } else if (body.action === "notesInfo") {
        const requested: number[] = body.params.notes;
        env.result = notes.filter((n) => requested.includes(n.noteId));
      }
      return new Response(JSON.stringify(env), { status: 200 });
    }) as unknown as typeof fetch;
    const hits = await runSearch({ ankiConnectUrl: "http://x", fetchImpl: fetch, limit: 2 });
    expect(hits).toHaveLength(2);
  });

  test("returns empty array when no matches", async () => {
    const fetch = makeMockFetch({ noteIds: [], notes: [] });
    const hits = await runSearch({ ankiConnectUrl: "http://x", fetchImpl: fetch });
    expect(hits).toEqual([]);
  });
});

describe("renderSearch", () => {
  test("renders zero-match message when no hits", () => {
    expect(renderSearch([])).toBe("No matches.");
  });

  test("renders one hit with note id, model, tags, cards, snippet", () => {
    const text = renderSearch([
      {
        noteId: 42,
        modelName: "Basic",
        tags: ["greeting", "spanish"],
        cards: [101],
        plainText: "[Front] Hola\n[Back] Hello",
        snippet: "Hola",
        snippetField: "Front",
      },
    ]);
    expect(text).toContain("1 match:");
    expect(text).toContain("Note 42");
    expect(text).toContain("Basic");
    expect(text).toContain("[greeting spanish]");
    expect(text).toContain("cards: #101");
    expect(text).toContain("Hola");
    expect(text).toContain("(in Front)");
  });

  test("uses plural 'matches' for many hits", () => {
    const text = renderSearch([
      { noteId: 1, modelName: "Basic", tags: [], cards: [], plainText: "", snippet: "", snippetField: null },
      { noteId: 2, modelName: "Basic", tags: [], cards: [], plainText: "", snippet: "", snippetField: null },
    ]);
    expect(text).toContain("2 matches:");
  });
});
