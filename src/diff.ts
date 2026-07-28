/**
 * `diff` command: compare a file against the live collection.
 *
 * Returns:
 *   - new: notes in the file that don't exist in the collection
 *   - changed: notes that exist in both but with different fields
 *   - removed: notes in the collection (matching the file's deck/tag)
 *     that aren't in the file
 *   - unchanged: notes that match
 */

import { AnkiConnectClient, type AnkiConnectNoteInfo } from "./anki-connect.ts";
import { parseDocument, validateNotes } from "./xml.ts";
import type { ValidatedNote } from "./types.ts";

export interface DiffOptions {
  inputPath: string;
  ankiConnectUrl?: string;
  fetchImpl?: typeof fetch;
  /** Optional deck filter. */
  deck?: string;
  /** Dry-run only (no calls to change anything). Always true for diff. */
}

export interface DiffResult {
  file: string;
  new: number[];
  changed: number[];
  removed: number[];
  unchanged: number[];
  /** Total notes in the file. */
  fileNoteCount: number;
  /** Total notes in the collection matching the deck filter. */
  collectionNoteCount: number;
}

export async function runDiff(opts: DiffOptions): Promise<DiffResult> {
  const source = await Bun.file(opts.inputPath).text();
  const parsed = parseDocument(source);
  const { notes: validNotes, errors } = validateNotes(
    parsed.notes,
    parsed.defaultDeck,
    source,
  );
  if (errors.length > 0) {
    throw new Error(`cannot diff: file has ${errors.length} validation error(s)`);
  }

  const client = new AnkiConnectClient({
    url: opts.ankiConnectUrl ?? "http://127.0.0.1:8765",
    fetchImpl: opts.fetchImpl,
  });

  // Resolve each file note to an Anki id (only notes with id="..."
  // can be diffed; notes without id are always "new").
  const fileById = new Map<number, ValidatedNote>();
  const fileWithoutId: ValidatedNote[] = [];
  for (const n of validNotes) {
    if (n.id !== undefined) fileById.set(n.id, n);
    else fileWithoutId.push(n);
  }

  // Pull every note id from the collection that's in any of the
  // decks the file references.
  const deckSet = new Set(validNotes.map((n) => n.deckName).filter((d) => d.length > 0));
  const collectionIds = new Set<number>();
  for (const deck of deckSet) {
    const ids = await client.findNotes(`deck:"${deck}"`);
    for (const id of ids) collectionIds.add(id);
  }
  if (opts.deck) {
    const ids = await client.findNotes(`deck:"${opts.deck}"`);
    for (const id of ids) collectionIds.add(id);
  }

  // Pull the collection's note info.
  const collectionInfos: AnkiConnectNoteInfo[] = [];
  if (collectionIds.size > 0) {
    const infos = await client.notesInfo([...collectionIds]);
    for (const info of infos) if (info) collectionInfos.push(info);
  }

  // Compute diff.
  const newIds: number[] = [];
  const changedIds: number[] = [];
  const unchangedIds: number[] = [];
  for (const [id, fileNote] of fileById) {
    const collInfo = collectionInfos.find((c) => c.noteId === id);
    if (!collInfo) {
      newIds.push(id);
      continue;
    }
    if (noteDiffers(fileNote, collInfo)) {
      changedIds.push(id);
    } else {
      unchangedIds.push(id);
    }
  }
  // notes without an id are always new (the agent would create them on import).
  for (const n of fileWithoutId) {
    if (n.id !== undefined) newIds.push(n.id);
  }
  // Build removed list: collection notes matching the file's decks that
  // aren't in the file.
  const fileIdSet = new Set(fileById.keys());
  const removedIds: number[] = [];
  for (const info of collectionInfos) {
    if (!fileIdSet.has(info.noteId)) {
      // Only count as "removed" if the note is in one of the file's decks.
      if (deckSet.size === 0) {
        removedIds.push(info.noteId);
      } else if ([...deckSet].some((d) => info.deckName === d || info.deckName.startsWith(d + "::"))) {
        removedIds.push(info.noteId);
      }
    }
  }

  return {
    file: opts.inputPath,
    new: newIds,
    changed: changedIds,
    removed: removedIds,
    unchanged: unchangedIds,
    fileNoteCount: validNotes.length,
    collectionNoteCount: collectionIds.size,
  };
}

function noteDiffers(fileNote: ValidatedNote, collInfo: AnkiConnectNoteInfo): boolean {
  for (const [name, value] of Object.entries(fileNote.fields)) {
    if (collInfo.fields[name]?.value !== value) return true;
  }
  // Compare tags (sorted whitespace-joined string).
  const fileTags = fileNote.tags.slice().sort().join(" ");
  const collTags = (collInfo.tags ?? []).slice().sort().join(" ");
  if (fileTags !== collTags) return true;
  // Compare deck.
  if (collInfo.deckName !== fileNote.deckName) return true;
  return false;
}
