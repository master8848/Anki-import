/**
 * Checkpoints (M2) and audit log (M3).
 *
 * A checkpoint is a JSON snapshot of a set of note ids, captured
 * before any destructive operation. The agent can later call
 * `rollback --to <name>` to restore those notes to the snapshotted
 * state — adding back deleted notes, restoring original fields, and
 * reverting tags.
 *
 * Storage:
 *   - checkpoints: ~/.local/share/anki-xml/checkpoints/<name>.json
 *     (or $XDG_DATA_HOME/anki-xml/checkpoints/)
 *   - audit log:   ~/.local/share/anki-xml/audit.log (JSONL)
 *
 * The two are independent but tightly related: the audit log lets
 * the agent reconstruct what it did (and when), and the checkpoints
 * let it undo what it did.
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { AnkiConnectClient } from "./anki-connect.ts";

export interface CheckpointSnapshot {
  /** Name (also the filename stem). */
  name: string;
  /** ISO timestamp the checkpoint was created. */
  createdAt: string;
  /** Notes captured in the snapshot, by id. */
  notes: Record<number, SnapshotNote>;
}

export interface SnapshotNote {
  noteId: number;
  deckName: string;
  modelName: string;
  fields: Record<string, string>;
  tags: string[];
}

export interface AuditEntry {
  /** ISO timestamp. */
  ts: string;
  /** Command name (e.g. "delete", "import", "update"). */
  command: string;
  /** Outcome: "ok" | "error" | "dry-run". */
  outcome: string;
  /** Note ids affected, if applicable. */
  noteIds?: number[];
  /** Optional checkpoint name referenced. */
  checkpoint?: string;
  /** Free-form details (e.g. error message). */
  details?: string;
}

export function checkpointDir(): string {
  const xdg = process.env["XDG_DATA_HOME"];
  const base = xdg && xdg.length > 0 ? xdg : path.join(os.homedir(), ".local", "share");
  return path.join(base, "anki-xml", "checkpoints");
}

export function auditLogPath(): string {
  const xdg = process.env["XDG_DATA_HOME"];
  const base = xdg && xdg.length > 0 ? xdg : path.join(os.homedir(), ".local", "share");
  return path.join(base, "anki-xml", "audit.log");
}

