/**
 * `tag` / `untag` commands: bulk tag mutation.
 *
 * Both commands take a query (or --deck) and operate on every note
 * that matches. `tag` adds tags; `untag` removes tags. Both are
 * idempotent.
 */

import { AnkiConnectClient } from "./anki-connect.ts";

export interface TagOptions {
  ankiConnectUrl?: string;
  /** Find notes by Anki search query. */
  query?: string;
  /** Restrict to a deck. */
  deck?: string;
  /** Tags to add (for `tag`) or remove (for `untag`). */
  tags: string[];
  fetchImpl?: typeof fetch;
  /** When true, don't contact AnkiConnect. */
  dryRun?: boolean;
}

export interface TagResult {
  matched: number;
  /** Number of notes whose tags actually changed. */
  modified: number;
  /** Note ids that were (or would be) modified. */
  noteIds: number[];
}

export async function runTag(opts: TagOptions): Promise<TagResult> {
  return runMutate({ ...opts, mode: "add" });
}

export async function runUntag(opts: TagOptions): Promise<TagResult> {
  return runMutate({ ...opts, mode: "remove" });
}

async function runMutate(
  opts: TagOptions & { mode: "add" | "remove" },
): Promise<TagResult> {
  const client = new AnkiConnectClient({
    url: opts.ankiConnectUrl ?? "http://127.0.0.1:8765",
    fetchImpl: opts.fetchImpl,
  });

  const query = opts.query ?? (opts.deck ? `deck:"${opts.deck}"` : "");
  if (!query) {
    throw new Error("Either --query or --deck is required");
  }
  if (opts.tags.length === 0) {
    throw new Error("at least one tag is required");
  }

  const noteIds = await client.findNotes(query);
  if (noteIds.length === 0) {
    return { matched: 0, modified: 0, noteIds: [] };
  }

  if (opts.dryRun) {
    return { matched: noteIds.length, modified: noteIds.length, noteIds };
  }

  const tagString = opts.tags.join(" ");
  if (opts.mode === "add") {
    await client.addTags(noteIds, tagString);
  } else {
    await client.removeTags(noteIds, tagString);
  }
  return { matched: noteIds.length, modified: noteIds.length, noteIds };
}
