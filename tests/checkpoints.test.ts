/**
 * Tests for checkpoints / rollback / audit-log (M2 + M3).
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  appendAudit,
  auditLogPath,
  checkpointDir,
  createCheckpoint,
  listCheckpoints,
  loadCheckpoint,
  readAudit,
  rollbackCheckpoint,
} from "../src/checkpoints.ts";

const TEMP_XDG = path.join(os.tmpdir(), `anki-xml-test-${Date.now()}`);
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
    const body = JSON.parse(init?.body as string) as { action: string };
    const result = responses.has(body.action)
      ? responses.get(body.action)
      : null;
    return new Response(JSON.stringify({ result, error: null }), {
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

describe("createCheckpoint", () => {
  test("captures note state into a JSON file under checkpointDir()", async () => {
    const responses = new Map<string, unknown>([
      [
        "notesInfo",
        [
          {
            noteId: 100,
            guid: "abc",
            modelName: "Basic",
            deckName: "Spanish",
            fields: {
              Front: { value: "hola", order: 0 },
              Back: { value: "hello", order: 1 },
            },
            tags: ["greetings"],
          },
        ],
      ],
    ]);
    const fetchImpl = makeFetch(responses);
    const snap = await createCheckpoint("pre-delete", [100], {
      fetchImpl,
      note: "before deleting duplicate cards",
    });
    expect(snap.notes[100]?.fields["Front"]).toBe("hola");
    expect(snap.notes[100]?.tags).toEqual(["greetings"]);
    const file = path.join(checkpointDir(), "pre-delete.json");
    const exists = await fs.stat(file);
    expect(exists.isFile()).toBe(true);
  });

  test("records an audit entry on success", async () => {
    const responses = new Map<string, unknown>([
      [
        "notesInfo",
        [
          {
            noteId: 200,
            modelName: "Basic",
            deckName: "Default",
            fields: { Front: { value: "x", order: 0 }, Back: { value: "y", order: 1 } },
            tags: [],
          },
        ],
      ],
    ]);
    await createCheckpoint("audit-test", [200], { fetchImpl: makeFetch(responses) });
    const entries = await readAudit();
    expect(entries.some((e) => e.command === "checkpoint" && e.checkpoint === "audit-test")).toBe(true);
  });

  test("creates empty checkpoint marker when no ids are provided", async () => {
    const snap = await createCheckpoint("empty", [], { fetchImpl: makeFetch(new Map()) });
    expect(snap.notes).toEqual({});
  });
});

describe("listCheckpoints", () => {
  test("returns metadata for every saved checkpoint", async () => {
    const responses = new Map<string, unknown>([
      [
        "notesInfo",
        [
          {
            noteId: 1,
            modelName: "Basic",
            deckName: "Default",
            fields: { Front: { value: "a", order: 0 }, Back: { value: "b", order: 1 } },
            tags: [],
          },
        ],
      ],
    ]);
    await createCheckpoint("first", [1], { fetchImpl: makeFetch(responses) });
    await createCheckpoint("second", [1], { fetchImpl: makeFetch(responses) });
    const items = await listCheckpoints();
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.name).sort()).toEqual(["first", "second"]);
  });

  test("returns [] when no checkpoints exist", async () => {
    const items = await listCheckpoints();
    expect(items).toEqual([]);
  });
});

describe("loadCheckpoint", () => {
  test("returns the snapshot by name", async () => {
    const responses = new Map<string, unknown>([
      [
        "notesInfo",
        [
          {
            noteId: 42,
            modelName: "Basic",
            deckName: "Default",
            fields: { Front: { value: "foo", order: 0 }, Back: { value: "bar", order: 1 } },
            tags: ["x"],
          },
        ],
      ],
    ]);
    await createCheckpoint("lookup", [42], { fetchImpl: makeFetch(responses) });
    const snap = await loadCheckpoint("lookup");
    expect(snap.notes[42]?.fields["Front"]).toBe("foo");
  });
});

describe("rollbackCheckpoint", () => {
  test("restores fields, tags, and deck; counts them", async () => {
    // Phase 1: capture state.
    const captureResponses = new Map<string, unknown>([
      [
        "notesInfo",
        [
          {
            noteId: 7,
            modelName: "Basic",
            deckName: "Spanish",
            fields: {
              Front: { value: "original-front", order: 0 },
              Back: { value: "original-back", order: 1 },
            },
            tags: ["original"],
          },
        ],
      ],
    ]);
    await createCheckpoint("restore-test", [7], {
      fetchImpl: makeFetch(captureResponses),
    });

    // Phase 2: rollback. Live state has drifted.
    const rollbackCalls: { action: string; params: unknown }[] = [];
    const rollbackFetch: typeof fetch = (async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string) as { action: string; params?: unknown };
      rollbackCalls.push(body);
      let result: unknown = null;
      if (body.action === "notesInfo") {
        result = [
          {
            noteId: 7,
            modelName: "Basic",
            deckName: "Other",
            fields: {
              Front: { value: "drifted-front", order: 0 },
              Back: { value: "drifted-back", order: 1 },
            },
            tags: ["drifted"],
          },
        ];
      } else if (body.action === "updateNoteFields") {
        result = null;
      } else if (body.action === "changeDeck") {
        result = null;
      }
      return new Response(JSON.stringify({ result, error: null }), {
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const result = await rollbackCheckpoint("restore-test", { fetchImpl: rollbackFetch });
    expect(result.fields).toBe(1);
    expect(result.tags).toBe(1);
    expect(result.decks).toBe(1);
    expect(rollbackCalls.some((c) => c.action === "updateNoteFields")).toBe(true);
    expect(rollbackCalls.some((c) => c.action === "changeDeck")).toBe(true);
  });

  test("records an audit entry for the rollback", async () => {
    const captureResponses = new Map<string, unknown>([
      [
        "notesInfo",
        [
          {
            noteId: 8,
            modelName: "Basic",
            deckName: "Default",
            fields: { Front: { value: "x", order: 0 }, Back: { value: "y", order: 1 } },
            tags: [],
          },
        ],
      ],
    ]);
    await createCheckpoint("audit-rollback", [8], { fetchImpl: makeFetch(captureResponses) });
    await rollbackCheckpoint("audit-rollback", { fetchImpl: makeFetch(captureResponses) });
    const entries = await readAudit();
    expect(entries.some((e) => e.command === "rollback" && e.checkpoint === "audit-rollback")).toBe(true);
  });
});

describe("audit log paths", () => {
  test("auditLogPath respects XDG_DATA_HOME", () => {
    expect(auditLogPath()).toBe(path.join(TEMP_XDG, "anki-xml", "audit.log"));
  });
  test("checkpointDir respects XDG_DATA_HOME", () => {
    expect(checkpointDir()).toBe(path.join(TEMP_XDG, "anki-xml", "checkpoints"));
  });
});

describe("appendAudit + readAudit", () => {
  test("appends one entry per call, newest first", async () => {
    await appendAudit({ ts: "2024-01-01T00:00:00Z", command: "delete", outcome: "ok", noteIds: [1] });
    await appendAudit({ ts: "2024-01-02T00:00:00Z", command: "import", outcome: "ok", noteIds: [2] });
    const entries = await readAudit();
    expect(entries[0]?.command).toBe("import");
    expect(entries[1]?.command).toBe("delete");
  });
});