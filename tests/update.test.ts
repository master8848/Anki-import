/**
 * Tests for the `update` command.
 *
 * - loadUpdatesFromXml: parses an updates file with id="..." attributes
 * - displayFieldName: maps XML tag to Anki display name
 * - runUpdate: mocked AnkiConnect; verifies per-note error tolerance
 * - renderUpdate: human output
 */

import { describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { AnkiConnectResponse } from "../src/types.ts";
import {
  loadUpdatesFromXml,
  runUpdate,
  renderUpdate,
  displayFieldName,
} from "../src/update.ts";

async function writeTemp(name: string, body: string): Promise<string> {
  const p = path.join(os.tmpdir(), `anki-xml-update-${name}-${Math.random().toString(36).slice(2)}.xml`);
  await fs.writeFile(p, body, "utf8");
  return p;
}

describe("displayFieldName", () => {
  test("maps front->Front, back->Back for built-in non-Cloze models", () => {
    expect(displayFieldName("Basic", "front")).toBe("Front");
    expect(displayFieldName("Basic (and reversed card)", "back")).toBe("Back");
    expect(displayFieldName("Basic (type in the answer)", "extra")).toBe("Extra");
  });

  test("maps text->Text, extra->Extra for Cloze", () => {
    expect(displayFieldName("Cloze", "text")).toBe("Text");
    expect(displayFieldName("Cloze", "extra")).toBe("Extra");
  });

  test("passes through unknown field names verbatim", () => {
    expect(displayFieldName("MyCustomModel", "MyField")).toBe("MyField");
  });
});

describe("loadUpdatesFromXml", () => {
  test("parses <note id=\"N\"> with one field", async () => {
    const p = await writeTemp("single", `<anki>
  <note id="100" type="Basic">
    <front>new Q</front>
    <back>new A</back>
  </note>
</anki>`);
    try {
      const entries = await loadUpdatesFromXml(p);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.noteId).toBe(100);
      expect(entries[0]!.fields.map((f) => f.name)).toEqual(["Front", "Back"]);
      expect(entries[0]!.fields[0]!.value).toBe("new Q");
      expect(entries[0]!.fields[1]!.value).toBe("new A");
    } finally {
      await fs.unlink(p);
    }
  });

  test("parses Cloze fields correctly", async () => {
    const p = await writeTemp("cloze", `<anki>
  <note id="200" type="Cloze">
    <text>The capital is {{c1::Paris}}.</text>
  </note>
</anki>`);
    try {
      const entries = await loadUpdatesFromXml(p);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.noteId).toBe(200);
      expect(entries[0]!.fields[0]!.name).toBe("Text");
      expect(entries[0]!.fields[0]!.value).toContain("{{c1::Paris}}");
    } finally {
      await fs.unlink(p);
    }
  });

  test("parses multiple notes in document order", async () => {
    const p = await writeTemp("multi", `<anki>
  <note id="1" type="Basic"><front>A</front><back>A</back></note>
  <note id="2" type="Basic"><front>B</front><back>B</back></note>
  <note id="3" type="Basic"><front>C</front><back>C</back></note>
</anki>`);
    try {
      const entries = await loadUpdatesFromXml(p);
      expect(entries.map((e) => e.noteId)).toEqual([1, 2, 3]);
    } finally {
      await fs.unlink(p);
    }
  });

  test("rejects a <note> without an id attribute", async () => {
    const p = await writeTemp("noId", `<anki>
  <note type="Basic"><front>Q</front><back>A</back></note>
</anki>`);
    try {
      await expect(loadUpdatesFromXml(p)).rejects.toThrow(/missing a required id/);
    } finally {
      await fs.unlink(p);
    }
  });

  test("rejects a non-integer id", async () => {
    const p = await writeTemp("badId", `<anki>
  <note id="abc" type="Basic"><front>Q</front><back>A</back></note>
</anki>`);
    try {
      await expect(loadUpdatesFromXml(p)).rejects.toThrow(/missing a required id/);
    } finally {
      await fs.unlink(p);
    }
  });

  test("rejects an empty file with no <note>", async () => {
    const p = await writeTemp("empty", `<anki></anki>`);
    try {
      await expect(loadUpdatesFromXml(p)).rejects.toThrow(/No <note> elements/);
    } finally {
      await fs.unlink(p);
    }
  });

  test("preserves CDATA contents inside fields", async () => {
    const p = await writeTemp("cdata", `<anki>
  <note id="42" type="Basic">
    <front><![CDATA[\\sum_{i=0}^n x_i]]></front>
    <back>sum</back>
  </note>
</anki>`);
    try {
      const entries = await loadUpdatesFromXml(p);
      expect(entries[0]!.fields[0]!.value).toContain("\\sum");
    } finally {
      await fs.unlink(p);
    }
  });
});

