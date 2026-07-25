/**
 * Deck operations: rename-deck, delete-deck, move-notes.
 */

import { AnkiConnectClient } from "./anki-connect.ts";

export interface RenameDeckOptions {
  ankiConnectUrl?: string;
  oldName: string;
  newName: string;
  fetchImpl?: typeof fetch;
  dryRun?: boolean;
}

export async function runRenameDeck(opts: RenameDeckOptions): Promise<{ oldName: string; newName: string }> {
  if (opts.dryRun) {
    return { oldName: opts.oldName, newName: opts.newName };
  }
  const client = new AnkiConnectClient({
    url: opts.ankiConnectUrl ?? "http://127.0.0.1:8765",
    fetchImpl: opts.fetchImpl,
  });
  await client.renameDeck(opts.oldName, opts.newName);
  return { oldName: opts.oldName, newName: opts.newName };
}

export interface DeleteDeckOptions {
  ankiConnectUrl?: string;
  name: string;
  /** Also delete the cards in the deck. Required by AnkiConnect. */
  cardsToo: boolean;
  fetchImpl?: typeof fetch;
  dryRun?: boolean;
}

export async function runDeleteDeck(opts: DeleteDeckOptions): Promise<{ name: string; cardsToo: boolean }> {
  if (opts.dryRun) {
    return { name: opts.name, cardsToo: opts.cardsToo };
  }
  const client = new AnkiConnectClient({
    url: opts.ankiConnectUrl ?? "http://127.0.0.1:8765",
    fetchImpl: opts.fetchImpl,
  });
  await client.deleteDeck(opts.name, opts.cardsToo);
  return { name: opts.name, cardsToo: opts.cardsToo };
}

export interface MoveNotesOptions {
  ankiConnectUrl?: string;
  query: string;
  deck: string;
  fetchImpl?: typeof fetch;
  dryRun?: boolean;
}

export async function runMoveNotes(opts: MoveNotesOptions): Promise<{ moved: number; noteIds: number[] }> {
  const client = new AnkiConnectClient({
    url: opts.ankiConnectUrl ?? "http://127.0.0.1:8765",
    fetchImpl: opts.fetchImpl,
  });
  const noteIds = await client.findNotes(opts.query);
  if (noteIds.length === 0) {
    return { moved: 0, noteIds: [] };
  }
  if (opts.dryRun) {
    return { moved: noteIds.length, noteIds };
  }
  await client.moveNotesToDeck(noteIds, opts.deck);
  return { moved: noteIds.length, noteIds };
}
