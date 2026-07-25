/**
 * `sync` command: reconcile a file with the live collection.
 *
 * After diff, sync applies the changes:
 *   - new:    createNotes
 *   - changed: updateNoteFields
 *   - removed: deleteNotes
 *
 * The command refuses to run without --yes (or explicit --dry-run)
 * because deletion is permanent.
 */

import { AnkiConnectClient } from "./anki-connect.ts";
import { parseDocument, validateNotes } from "./xml.ts";
import { runDiff } from "./diff.ts";

export interface SyncOptions {
  inputPath: string;
  ankiConnectUrl?: string;
  fetchImpl?: typeof fetch;
  yes?: boolean;
  dryRun?: boolean;
  deck?: string;
}

export interface SyncResult {
  diff: Awaited<ReturnType<typeof runDiff>>;
  created: number;
  updated: number;
  deleted: number;
}

export async function runSync(opts: SyncOptions): Promise<SyncResult> {
  if (!opts.yes && !opts.dryRun) {
    throw new Error("refusing to sync without --yes (or pass --dry-run to preview). Diff first with 'anki-xml diff'.");
  }

  const source = await Bun.file(opts.inputPath).text();
  const parsed = parseDocument(source);
  const { notes: validNotes, errors } = validateNotes(
    parsed.notes,
    parsed.defaultDeck,
    source,
  );
  if (errors.length > 0) {
    throw new Error(`cannot sync: file has ${errors.length} validation error(s)`);
  }

  const diff = await runDiff({
    inputPath: opts.inputPath,
    ankiConnectUrl: opts.ankiConnectUrl,
    fetchImpl: opts.fetchImpl,
    deck: opts.deck,
  });

  if (opts.dryRun) {
    return { diff, created: 0, updated: 0, deleted: 0 };
  }

  const client = new AnkiConnectClient({
    url: opts.ankiConnectUrl ?? "http://127.0.0.1:8765",
    fetchImpl: opts.fetchImpl,
  });

  // 1. Create new notes.
  let created = 0;
  const newFileNotes = validNotes.filter((n) => diff.new.includes(n.id ?? -1));
  if (newFileNotes.length > 0) {
    const payloads = newFileNotes.map((n) => ({
      deckName: n.deckName,
      modelName: n.modelName,
      fields: n.fields,
      tags: n.tags,
      options: { allowDuplicate: false },
    }));
    const ids = await client.addNotes(payloads);
    created = ids.filter((id) => id !== null).length;
  }

  // 2. Update changed notes.
  let updated = 0;
  for (const id of diff.changed) {
    const fileNote = validNotes.find((n) => n.id === id);
    if (!fileNote) continue;
    await client.updateNoteFields(id, fileNote.fields);
    updated++;
  }

  // 3. Delete removed notes.
  let deleted = 0;
  if (diff.removed.length > 0) {
    await client.deleteNotes(diff.removed);
    deleted = diff.removed.length;
  }

  return { diff, created, updated, deleted };
}
