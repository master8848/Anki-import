/**
 * Dry-run planning: compare validated notes against the live collection
 * and produce add/update/remove/duplicate sets without mutating anything.
 */

import { AnkiClient } from "@anki-xml/anki";
import type { Logger } from "@anki-xml/logger";
import { chunkArray, toAnkiConnectNote } from "@anki-xml/utils";
import type { ValidatedNote } from "@anki-xml/utils";
import { diffNote } from "@anki-xml/diff";

export { toAnkiConnectNote };

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

/** Flatten AnkiConnect notesInfo fields into a ValidatedNote-style record. */
function collectionFields(
  fields: Record<string, { value: string; order: number }>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, f] of Object.entries(fields)) out[name] = f.value;
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

  for (const batch of chunkArray(targets, batchSize)) {
    opts.logger?.debug(`plan: notesInfo(${batch.length})`);
    const infos = await client.notesInfo(batch.map((n) => n.id));
    infos.forEach((info, j) => {
      const note = batch[j];
      if (!note) return;
      if (info === null) {
        missingTargets.push({ ...note, id: undefined });
        opts.logger?.debug(`plan: note ${note.number} missing in collection -> add`);
        return;
      }
      const collectionNote: ValidatedNote = {
        number: note.number,
        id: note.id,
        deckName: info.deckName ?? note.deckName,
        modelName: info.modelName,
        fields: collectionFields(info.fields),
        tags: info.tags,
      };
      const d = diffNote(collectionNote, note);
      // Only field keys the source note actually carries count as edits;
      // fields the collection has but the note omits are not user changes.
      const changedFields = d.changes
        .filter((c) => note.fields[c.field] !== undefined)
        .map((c) => c.field);
      // Tag diffs only count when the source explicitly specified tags.
      // Without a `tags="..."` attribute the parsed tag list is a parser
      // default, not an instruction to change (and wiping would be wrong).
      const tagsChanged = d.tagsChanged !== undefined && note.tagsSpecified === true;
      if (changedFields.length === 0 && !d.deckChanged && !d.modelChanged && !tagsChanged) {
        plan.unchanged++;
        return;
      }
      plan.update.push({ id: note.id, note, changedFields });
      opts.logger?.debug(`plan: note ${note.number} differs -> update`);
    });
  }

  for (const batch of chunkArray(candidates, batchSize)) {
    opts.logger?.debug(`plan: canAddNotes(${batch.length})`);
    const results = await client.canAddNotes(
      batch.map((n) => toAnkiConnectNote(n, opts.allowDuplicate)),
    );
    results.forEach((ok, j) => {
      const note = batch[j];
      if (!note) return;
      if (ok) plan.add.push(note);
      else plan.duplicates.push(note);
    });
  }

  plan.add.push(...missingTargets);
  return plan;
}
