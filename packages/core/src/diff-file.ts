/**
 * Diff pipeline — compare a file against the live collection:
 * per-note field diffs + deck presence diff.
 */

import { AnkiClient } from "@anki-xml/anki";
import { diffDecks, diffNote, type NoteDiff } from "@anki-xml/diff";
import type { NoteValidationError, ValidatedNote } from "@anki-xml/utils";
import { planFile, type PlanFileOptions, type PlanFileResult } from "./plan.ts";

export interface DiffFileResult {
  noteDiffs: NoteDiff[];
  deckDiff: { missing: string[]; extra: string[] };
  plan: PlanFileResult["plan"];
  errors: NoteValidationError[];
  warnings: NoteValidationError[];
}

/** Diff a file against the collection. */
export async function diffFile(file: string, opts: PlanFileOptions = {}): Promise<DiffFileResult> {
  const planned = await planFile(file, opts);
  if (planned.errors.length > 0) {
    return {
      noteDiffs: [],
      deckDiff: { missing: [], extra: [] },
      plan: planned.plan,
      errors: planned.errors,
      warnings: planned.warnings,
    };
  }

  const noteDiffs: NoteDiff[] = [];
  for (const note of planned.plan.add) {
    noteDiffs.push({ noteNumber: note.number, kind: "added", changes: [] });
  }
  for (const note of planned.plan.duplicates) {
    noteDiffs.push({ noteNumber: note.number, kind: "unchanged", changes: [] });
  }

  const updateIds = planned.plan.update.map((u) => u.id);
  if (updateIds.length > 0) {
    const client = new AnkiClient({ url: opts.url, fetchImpl: opts.fetchImpl });
    const infos = await client.notesInfo(updateIds);
    const byId = new Map(infos.filter((i) => i !== null).map((i) => [i!.noteId, i!]));
    for (const u of planned.plan.update) {
      const info = byId.get(u.id);
      const remote: ValidatedNote = info
        ? {
            number: u.note.number,
            id: info.noteId,
            deckName: info.deckName ?? u.note.deckName,
            modelName: info.modelName,
            fields: Object.fromEntries(
              Object.entries(info.fields).map(([k, v]) => [k, v.value]),
            ),
            tags: [...info.tags],
          }
        : u.note;
      noteDiffs.push(diffNote(u.note, remote));
    }
  }

  const expectedDecks = new Set(
    planned.validated.map((n) => n.deckName).filter((d) => d.length > 0),
  );
  const client = new AnkiClient({ url: opts.url, fetchImpl: opts.fetchImpl });
  const collectionDecks = await client.deckNames();

  return {
    noteDiffs,
    deckDiff: diffDecks(collectionDecks, [...expectedDecks]),
    plan: planned.plan,
    errors: planned.errors,
    warnings: planned.warnings,
  };
}
