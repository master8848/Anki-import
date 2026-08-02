import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { importFromFile } from "@anki-xml/core";
import { loadCheckpoint } from "@anki-xml/checkpoint";

function jsonResponse(result: unknown, error: string | null = null) {
  return {
    ok: true,
    json: async () => ({ result, error }),
  } as unknown as Response;
}

const originalXdg = process.env.XDG_DATA_HOME;
let tmpDir: string;
let workDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(tmpdir(), "anki-xml-importer-"));
  process.env.XDG_DATA_HOME = tmpDir;
  workDir = await mkdtemp(path.join(tmpdir(), "anki-xml-importer-work-"));
});

afterEach(async () => {
  if (originalXdg === undefined) delete process.env.XDG_DATA_HOME;
  else process.env.XDG_DATA_HOME = originalXdg;
  await rm(tmpDir, { recursive: true, force: true });
  await rm(workDir, { recursive: true, force: true });
});

describe("importFromFile checkpoint behavior", () => {
  const xml = `<anki deck="T"><note type="Basic"><front>a</front><back>b</back></note></anki>`;

  it("records an explicit --checkpoint even when zero notes were created", async () => {
    const file = path.join(workDir, "dup.xml");
    await writeFile(file, xml, "utf8");

    const outcome = await importFromFile({
      inputPath: file,
      checkpointId: "import-empty",
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { action: string };
        if (body.action === "createDeck") return jsonResponse(1);
        if (body.action === "addNotes") return jsonResponse([null]); // duplicate -> no note ids
        throw new Error(`unexpected action: ${body.action}`);
      },
    });

    expect(outcome.result.created).toBe(0);
    expect(outcome.checkpointId).toBe("import-empty");
    const snap = await loadCheckpoint("import-empty");
    expect(snap).toMatchObject({ id: "import-empty", deck: "T", noteIds: [] });
  });

  it("skips the checkpoint when zero notes were created and no id was given", async () => {
    const file = path.join(workDir, "dup.xml");
    await writeFile(file, xml, "utf8");

    const outcome = await importFromFile({
      inputPath: file,
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { action: string };
        if (body.action === "createDeck") return jsonResponse(1);
        if (body.action === "addNotes") return jsonResponse([null]);
        throw new Error(`unexpected action: ${body.action}`);
      },
    });

    expect(outcome.checkpointId).toBeUndefined();
    expect(
      await readdir(path.join(tmpDir, "anki-import", "checkpoints")).catch(() => []),
    ).toHaveLength(0);
  });
});
