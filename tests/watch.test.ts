import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { watchFile } from "@anki-xml/core";

const originalXdg = process.env.XDG_DATA_HOME;
let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(tmpdir(), "anki-xml-watch-"));
  process.env.XDG_DATA_HOME = tmpDir;
});

afterEach(async () => {
  if (originalXdg === undefined) delete process.env.XDG_DATA_HOME;
  else process.env.XDG_DATA_HOME = originalXdg;
  await rm(tmpDir, { recursive: true, force: true });
});

function jsonResponse(result: unknown) {
  return { ok: true, json: async () => ({ result, error: null }) } as unknown as Response;
}

function xml(front: string): string {
  return `<anki deck="Test"><note type="Basic"><front>${front}</front><back>b</back></note></anki>`;
}

async function waitFor(check: () => boolean, what: string, timeoutMs = 10_000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

function makeFetchImpl() {
  const addNotesCalls: string[][] = [];
  const fetchImpl: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { action: string; params: Record<string, unknown> };
    switch (body.action) {
      case "canAddNotes":
        return jsonResponse((body.params["notes"] as unknown[]).map(() => true));
      case "createDeck":
        return jsonResponse(1);
      case "addNotes":
        addNotesCalls.push(
          (body.params["notes"] as Array<{ fields: Record<string, string> }>).map(
            (n) => n.fields["Front"] ?? "",
          ),
        );
        return jsonResponse([1]);
      default:
        throw new Error(`unexpected action: ${body.action}`);
    }
  };
  return { fetchImpl, addNotesCalls };
}

describe("watchFile", () => {
  it("re-queues a change that lands while an apply is running", async () => {
    const file = path.join(tmpDir, "cards.xml");
    const { fetchImpl, addNotesCalls } = makeFetchImpl();
    let confirmCount = 0;
    const watcher = await watchFile(file, {
      url: "http://127.0.0.1:8765",
      fetchImpl,
      confirm: async () => {
        confirmCount++;
        if (confirmCount === 1) {
          // Second change lands while the first apply is still running.
          await writeFile(file, xml("b"), "utf8");
          // Hold the apply open long enough for the 300ms debounce to
          // fire while `running` is true.
          await new Promise((r) => setTimeout(r, 700));
        }
        return true;
      },
    });

    // Write only after the watcher is live: fs.watch does not reliably
    // deliver an event for a write that happened before watching.
    await writeFile(file, xml("a"), "utf8");

    try {
      // First apply flushes the initial file.
      await waitFor(() => addNotesCalls.length >= 1, "first apply");
      // The change written during the first apply must be re-queued and
      // applied, not silently dropped.
      await waitFor(() => addNotesCalls.length >= 2, "re-queued apply");
      expect(addNotesCalls).toEqual([["a"], ["b"]]);
    } finally {
      await watcher.stop();
    }
  }, 15_000);

  it("applies successive edits after the debounce", async () => {
    const file = path.join(tmpDir, "cards.xml");

    const { fetchImpl, addNotesCalls } = makeFetchImpl();
    const watcher = await watchFile(file, {
      url: "http://127.0.0.1:8765",
      fetchImpl,
    });

    // Write only after the watcher is live (see note above).
    await writeFile(file, xml("a"), "utf8");

    try {
      await waitFor(() => addNotesCalls.length >= 1, "first apply");
      await writeFile(file, xml("b"), "utf8");
      await waitFor(() => addNotesCalls.length >= 2, "second apply");
      expect(addNotesCalls).toEqual([["a"], ["b"]]);
    } finally {
      await watcher.stop();
    }
  }, 15_000);
});
