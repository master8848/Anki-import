/**
 * AnkiConnect payload conversion.
 */

import type { AnkiConnectNote, ValidatedNote } from "./types.ts";

/**
 * Convert a validated note into an AnkiConnect `addNotes` payload.
 * Fields and tags are copied so later mutations cannot leak into the
 * payload; `allowDuplicate` is forwarded to AnkiConnect.
 */
export function toAnkiConnectNote(note: ValidatedNote, allowDuplicate = false): AnkiConnectNote {
  return {
    deckName: note.deckName,
    modelName: note.modelName,
    fields: { ...note.fields },
    tags: [...note.tags],
    options: { allowDuplicate },
  };
}
