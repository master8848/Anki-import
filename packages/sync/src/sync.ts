/**
 * Sync: apply an import plan to the live collection and record a
 * checkpoint for later rollback or drift detection.
 */

import { AnkiClient } from "@anki-xml/anki";
import { createCheckpoint, loadCheckpoint } from "@anki-xml/checkpoint";
import type { Logger } from "@anki-xml/logger";
import { toAnkiConnectNote, type ImportPlan } from "@anki-xml/planner";

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
  failed: { noteNumber: number; reason: string }[];
  checkpointId?: string;
}

/** Apply a plan: create decks, add notes, update fields, write a checkpoint. */
export async function applyPlan(plan: ImportPlan, opts: SyncApplyOptions = {}): Promise<SyncApplyResult> {
  const batchSize = opts.batchSize ?? 500;
  const client = new AnkiClient({ url: opts.url, fetchImpl: opts.fetchImpl });
  const result: SyncApplyResult = { created: 0, updated: 0, failed: [] };
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
    ids.forEach((id, j) => {
      const note = batch[j] as (typeof batch)[number];
      if (id === null) {
        result.failed.push({ noteNumber: note.number, reason: "AnkiConnect returned null id" });
      } else {
        result.created++;
        noteIds.push(id);
      }
    });
  }

  for (const planned of plan.update) {
    opts.logger?.debug(`sync: updateNoteFields(${planned.id})`);
    await client.updateNoteFields({
      id: planned.id,
      fields: { ...planned.note.fields },
      ...(planned.note.tags.length > 0 && { tags: [...planned.note.tags] }),
    });
    result.updated++;
  }

  const changed = result.created + result.updated;
  if (changed > 0 || opts.checkpointId !== undefined) {
    const decks = new Set(plan.add.map((n) => n.deckName));
    const id = opts.checkpointId ?? `sync-${Date.now()}`;
    const deck = decks.size === 1 ? [...decks][0]! : "";
    await createCheckpoint({ id, deck, noteIds });
    result.checkpointId = id;
  }

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
