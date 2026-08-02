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
  // Injective id -> filename mapping: every unsafe char becomes an
  // underscore-escaped hex sequence (`_` included), so distinct ids
  // can never collide on disk.
  const safe = id.replace(/[^a-zA-Z0-9.-]/g, (c) =>
    `_${c.charCodeAt(0).toString(16).padStart(2, "0")}`,
  );
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

/**
 * Write a checkpoint for created notes, unless there are none.
 * `decks` is the set of decks involved; when exactly one distinct deck
 * was touched it becomes the checkpoint deck, otherwise `defaultDeck`
 * (or ""). Returns null when nothing should be recorded — callers can
 * then report no checkpoint id instead of an empty snapshot.
 * `force` writes the file even with zero notes: sync/import pass it
 * when the user EXPLICITLY supplied a checkpoint id, so a later
 * `rollback <id>` finds the file; auto-generated ids still skip empty.
 */
export async function createCheckpointForNotes(
  decks: Iterable<string>,
  noteIds: number[],
  prefix: string,
  opts: { id?: string; defaultDeck?: string; force?: boolean } = {},
): Promise<Checkpoint | null> {
  if (noteIds.length === 0 && opts.force !== true) return null;
  const uniqueDecks = [...new Set(decks)];
  let deck = opts.defaultDeck ?? "";
  if (uniqueDecks.length === 1 && uniqueDecks[0] !== undefined) deck = uniqueDecks[0];
  return createCheckpoint({ id: opts.id ?? `${prefix}-${Date.now()}`, deck, noteIds });
}

function isCheckpoint(value: unknown): value is Checkpoint {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c["id"] === "string" &&
    typeof c["deck"] === "string" &&
    typeof c["created"] === "string" &&
    Array.isArray(c["noteIds"]) &&
    (c["noteIds"] as unknown[]).every((n) => typeof n === "number")
  );
}

function parseCheckpoint(raw: string, label: string): Checkpoint {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Checkpoint "${label}" is corrupt (invalid JSON): ${(err as Error).message}`);
  }
  if (!isCheckpoint(parsed)) {
    throw new Error(
      `Checkpoint "${label}" is corrupt: expected { id: string, deck: string, created: string, noteIds: number[] }`,
    );
  }
  return parsed;
}

export async function loadCheckpoint(id: string): Promise<Checkpoint> {
  const target = checkpointPath(id);
  try {
    const raw = await fs.readFile(target, "utf8");
    return parseCheckpoint(raw, id);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw err;
    // Legacy compat: pre-escape-mapping checkpoints used the raw id as
    // the filename, so an id with `_` (or any other unsafe char) was
    // written unescaped. Reads fall back to the legacy name; writes
    // always use the injective mapping above.
    const legacy = path.join(checkpointDir(), `${id}.json`);
    if (legacy === target) {
      throw new Error(`Checkpoint not found: ${id}`);
    }
    try {
      const raw = await fs.readFile(legacy, "utf8");
      return parseCheckpoint(raw, id);
    } catch (legacyErr) {
      const legacyCode = (legacyErr as NodeJS.ErrnoException).code;
      if (legacyCode === "ENOENT") throw new Error(`Checkpoint not found: ${id}`);
      throw legacyErr;
    }
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
      out.push(parseCheckpoint(raw, name));
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