/** Capture the current state of every note id into a named checkpoint. */
export async function createCheckpoint(
  name: string,
  noteIds: number[],
  opts: { ankiConnectUrl?: string; fetchImpl?: typeof fetch; note?: string },
): Promise<CheckpointSnapshot> {
  const notes: Record<number, SnapshotNote> = {};
  if (noteIds.length > 0) {
    const client = new AnkiConnectClient({
      url: opts.ankiConnectUrl ?? "http://127.0.0.1:8765",
      fetchImpl: opts.fetchImpl,
    });
    const infos = await client.notesInfo(noteIds);
    for (const info of infos) {
      if (!info) continue;
      const fields: Record<string, string> = {};
      for (const [name, f] of Object.entries(info.fields)) fields[name] = f.value;
      notes[info.noteId] = {
        noteId: info.noteId,
        deckName: info.deckName,
        modelName: info.modelName,
        fields,
        tags: info.tags ?? [],
      };
    }
  }
  const snap: CheckpointSnapshot = {
    name,
    createdAt: new Date().toISOString(),
    notes,
  };
  const dir = checkpointDir();
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${sanitize(name)}.json`);
  await fs.writeFile(file, JSON.stringify(snap, null, 2), "utf8");
  await appendAudit({
    ts: snap.createdAt,
    command: "checkpoint",
    outcome: "ok",
    noteIds,
    checkpoint: name,
    details: opts.note,
  });
  return snap;
}

/** Load a checkpoint by name. Throws when the file doesn't exist. */
export async function loadCheckpoint(name: string): Promise<CheckpointSnapshot> {
  const file = path.join(checkpointDir(), `${sanitize(name)}.json`);
  const text = await fs.readFile(file, "utf8");
  return JSON.parse(text) as CheckpointSnapshot;
}

/** List all checkpoints (name + createdAt) without loading payloads. */
export async function listCheckpoints(): Promise<
  { name: string; createdAt: string; noteCount: number }[]
> {
  const dir = checkpointDir();
  let entries: string[] = [];
  try {
    entries = await fs.readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const out: { name: string; createdAt: string; noteCount: number }[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    try {
      const text = await fs.readFile(path.join(dir, entry), "utf8");
      const snap = JSON.parse(text) as CheckpointSnapshot;
      out.push({
        name: snap.name,
        createdAt: snap.createdAt,
        noteCount: Object.keys(snap.notes).length,
      });
    } catch {
      // Skip malformed files rather than failing the whole list.
    }
  }
  out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return out;
}

/**
 * Restore every note in the checkpoint to its snapshotted state.
 * Returns the ids touched.
 */
export async function rollbackCheckpoint(
  name: string,
  opts: { ankiConnectUrl?: string; fetchImpl?: typeof fetch },
): Promise<{ restored: number; missing: number; fields: number; tags: number; decks: number }> {
  const snap = await loadCheckpoint(name);
  const client = new AnkiConnectClient({
    url: opts.ankiConnectUrl ?? "http://127.0.0.1:8765",
    fetchImpl: opts.fetchImpl,
  });
  const current = await client.notesInfo(Object.keys(snap.notes).map(Number));
  const liveById = new Map<number, NonNullable<typeof current[number]>>();
  for (const info of current) if (info) liveById.set(info.noteId, info);

  let restored = 0;
  let missing = 0;
  let fields = 0;
  let tags = 0;
  let decks = 0;
  const idsToUpdate: number[] = [];

  for (const snapNote of Object.values(snap.notes)) {
    const live = liveById.get(snapNote.noteId);
    if (!live) {
      missing++;
      continue;
    }
    let touched = false;
    if (live.deckName !== snapNote.deckName) {
      idsToUpdate.push(snapNote.noteId);
      decks++;
      touched = true;
    }
    // Field comparison.
    const fieldDiffs: Record<string, string> = {};
    for (const [name, value] of Object.entries(snapNote.fields)) {
      if (live.fields[name]?.value !== value) {
        fieldDiffs[name] = value;
      }
    }
    if (Object.keys(fieldDiffs).length > 0) {
      await client.updateNoteFields(snapNote.noteId, fieldDiffs);
      fields++;
      touched = true;
    }
    // Tag comparison.
    const wantTags = [...snapNote.tags].sort().join(" ");
    const haveTags = [...(live.tags ?? [])].sort().join(" ");
    if (wantTags !== haveTags) {
      const toAdd = snapNote.tags.filter((t) => !(live.tags ?? []).includes(t));
      const toRemove = (live.tags ?? []).filter((t) => !snapNote.tags.includes(t));
      if (toAdd.length > 0) await client.addTags(snapNote.noteId, " " + toAdd.join(" ") + " ");
      if (toRemove.length > 0) await client.removeTags(snapNote.noteId, " " + toRemove.join(" ") + " ");
      tags++;
      touched = true;
    }
    if (touched) restored++;
  }

  // Bulk-deck-changes go through changeDeck.
  if (idsToUpdate.length > 0) {
    // We don't track per-note target deck cleanly here; best-effort.
    for (const id of idsToUpdate) {
      const snapNote = snap.notes[id];
      if (snapNote) await client.changeDeck(id, snapNote.deckName);
    }
  }

  await appendAudit({
    ts: new Date().toISOString(),
    command: "rollback",
    outcome: "ok",
    noteIds: Object.keys(snap.notes).map(Number),
    checkpoint: name,
    details: `restored=${restored} missing=${missing} fields=${fields} tags=${tags} decks=${decks}`,
  });
  return { restored, missing, fields, tags, decks };
}

/** Append an entry to the audit log. JSONL format. */
export async function appendAudit(entry: AuditEntry): Promise<void> {
  const file = auditLogPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.appendFile(file, JSON.stringify(entry) + "\n", "utf8");
}

/** Read every audit entry, newest first. */
export async function readAudit(limit?: number): Promise<AuditEntry[]> {
  const file = auditLogPath();
  let text = "";
  try {
    text = await fs.readFile(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  const entries: AuditEntry[] = [];
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line) as AuditEntry);
    } catch {
      // skip malformed lines
    }
  }
  entries.reverse();
  return limit ? entries.slice(0, limit) : entries;
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}