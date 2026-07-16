/**
 * End-to-end import tests using a mocked AnkiConnect `fetch`.
 *
 * These exercise:
 *   - the full parse → validate → POST pipeline
 *   - 1-based note numbering through to per-note failure messages
 *   - the short-circuit when validation fails (no HTTP call)
 *   - the connectivity-error path
 *   - the partial-failure path (AnkiConnect returns some nulls)
 *   - the example XML files in /examples
 */

import { describe, expect, test } from "bun:test";
import { importFromFile } from "../src/import.ts";
import type { AnkiConnectResponse } from "../src/types.ts";

function makeMockAnki(
  envelope: AnkiConnectResponse<unknown>,
): typeof fetch {
  return (async (_input, init) => {
    // The new import pipeline always calls `createDeck` first
    // (unless `autoCreateDeck: false` is passed). Make the mock
    // dispatch on action so existing tests don't have to change.
    const body = JSON.parse((init as RequestInit).body as string);
    if (body.action === "createDeck") {
      return new Response(JSON.stringify({ result: 1, error: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify(envelope), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

function writeTemp(name: string, body: string): string {
  const path = `/tmp/anki-xml-test-${name}-${Math.random().toString(36).slice(2)}.xml`;
  require("node:fs").writeFileSync(path, body);
  return path;
}

// ─── Validation short-circuit ─────────────────────────────────────────────

describe("importFromFile: validation", () => {
  test("returns validation errors and does not contact Anki when XML is invalid", async () => {
    let called = false;
    const fetchImpl: typeof fetch = (async () => {
      called = true;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    const path = writeTemp("invalid", `<anki><note type="Basic"><back>A</back></note></anki>`);
    const outcome = await importFromFile({ inputPath: path, fetchImpl });
    expect(outcome.validationErrors.length).toBeGreaterThan(0);
    expect(outcome.result.created).toBe(0);
    expect(called).toBe(false);
  });

  test("keeps a mixed valid/invalid file atomic and posts no valid subset", async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return new Response(JSON.stringify({ result: [], error: null }));
    }) as unknown as typeof fetch;
    const path = writeTemp(
      "mixed-validation",
      `<anki deck="D">
        <note type="Basic"><front>valid Q</front><back>valid A</back></note>
        <note type="Basic"><back>missing front</back></note>
      </anki>`,
    );

    const outcome = await importFromFile({ inputPath: path, fetchImpl });

    expect(outcome.validCount).toBe(1);
    expect(outcome.validationErrors.some((error) => error.noteNumber === 2)).toBe(true);
    expect(outcome.result.created).toBe(0);
    expect(called).toBe(false);
  });

  test("returns single error envelope when document is empty", async () => {
    const path = writeTemp("empty", "<anki></anki>");
    const outcome = await importFromFile({ inputPath: path });
    expect(outcome.validationErrors.some((e) => /No <note>/.test(e.message))).toBe(true);
  });

  test("ignores non-note elements inside <anki>", async () => {
    const path = writeTemp("comment-only", `<anki deck="D"><!-- nothing here --></anki>`);
    const outcome = await importFromFile({ inputPath: path });
    expect(outcome.validationErrors.length).toBe(1);
    expect(outcome.validationErrors[0]!.message).toMatch(/No <note>/);
  });
});

// ─── Successful path ──────────────────────────────────────────────────────

describe("importFromFile: success", () => {
  test("creates all notes when Anki returns all ids", async () => {
    const fetchImpl = makeMockAnki({ result: [1001, 1002], error: null });
    const path = writeTemp(
      "two-basic",
      `<anki deck="D">
        <note type="Basic"><front>Q1</front><back>A1</back></note>
        <note type="Basic"><front>Q2</front><back>A2</back></note>
      </anki>`,
    );
    const outcome = await importFromFile({ inputPath: path, fetchImpl });
    expect(outcome.validationErrors).toHaveLength(0);
    expect(outcome.result.created).toBe(2);
    expect(outcome.result.failed).toHaveLength(0);
  });

  test("mixes models in one batch", async () => {
    const fetchImpl = makeMockAnki({ result: [101, 102, 103, 104, 105], error: null });
    const path = writeTemp(
      "all-types",
      `<anki deck="D">
        <note type="Basic"><front>Q1</front><back>A1</back></note>
        <note type="Basic (and reversed card)"><front>Q2</front><back>A2</back></note>
        <note type="Basic (optional reversed card)"><front>Q3</front><back>A3</back><addReverse>yes</addReverse></note>
        <note type="Basic (type in the answer)"><front>Q4</front><back>A4</back></note>
        <note type="Cloze"><text>The {{c1::Moon}}.</text></note>
      </anki>`,
    );
    const outcome = await importFromFile({ inputPath: path, fetchImpl });
    expect(outcome.result.created).toBe(5);
  });

  test("forwards tags to the Anki payload", async () => {
    let captured: string | null = null;
    const fetchImpl: typeof fetch = (async (_input, init) => {
      const body = JSON.parse((init as RequestInit).body as string);
      captured = (init as RequestInit).body as string;
      if (body.action === "createDeck") {
        return new Response(JSON.stringify({ result: 1, error: null }), { status: 200 });
      }
      return new Response(JSON.stringify({ result: [1], error: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;
    const path = writeTemp(
      "tags",
      `<anki deck="D"><note type="Basic" tags="alpha beta gamma"><front>Q</front><back>A</back></note></anki>`,
    );
    await importFromFile({ inputPath: path, fetchImpl });
    expect(captured).toContain('"tags":["alpha","beta","gamma"]');
  });

  test("forces allowDuplicate: false on every note", async () => {
    let captured: string | null = null;
    const fetchImpl: typeof fetch = (async (_input, init) => {
      const body = JSON.parse((init as RequestInit).body as string);
      captured = (init as RequestInit).body as string;
      if (body.action === "createDeck") {
        return new Response(JSON.stringify({ result: 1, error: null }), { status: 200 });
      }
      return new Response(JSON.stringify({ result: [1], error: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;
    const path = writeTemp("dupes", `<anki deck="D"><note type="Basic"><front>Q</front><back>A</back></note></anki>`);
    await importFromFile({ inputPath: path, fetchImpl });
    expect(captured).toContain('"allowDuplicate":false');
  });
});

// ─── Partial failures ─────────────────────────────────────────────────────

describe("importFromFile: partial failures", () => {
  test("counts created vs failed using parallel-array alignment", async () => {
    const fetchImpl = makeMockAnki({ result: [11, null, 13], error: null });
    const path = writeTemp(
      "partial",
      `<anki deck="D">
        <note type="Basic"><front>Q1</front><back>A1</back></note>
        <note type="Basic"><front>Q2</front><back>A2</back></note>
        <note type="Basic"><front>Q3</front><back>A3</back></note>
      </anki>`,
    );
    const outcome = await importFromFile({ inputPath: path, fetchImpl });
    expect(outcome.result.created).toBe(2);
    expect(outcome.result.failed).toHaveLength(1);
    // The failing note should be the 2nd by position (noteNumber 2).
    expect(outcome.result.failed[0]!.noteNumber).toBe(2);
    expect(outcome.result.failed[0]!.reason).toMatch(/AnkiConnect/);
  });

  test("throws when id-array length mismatches input", async () => {
    const fetchImpl = makeMockAnki({ result: [1], error: null });
    const path = writeTemp(
      "mismatch",
      `<anki deck="D">
        <note type="Basic"><front>Q1</front><back>A1</back></note>
        <note type="Basic"><front>Q2</front><back>A2</back></note>
      </anki>`,
    );
    await expect(importFromFile({ inputPath: path, fetchImpl })).rejects.toThrow(/protocol mismatch/);
  });
});

// ─── Connectivity errors ──────────────────────────────────────────────────

describe("importFromFile: connectivity", () => {
  test("throws on network failure", async () => {
    const fetchImpl: typeof fetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const path = writeTemp("netfail", `<anki deck="D"><note type="Basic"><front>Q</front><back>A</back></note></anki>`);
    await expect(importFromFile({ inputPath: path, fetchImpl })).rejects.toThrow(/Failed to reach AnkiConnect/);
  });

  test("throws on AnkiConnect envelope error", async () => {
    const fetchImpl = makeMockAnki({ result: null, error: "deck 'X' not found" });
    const path = writeTemp("enverr", `<anki deck="D"><note type="Basic"><front>Q</front><back>A</back></note></anki>`);
    await expect(importFromFile({ inputPath: path, fetchImpl })).rejects.toThrow(/deck 'X' not found/);
  });
});

// ─── Auto-create-deck ──────────────────────────────────────────────────────

describe("importFromFile: autoCreateDeck", () => {
  test("calls createDeck for every unique deck name before addNotes (default)", async () => {
    const calls: { action: string; params: unknown }[] = [];
    const fetchImpl: typeof fetch = (async (_input, init) => {
      const body = JSON.parse((init as RequestInit).body as string);
      calls.push({ action: body.action, params: body.params });
      // All createDeck calls succeed; addNotes returns a 2-id array.
      if (body.action === "createDeck") {
        return new Response(JSON.stringify({ result: 12345, error: null }), { status: 200 });
      }
      return new Response(JSON.stringify({ result: [1, 2], error: null }), { status: 200 });
    }) as unknown as typeof fetch;

    const path = writeTemp(
      "two-decks",
      `<anki>
        <note type="Basic" deck="A::B"><front>Q1</front><back>A1</back></note>
        <note type="Basic" deck="A::C"><front>Q2</front><back>A2</back></note>
      </anki>`,
    );
    const outcome = await importFromFile({ inputPath: path, fetchImpl });
    expect(outcome.result.created).toBe(2);

    const createCalls = calls.filter((c) => c.action === "createDeck");
    const createdDecks = createCalls.map((c) => (c.params as { deck: string }).deck).sort();
    expect(createdDecks).toEqual(["A::B", "A::C"]);
    // createDeck must run BEFORE addNotes — AnkiConnect would reject
    // the notes otherwise.
    const firstCreateIdx = calls.findIndex((c) => c.action === "createDeck");
    const addIdx = calls.findIndex((c) => c.action === "addNotes");
    expect(firstCreateIdx).toBeGreaterThanOrEqual(0);
    expect(addIdx).toBeGreaterThan(firstCreateIdx);
  });

  test("deduplicates deck names across notes", async () => {
    const deckNames: string[] = [];
    const fetchImpl: typeof fetch = (async (_input, init) => {
      const body = JSON.parse((init as RequestInit).body as string);
      if (body.action === "createDeck") {
        deckNames.push((body.params as { deck: string }).deck);
        return new Response(JSON.stringify({ result: 1, error: null }), { status: 200 });
      }
      return new Response(JSON.stringify({ result: [1, 1, 1], error: null }), { status: 200 });
    }) as unknown as typeof fetch;

    const path = writeTemp(
      "same-deck",
      `<anki deck="Only">
        <note type="Basic"><front>1</front><back>1</back></note>
        <note type="Basic"><front>2</front><back>2</back></note>
        <note type="Basic"><front>3</front><back>3</back></note>
      </anki>`,
    );
    await importFromFile({ inputPath: path, fetchImpl });
    expect(deckNames).toEqual(["Only"]);
  });

  test("does not call createDeck in dry-run mode", async () => {
    let createCalled = false;
    const fetchImpl: typeof fetch = (async (_input, init) => {
      const body = JSON.parse((init as RequestInit).body as string);
      if (body.action === "createDeck") createCalled = true;
      return new Response(JSON.stringify({ result: [1], error: null }), { status: 200 });
    }) as unknown as typeof fetch;
    const path = writeTemp("dry-deck", `<anki deck="X"><note type="Basic"><front>Q</front><back>A</back></note></anki>`);
    await importFromFile({ inputPath: path, fetchImpl, dryRun: true });
    expect(createCalled).toBe(false);
  });

  test("does not call createDeck when autoCreateDeck is false", async () => {
    let createCalled = false;
    const fetchImpl: typeof fetch = (async (_input, init) => {
      const body = JSON.parse((init as RequestInit).body as string);
      if (body.action === "createDeck") createCalled = true;
      return new Response(JSON.stringify({ result: [1, 2], error: null }), { status: 200 });
    }) as unknown as typeof fetch;
    const path = writeTemp(
      "noauto-deck",
      `<anki deck="X">
        <note type="Basic"><front>1</front><back>1</back></note>
        <note type="Basic"><front>2</front><back>2</back></note>
      </anki>`,
    );
    await importFromFile({ inputPath: path, fetchImpl, autoCreateDeck: false });
    expect(createCalled).toBe(false);
  });

  test("surfaces AnkiConnect error from createDeck", async () => {
    const fetchImpl: typeof fetch = (async () => {
      return new Response(
        JSON.stringify({ result: null, error: "deck name invalid" }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const path = writeTemp("createrr", `<anki deck="X"><note type="Basic"><front>Q</front><back>A</back></note></anki>`);
    await expect(importFromFile({ inputPath: path, fetchImpl })).rejects.toThrow(
      /deck name invalid/,
    );
  });
});

// ─── Working with the example files ────────────────────────────────────────

describe("importFromFile: example files", () => {
  test("examples/all-note-types.xml validates cleanly", async () => {
    const fetchImpl = makeMockAnki({ result: [1, 2, 3, 4, 5, 6], error: null });
    const outcome = await importFromFile({
      inputPath: `${import.meta.dir}/../examples/all-note-types.xml`,
      fetchImpl,
    });
    expect(outcome.validationErrors).toHaveLength(0);
    expect(outcome.result.created).toBe(6);
  });

  test("examples/html-and-latex.xml validates cleanly", async () => {
    const fetchImpl = makeMockAnki({ result: [1, 2, 3, 4, 5, 6, 7, 8], error: null });
    const outcome = await importFromFile({
      inputPath: `${import.meta.dir}/../examples/html-and-latex.xml`,
      fetchImpl,
    });
    expect(outcome.validationErrors).toHaveLength(0);
    expect(outcome.result.created).toBe(8);
  });

  test("examples/basic.xml validates cleanly", async () => {
    const fetchImpl = makeMockAnki({ result: [1, 2, 3], error: null });
    const outcome = await importFromFile({
      inputPath: `${import.meta.dir}/../examples/basic.xml`,
      fetchImpl,
    });
    expect(outcome.validationErrors).toHaveLength(0);
    expect(outcome.result.created).toBe(3);
  });

  test("examples/issue-cases.xml validates compatibility regressions", async () => {
    const fetchImpl = makeMockAnki({
      result: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      error: null,
    });
    const outcome = await importFromFile({
      inputPath: `${import.meta.dir}/../examples/issue-cases.xml`,
      fetchImpl,
    });
    expect(outcome.validationErrors).toHaveLength(0);
    expect(outcome.result.created).toBe(10);
  });
});
