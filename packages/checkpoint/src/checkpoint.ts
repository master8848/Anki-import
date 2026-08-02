/**
 * Simplified checkpoints.
 *
 * Shape:
 *   { "id": "...", "deck": "Spanish", "created": "2026-07-30", "noteIds": [1,2,3] }
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { Checkpoint } from "@anki-xml/utils";

export function checkpointDir(): string {
  const xdg = process.env["XDG_DATA_HOME"];
  const base = xdg && xdg.length > 0 ? xdg : path.join(os.homedir(), ".local", "share");
  return path.join(base, "anki-import", "checkpoints");
}

function checkpointPath(id: string): string {
  const safe = id.replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(checkpointDir(), `${safe}.json`);
}

export async function createCheckpoint(opts: {
  id: string;
  deck: string;
  noteIds: number[];
}): Promise<Checkpoint> {
  const snap: Checkpoint = {
    id: opts.id,
    deck: opts.deck,
    created: new Date().toISOString().slice(0, 10),
    noteIds: [...opts.noteIds],
  };
  const dir = checkpointDir();
  await fs.mkdir(dir, { recursive: true });
  const target = checkpointPath(opts.id);
  const tmp = `${target}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(snap, null, 2), "utf8");
  await fs.rename(tmp, target);
  return snap;
}

export async function loadCheckpoint(id: string): Promise<Checkpoint> {
  const target = checkpointPath(id);
  try {
    const raw = await fs.readFile(target, "utf8");
    return JSON.parse(raw) as Checkpoint;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new Error(`Checkpoint not found: ${id}`);
    }
    throw err;
  }
}

export async function listCheckpoints(): Promise<Checkpoint[]> {
  const dir = checkpointDir();
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const out: Checkpoint[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(dir, name), "utf8");
      out.push(JSON.parse(raw) as Checkpoint);
    } catch {
      /* skip corrupt */
    }
  }
  out.sort((a, b) => a.created.localeCompare(b.created));
  return out;
}

export async function deleteCheckpoint(id: string): Promise<void> {
  await fs.unlink(checkpointPath(id)).catch(() => undefined);
}
