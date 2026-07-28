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
  return (async () => {
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
      captured = (init as RequestInit).body as string;
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
      captured = (init as RequestInit).body as string;
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
});
