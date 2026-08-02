/**
 * Dry-run planning: compare validated notes against the live collection
 * and produce add/update/remove/duplicate sets without mutating anything.
 */

import { AnkiClient } from "@anki-xml/anki";
import type { Logger } from "@anki-xml/logger";
import type { AnkiConnectNote, ValidatedNote } from "@anki-xml/utils";

/** Convert a validated note into an AnkiConnect addNotes payload. */
export function toAnkiConnectNote(note: ValidatedNote, allowDuplicate = false): AnkiConnectNote {
  return {
    deckName: note.deckName,
    modelName: note.modelName,
    fields: { ...note.fields },
    tags: [...note.tags],
    options: { allowDuplicate },
  };
}

export interface PlannedUpdate {
  id: number;
  note: ValidatedNote;
  /** Field display names whose values differ from the collection. */
  changedFields: string[];
}

export interface ImportPlan {
  add: ValidatedNote[];
  update: PlannedUpdate[];
  /** Reserved for future removal support; always empty for now. */
  remove: { id: number }[];
  duplicates: ValidatedNote[];
  unchanged: number;
}

export interface PlannerOptions {
  url?: string;
  fetchImpl?: typeof fetch;
  batchSize?: number;
  allowDuplicate?: boolean;
  logger?: Logger;
}

function sameTags(a: string[], b: string[]): boolean {
  const sa = [...a].sort();
  const sb = [...b].sort();
  if (sa.length !== sb.length) return false;
  return sa.every((t, i) => t === sb[i]);
}

function changedFieldKeys(
  note: ValidatedNote,
  fields: Record<string, { value: string; order: number }>,
): string[] {
  const out: string[] = [];
  for (const [name, value] of Object.entries(note.fields)) {
    if (fields[name]?.value !== value) out.push(name);
  }
  return out;
}

/**
 * Build an import plan for validated notes against the live collection.
 *
 * Notes with an `id` are update targets; `notesInfo` decides between
 * update, unchanged, or (when missing from the collection) add. Notes
 * without an `id` are candidates gated by `canAddNotes`.
 */
export async function buildPlan(
  notes: ValidatedNote[],
  opts: PlannerOptions = {},
): Promise<ImportPlan> {
  const batchSize = opts.batchSize ?? 500;
  const client = new AnkiClient({ url: opts.url, fetchImpl: opts.fetchImpl });

  const targets = notes.filter((n): n is ValidatedNote & { id: number } => n.id !== undefined);
  const candidates = notes.filter((n) => n.id === undefined);
  const plan: ImportPlan = { add: [], update: [], remove: [], duplicates: [], unchanged: 0 };
  const missingTargets: ValidatedNote[] = [];

  for (let i = 0; i < targets.length; i += batchSize) {
    const batch = targets.slice(i, i + batchSize);
    opts.logger?.debug(`plan: notesInfo(${batch.length})`);
    const infos = await client.notesInfo(batch.map((n) => n.id));
    infos.forEach((info, j) => {
      const note = batch[j]!;
      if (info === null) {
        missingTargets.push({ ...note, id: undefined });
        opts.logger?.debug(`plan: note ${note.number} missing in collection -> add`);
        return;
      }
      const changedFields = changedFieldKeys(note, info.fields);
      const sameModel = note.modelName === info.modelName;
      const sameDeck = info.deckName === undefined || info.deckName === note.deckName;
      const sameTagsArr = sameTags(note.tags, info.tags);
      if (sameModel && sameDeck && sameTagsArr && changedFields.length === 0) {
        plan.unchanged++;
        return;
      }
      plan.update.push({ id: note.id, note, changedFields });
      opts.logger?.debug(`plan: note ${note.number} differs -> update`);
    });
  }

  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = candidates.slice(i, i + batchSize);
    opts.logger?.debug(`plan: canAddNotes(${batch.length})`);
    const results = await client.canAddNotes(
      batch.map((n) => toAnkiConnectNote(n, opts.allowDuplicate)),
    );
    results.forEach((ok, j) => {
      const note = batch[j]!;
      if (ok) plan.add.push(note);
      else plan.duplicates.push(note);
    });
  }

  plan.add.push(...missingTargets);
  return plan;
}
