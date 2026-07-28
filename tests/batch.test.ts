/**
 * Tests for the atomic batch wrapper (M9).
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { withBatch } from "../src/batch.ts";
import { listCheckpoints } from "../src/checkpoints.ts";

const TEMP_XDG = path.join(os.tmpdir(), `anki-xml-batch-${Date.now()}`);
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

describe("withBatch", () => {
  test("captures a checkpoint before the work and returns ok=true on success", async () => {
    const fetchImpl = makeFetch(
      new Map<string, unknown>([["notesInfo", []]]),
    );
    const outcome = await withBatch(
      {
        batchId: "test-batch-1",
        rollbackOnPartial: true,
        fetchImpl,
        preSnapshotIds: [],
      },
      async () => ({ result: { created: 5 }, failureCount: 0 }),
    );
    expect(outcome.ok).toBe(true);
    expect(outcome.rolledBack).toBe(false);
    expect(outcome.checkpointName).toMatch(/^batch-/);
    expect(outcome.result).toEqual({ created: 5 });
    // Audit log has a 'pending' marker from the batch start.
    const items = await listCheckpoints();
    // No file checkpoint for empty snapshot, but the audit entry is
    // present.
    expect(items).toEqual([]);
  });

  test("returns ok=false + rolledBack=false when rollback is not requested", async () => {
    const fetchImpl = makeFetch(
      new Map<string, unknown>([["notesInfo", []]]),
    );
    const outcome = await withBatch(
      {
        batchId: "test-batch-2",
        rollbackOnPartial: false,
        fetchImpl,
        preSnapshotIds: [],
      },
      async () => ({ result: { created: 1 }, failureCount: 2 }),
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.rolledBack).toBe(false);
  });

  test("calls rollbackCheckpoint when rollback is requested and failures occur", async () => {
    // First notesInfo (snapshot): original state. Second notesInfo
    // (during rollback): live state has drifted (we return different
    // values), so rollback must write back to restore the snapshot.
    let notesInfoCount = 0;
    const updateCalls: unknown[] = [];
    const fetchImpl: typeof fetch = (async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string) as { action: string };
      let result: unknown = null;
      if (body.action === "notesInfo") {
        notesInfoCount++;
        const value = notesInfoCount === 1 ? "original" : "drifted";
        result = [
          {
            noteId: 7,
            modelName: "Basic",
            deckName: "X",
            fields: { Front: { value: value, order: 0 }, Back: { value: "b", order: 1 } },
            tags: [],
          },
        ];
      } else if (body.action === "updateNoteFields") {
        updateCalls.push(body);
        result = null;
      }
      return new Response(JSON.stringify({ result, error: null }), {
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const outcome = await withBatch(
      {
        batchId: "rollback-me",
        rollbackOnPartial: true,
        fetchImpl,
        preSnapshotIds: [7],
      },
      async () => ({ result: { ok: false }, failureCount: 1 }),
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.rolledBack).toBe(true);
    expect(updateCalls.length).toBeGreaterThan(0);
  });

  test("does not call rollback when the inner work has no failures", async () => {
    const updateCalls: unknown[] = [];
    const fetchImpl: typeof fetch = (async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string) as { action: string };
      let result: unknown = null;
      if (body.action === "notesInfo") {
        result = [
          {
            noteId: 9,
            modelName: "Basic",
            deckName: "X",
            fields: { Front: { value: "f", order: 0 }, Back: { value: "b", order: 1 } },
            tags: [],
          },
        ];
      } else if (body.action === "updateNoteFields") {
        updateCalls.push(body);
        result = null;
      }
      return new Response(JSON.stringify({ result, error: null }), {
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const outcome = await withBatch(
      {
        batchId: "no-rollback",
        rollbackOnPartial: true,
        fetchImpl,
        preSnapshotIds: [9],
      },
      async () => ({ result: { ok: true }, failureCount: 0 }),
    );
    expect(outcome.ok).toBe(true);
    expect(outcome.rolledBack).toBe(false);
    // Snapshot is captured but rollback is not called.
    expect(updateCalls.length).toBe(0);
  });
});