describe("runUpdate", () => {
  function makeMockFetch(behaviors: Record<number, "ok" | { error: string }>): {
    fetch: typeof fetch;
    calls: { noteId: number; fields: Record<string, string> }[];
  } {
    const calls: { noteId: number; fields: Record<string, string> }[] = [];
    const fetch = (async (_input, init) => {
      const body = JSON.parse((init as RequestInit).body as string);
      const env: AnkiConnectResponse<unknown> = { result: null, error: null };
      if (body.action === "updateNoteFields") {
        const id = body.params.id;
        calls.push({ noteId: id, fields: body.params.fields });
        const b = behaviors[id];
        if (b && typeof b === "object") {
          env.error = b.error;
        } else {
          env.result = null;
        }
      }
      return new Response(JSON.stringify(env), { status: 200 });
    }) as unknown as typeof fetch;
    return { fetch, calls };
  }

  test("updates every entry sequentially", async () => {
    const { fetch, calls } = makeMockFetch({ 1: "ok", 2: "ok", 3: "ok" });
    const result = await runUpdate({
      ankiConnectUrl: "http://x",
      fetchImpl: fetch,
      entries: [
        { noteId: 1, fields: [{ name: "Front", value: "A" }] },
        { noteId: 2, fields: [{ name: "Front", value: "B" }] },
        { noteId: 3, fields: [{ name: "Front", value: "C" }] },
      ],
    });
    expect(result.attempted).toBe(3);
    expect(result.updated).toBe(3);
    expect(result.failed).toEqual([]);
    expect(calls.map((c) => c.noteId)).toEqual([1, 2, 3]);
  });

  test("continues past per-note errors and reports them", async () => {
    const { fetch, calls } = makeMockFetch({
      1: "ok",
      2: { error: "field 'Front' not in model" },
      3: "ok",
    });
    const result = await runUpdate({
      ankiConnectUrl: "http://x",
      fetchImpl: fetch,
      entries: [
        { noteId: 1, fields: [{ name: "Front", value: "A" }] },
        { noteId: 2, fields: [{ name: "Front", value: "B" }] },
        { noteId: 3, fields: [{ name: "Front", value: "C" }] },
      ],
    });
    expect(result.attempted).toBe(3);
    expect(result.updated).toBe(2);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]!.noteId).toBe(2);
    expect(result.failed[0]!.reason).toContain("not in model");
    // All three were attempted despite the failure in the middle.
    expect(calls).toHaveLength(3);
  });

  test("returns zeros for an empty entries list", async () => {
    const { fetch } = makeMockFetch({});
    const result = await runUpdate({ ankiConnectUrl: "http://x", fetchImpl: fetch, entries: [] });
    expect(result).toEqual({ attempted: 0, updated: 0, failed: [] });
  });

  test("sends field name and value as provided", async () => {
    const { fetch, calls } = makeMockFetch({ 1: "ok" });
    await runUpdate({
      ankiConnectUrl: "http://x",
      fetchImpl: fetch,
      entries: [{ noteId: 1, fields: [
        { name: "Front", value: "Q" },
        { name: "Back", value: "A" },
      ] }],
    });
    expect(calls[0]!.fields).toEqual({ Front: "Q", Back: "A" });
  });
});

describe("renderUpdate", () => {
  test("renders counters and failure details", () => {
    const text = renderUpdate({
      attempted: 3,
      updated: 2,
      failed: [{ noteId: 2, reason: "boom" }],
    });
    expect(text).toContain("Attempted: 3");
    expect(text).toContain("Updated:   2");
    expect(text).toContain("Failed:    1");
    expect(text).toContain("Note 2: boom");
  });

  test("omits the Failed section when nothing failed", () => {
    const text = renderUpdate({ attempted: 5, updated: 5, failed: [] });
    expect(text).toContain("Attempted: 5");
    expect(text).toContain("Updated:   5");
    expect(text).not.toContain("Failed:");
  });
});
