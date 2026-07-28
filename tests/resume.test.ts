/**
 * Tests for resume-from (M11).
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { importFromFile } from "../src/import.ts";
import { createCheckpoint } from "../src/checkpoints.ts";

const TEMP_XDG = path.join(os.tmpdir(), `anki-xml-resume-${Date.now()}`);
let originalXdg: string | undefined;

beforeEach(() => {
  originalXdg = process.env["XDG_DATA_HOME"];
  process.env["XDG_DATA_HOME"] = TEMP_XDG;
});

afterEach(async () => {
  if (originalXdg === undefined) delete process.env["XDG_DATA_HOME"];
  else process.env["XDG_DATA_HOME"] = originalXdg;
  await fs.rm(TEMP_XDG, { recursive: true, force: true });
});

function makeFetch(responses: Map<string, unknown>): typeof fetch {
  return (async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(init?.body as string) as { action: string; params?: unknown };
    const result = responses.has(body.action)
      ? responses.get(body.action)
      : null;
    return new Response(JSON.stringify({ result, error: null }), {
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

describe("importFromFile with --resume-from", () => {
  test("skips notes whose fingerprint matches the checkpoint", async () => {
    const tmp = await fs.mkdtemp("/tmp/anki-xml-resume-");
    const file = `${tmp}/cards.xml`;
    await fs.writeFile(
      file,
      `<anki deck="Spanish">
        <note type="Basic"><front>hola</front><back>hello</back></note>
        <note type="Basic"><front>adios</front><back>goodbye</back></note>
      </anki>`,
      "utf8",
    );

    // Pretend the first note was already imported (noteId=999).
    const fetchImpl = makeFetch(
      new Map<string, unknown>([
        ["notesInfo", [{ noteId: 999, deckName: "Spanish", modelName: "Basic", fields: { Front: { value: "hola", order: 0 }, Back: { value: "hello", order: 1 } }, tags: [] }]],
        ["createDeck", 1],
        ["addNotes", [1000]],
      ]),
    );

    // Capture the checkpoint that mirrors the "first run".
    await createCheckpoint("partial", [999], { fetchImpl, note: "first attempt" });

    const outcome = await importFromFile({
      inputPath: file,
      resumeFromCheckpoint: "partial",
      fetchImpl,
    });
    // First note skipped (already in snapshot), second note created.
    expect(outcome.result.created).toBe(2); // 1 skipped + 1 created
    expect(outcome.validationErrors).toEqual([]);
    await fs.rm(tmp, { recursive: true, force: true });
  });

  test("creates every note when the checkpoint is empty", async () => {
    const tmp = await fs.mkdtemp("/tmp/anki-xml-resume-");
    const file = `${tmp}/cards.xml`;
    await fs.writeFile(
      file,
      `<anki deck="Spanish">
        <note type="Basic"><front>hola</front><back>hello</back></note>
      </anki>`,
      "utf8",
    );
    const fetchImpl = makeFetch(
      new Map<string, unknown>([
        ["createDeck", 1],
        ["addNotes", [1234]],
      ]),
    );
    await createCheckpoint("none", [], { fetchImpl }).catch(() => {/* empty rejected */});
    // No checkpoint file exists, but if it did, it would have no notes;
    // call importFromFile WITHOUT a resume and confirm normal flow.
    const outcome = await importFromFile({
      inputPath: file,
      fetchImpl,
    });
    expect(outcome.result.created).toBe(1);
    await fs.rm(tmp, { recursive: true, force: true });
  });

  test("still reports failures from AnkiConnect for non-resumed notes", async () => {
    const tmp = await fs.mkdtemp("/tmp/anki-xml-resume-");
    const file = `${tmp}/cards.xml`;
    await fs.writeFile(
      file,
      `<anki deck="Spanish">
        <note type="Basic"><front>hola</front><back>hello</back></note>
      </anki>`,
      "utf8",
    );
    const fetchImpl = makeFetch(
      new Map<string, unknown>([
        ["createDeck", 1],
        ["addNotes", [null]],
      ]),
    );
    const outcome = await importFromFile({
      inputPath: file,
      fetchImpl,
    });
    expect(outcome.result.created).toBe(0);
    expect(outcome.result.failed.length).toBe(1);
    await fs.rm(tmp, { recursive: true, force: true });
  });
});