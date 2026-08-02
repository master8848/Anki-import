/**
 * Sync: apply an import plan to the live collection and record a
 * checkpoint for later rollback or drift detection.
 */

import { AnkiClient } from "@anki-xml/anki";
import { createCheckpointForNotes, loadCheckpoint } from "@anki-xml/checkpoint";
import type { Logger } from "@anki-xml/logger";
import { toAnkiConnectNote, type ImportPlan } from "@anki-xml/planner";
import type { ImportResult } from "@anki-xml/utils";

export interface SyncApplyOptions {
  url?: string;
  fetchImpl?: typeof fetch;
  batchSize?: number;
  autoCreateDeck?: boolean;
  allowDuplicate?: boolean;
  checkpointId?: string;
  logger?: Logger;
}

export interface SyncApplyResult {
  created: number;
  updated: number;
  failed: ImportResult["failed"];
  checkpointId?: string;
}

export function emptySyncApplyResult(): SyncApplyResult {
  return { created: 0, updated: 0, failed: [] };
}

/** Apply a plan: create decks, add notes, update fields, write a checkpoint. */
export async function applyPlan(plan: ImportPlan, opts: SyncApplyOptions = {}): Promise<SyncApplyResult> {
  const batchSize = opts.batchSize ?? 500;
  const client = new AnkiClient({ url: opts.url, fetchImpl: opts.fetchImpl });
  const result = emptySyncApplyResult();
  const noteIds: number[] = [];

  if (plan.add.length > 0 && (opts.autoCreateDeck ?? true)) {
    const created = new Set<string>();
    for (const note of plan.add) {
      if (created.has(note.deckName)) continue;
      created.add(note.deckName);
      await client.createDeck(note.deckName);
    }
  }

  for (let i = 0; i < plan.add.length; i += batchSize) {
    const batch = plan.add.slice(i, i + batchSize);
    opts.logger?.debug(`sync: addNotes(${batch.length})`);
    const ids = await client.addNotes(
      batch.map((n) => toAnkiConnectNote(n, opts.allowDuplicate ?? false)),
    );
    batch.forEach((note, j) => {
      const id = ids[j] ?? null;
      if (id === null) {
        result.failed.push({ noteNumber: note.number, reason: "AnkiConnect returned null id" });
      } else {
        result.created++;
        noteIds.push(id);
      }
    });
  }

  // `updateNote` (not `updateNoteFields`) so tags are applied too —
  // AnkiConnect's updateNoteFields ignores the tags field entirely,
  // which would leave cleared tags stale on the note.
  for (let i = 0; i < plan.update.length; i += batchSize) {
    const batch = plan.update.slice(i, i + batchSize);
    opts.logger?.debug(`sync: multi(updateNote x${batch.length})`);
    await client.multi(
      batch.map((u) => ({
        action: "updateNote",
        params: { note: { id: u.id, fields: { ...u.note.fields }, tags: [...u.note.tags] } },
      })),
    );
    result.updated += batch.length;
  }

  const checkpoint = await createCheckpointForNotes(
    plan.add.map((n) => n.deckName),
    noteIds,
    "sync",
    { id: opts.checkpointId },
  );
  result.checkpointId = checkpoint?.id;

  return result;
}

export interface DriftEntry {
  id: number;
  exists: boolean;
}

/**
 * Check which notes recorded in a checkpoint still exist in the collection.
 * Throws when the checkpoint file does not exist.
 */
export async function driftFromCheckpoint(
  checkpointId: string,
  opts: { url?: string; fetchImpl?: typeof fetch } = {},
): Promise<DriftEntry[]> {
  const checkpoint = await loadCheckpoint(checkpointId);
  const client = new AnkiClient({ url: opts.url, fetchImpl: opts.fetchImpl });
  const infos = await client.notesInfo(checkpoint.noteIds);
  return checkpoint.noteIds.map((id, i) => ({ id, exists: infos[i] !== null }));
}
