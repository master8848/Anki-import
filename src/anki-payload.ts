/**
 * toAddNotePayload helper (R3).
 *
 * Every write command that creates notes builds the same shape:
 *
 *     {
 *       deckName: string,
 *       modelName: string,
 *       fields: Record<string, string>,
 *       tags: string[],
 *       options: { allowDuplicate: boolean },
 *     }
 *
 * This module centralizes that shape so adding a new field (e.g.
 * `audio`, `video`) is a one-file change.
 */

import type { ValidatedNote } from "./types.ts";

export interface AddNotePayload {
  deckName: string;
  modelName: string;
  fields: Record<string, string>;
  tags: string[];
  options: { allowDuplicate: boolean };
}

/** Map a ValidatedNote into the AnkiConnect addNotes payload shape. */
export function toAddNotePayload(
  note: ValidatedNote,
  opts: { allowDuplicate?: boolean } = {},
): AddNotePayload {
  return {
    deckName: note.deckName,
    modelName: note.modelName,
    fields: { ...note.fields },
    tags: [...note.tags],
    options: { allowDuplicate: opts.allowDuplicate ?? false },
  };
}

/** Bulk version — returns one payload per note. */
export function toAddNotePayloads(
  notes: ValidatedNote[],
  opts: { allowDuplicate?: boolean } = {},
): AddNotePayload[] {
  return notes.map((n) => toAddNotePayload(n, opts));
}