/**
 * `delete` command — bulk note removal.
 *
 * Use with care: deletes are not undoable via AnkiConnect. The agent
 * should `export` first and commit the backup to a real VCS.
 */

import { AnkiConnectClient } from "./anki-connect.ts";

export interface DeleteOptions {
  ankiConnectUrl?: string;
  /** Anki search query. */
  query?: string;
  /** Restrict to a deck (subtree match). */
  deck?: string;
  /** Tag match. Repeatable via --tag (caller must collect them). */
  tags?: string[];
  /** Note ids to delete. */
  ids?: number[];
  fetchImpl?: typeof fetch;
  /** When true, don't contact AnkiConnect. */
  dryRun?: boolean;
}

export interface DeleteResult {
  matched: number;
  deleted: number;
  noteIds: number[];
}

export async function runDelete(opts: DeleteOptions): Promise<DeleteResult> {
  const client = new AnkiConnectClient({
    url: opts.ankiConnectUrl ?? "http://127.0.0.1:8765",
    fetchImpl: opts.fetchImpl,
  });

  let noteIds: number[];
  if (opts.ids && opts.ids.length > 0) {
    noteIds = opts.ids;
  } else {
    let query = opts.query ?? "";
    if (!query && opts.deck) query = `deck:"${opts.deck}"`;
    if (opts.tags && opts.tags.length > 0) {
      const tagClause = opts.tags.map((t) => `tag:${t}`).join(" ");
      query = query ? `${query} ${tagClause}` : tagClause;
    }
    if (!query) {
      throw new Error("delete requires one of: --query, --deck, --tag (repeatable), or --ids");
    }
    noteIds = await client.findNotes(query);
  }

  if (noteIds.length === 0) {
    return { matched: 0, deleted: 0, noteIds: [] };
  }
  if (opts.dryRun) {
    return { matched: noteIds.length, deleted: noteIds.length, noteIds };
  }
  await client.deleteNotes(noteIds);
  return { matched: noteIds.length, deleted: noteIds.length, noteIds };
}
