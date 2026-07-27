/**
 * Tests for sample (M4) and schema-validate (M5).
 */

import { describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import { runSample } from "../src/sample.ts";
import { runSchemaValidate } from "../src/schema-validate.ts";

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

describe("runSample", () => {
  test("returns N random notes from the matching set", async () => {
    const ids = Array.from({ length: 100 }, (_, i) => 1000 + i);
    const responses = new Map<string, unknown>([
      ["findNotes", ids],
      [
        "notesInfo",
        ids.slice(0, 5).map((id) => ({
          noteId: id,
          modelName: "Basic",
          deckName: "Default",
          fields: {
            Front: { value: `front-${id}`, order: 0 },
            Back: { value: `back-${id}`, order: 1 },
          },
          tags: [],
        })),
      ],
    ]);
    const result = await runSample({ count: 5, fetchImpl: makeFetch(responses) });
    expect(result.totalMatched).toBe(100);
    expect(result.notes.length).toBe(5);
    expect(result.notes.every((n) => n.noteId >= 1000 && n.noteId < 1100)).toBe(true);
  });

  test("is deterministic with a seed", async () => {
    const ids = Array.from({ length: 50 }, (_, i) => 1000 + i);
    const responses = new Map<string, unknown>([
      ["findNotes", ids],
      [
        "notesInfo",
        ids.slice(0, 3).map((id) => ({
          noteId: id,
          modelName: "Basic",
          deckName: "Default",
          fields: { Front: { value: "f", order: 0 }, Back: { value: "b", order: 1 } },
          tags: [],
        })),
      ],
    ]);
    const a = await runSample({ count: 3, seed: 42, fetchImpl: makeFetch(responses) });
    const b = await runSample({ count: 3, seed: 42, fetchImpl: makeFetch(responses) });
    expect(a.notes.map((n) => n.noteId)).toEqual(b.notes.map((n) => n.noteId));
    expect(a.seed).toBe(b.seed);
  });

  test("returns an empty sample when nothing matches", async () => {
    const responses = new Map<string, unknown>([["findNotes", []]]);
    const result = await runSample({ count: 10, fetchImpl: makeFetch(responses) });
    expect(result.notes).toEqual([]);
    expect(result.totalMatched).toBe(0);
  });
});

describe("runSchemaValidate", () => {
  test("flags an unknown-field drift when file uses a field the model doesn't have", async () => {
    const tmp = await fs.mkdtemp("/tmp/anki-xml-schema-");
    const file = `${tmp}/bad.xml`;
    await fs.writeFile(
      file,
      `<anki deck="Spanish"><note type="Basic"><front>hola</front><back>hello</back><BogusField>x</BogusField></note></anki>`,
      "utf8",
    );
    const responses = new Map<string, unknown>([["modelFieldNames", ["Front", "Back"]]]);
    const result = await runSchemaValidate({ inputPath: file, fetchImpl: makeFetch(responses) });
    expect(result.issues.some((i) => i.kind === "unknown-field" && i.field === "BogusField")).toBe(true);
    await fs.rm(tmp, { recursive: true, force: true });
  });

  test("flags a missing-required-field drift when the file omits a model field", async () => {
    const tmp = await fs.mkdtemp("/tmp/anki-xml-schema-");
    const file = `${tmp}/partial.xml`;
    await fs.writeFile(
      file,
      `<anki deck="Spanish"><note type="Cloze"><text>{{c1::foo::bar}}</text></note></anki>`,
      "utf8",
    );
    const responses = new Map<string, unknown>([["modelFieldNames", ["Text", "Extra"]]]);
    const result = await runSchemaValidate({ inputPath: file, fetchImpl: makeFetch(responses) });
    expect(result.issues.some((i) => i.kind === "missing-required-field" && i.field === "Extra")).toBe(true);
    await fs.rm(tmp, { recursive: true, force: true });
  });

  test("flags an unknown-model when the model isn't in the collection", async () => {
    const tmp = await fs.mkdtemp("/tmp/anki-xml-schema-");
    const file = `${tmp}/unknown.xml`;
    await fs.writeFile(
      file,
      `<anki deck="Spanish"><note type="Basic"><front>hola</front><back>hello</back></note></anki>`,
      "utf8",
    );
    const responses = new Map<string, unknown>([["modelFieldNames", []]]);
    const result = await runSchemaValidate({ inputPath: file, fetchImpl: makeFetch(responses) });
    expect(result.issues.some((i) => i.kind === "unknown-model")).toBe(true);
    await fs.rm(tmp, { recursive: true, force: true });
  });

  test("returns zero issues when the file matches the schema exactly", async () => {
    const tmp = await fs.mkdtemp("/tmp/anki-xml-schema-");
    const file = `${tmp}/good.xml`;
    await fs.writeFile(
      file,
      `<anki deck="Spanish"><note type="Basic"><front>hola</front><back>hello</back></note></anki>`,
      "utf8",
    );
    const responses = new Map<string, unknown>([["modelFieldNames", ["Front", "Back"]]]);
    const result = await runSchemaValidate({ inputPath: file, fetchImpl: makeFetch(responses) });
    expect(result.issues).toEqual([]);
    expect(result.cleanNotes).toBe(1);
    await fs.rm(tmp, { recursive: true, force: true });
  });

  test("rejects files with static validation errors before checking schema", async () => {
    const tmp = await fs.mkdtemp("/tmp/anki-xml-schema-");
    const file = `${tmp}/broken.xml`;
    await fs.writeFile(file, `<anki><note><front></front></note></anki>`, "utf8");
    await expect(runSchemaValidate({ inputPath: file, fetchImpl: makeFetch(new Map()) })).rejects.toThrow(
      /static validation error/,
    );
    await fs.rm(tmp, { recursive: true, force: true });
  });
});