/**
 * Schema discovery commands (M1).
 *
 * Four read-only commands that let an AI agent learn the live
 * collection's shape without hard-coding it:
 *
 *   - `models`      : list every note model + field names + card templates.
 *   - `fields <model>` : field names for one model (cheap when model known).
 *   - `tags`        : list every tag in use + note count per tag.
 *   - `note-info <id>` : full info on one note by id.
 *
 * These wrap existing AnkiConnect methods (`modelNamesAndIds`,
 * `modelFieldNames`, `getTags`, `notesInfo`). They are pure read
 * operations with no side effects.
 */

import { AnkiConnectClient } from "./anki-connect.ts";

export interface ModelInfo {
  name: string;
  id: number;
  fields: string[];
  templates: { name: string; ord: number }[];
}

export interface TagInfo {
  name: string;
  count: number;
}

export interface NoteFullInfo {
  noteId: number;
  guid: string;
  modelName: string;
  deckName: string;
  fields: Record<string, { value: string; order: number }>;
  tags: string[];
  cards: number[];
  mod: number;
}

export interface SchemaDiscoveryOptions {
  ankiConnectUrl?: string;
  fetchImpl?: typeof fetch;
}

/** List every model with id, field names, and template names. */
export async function fetchModelInfo(
  opts: SchemaDiscoveryOptions,
): Promise<ModelInfo[]> {
  const client = new AnkiConnectClient({
    url: opts.ankiConnectUrl ?? "http://127.0.0.1:8765",
    fetchImpl: opts.fetchImpl,
  });
  const namesAndIds = await client.modelNamesAndIds();
  const out: ModelInfo[] = [];
  for (const entry of namesAndIds) {
    const fields = await client.modelFieldNames(entry.name);
    const templates = await client.modelTemplates(entry.name);
    out.push({
      name: entry.name,
      id: entry.id,
      fields,
      templates: templates.map((t) => ({ name: t.name, ord: t.ord })),
    });
  }
  return out;
}

/** Field names for one model. Returns [] when the model doesn't exist. */
export async function fetchFields(
  modelName: string,
  opts: SchemaDiscoveryOptions,
): Promise<string[]> {
  const client = new AnkiConnectClient({
    url: opts.ankiConnectUrl ?? "http://127.0.0.1:8765",
    fetchImpl: opts.fetchImpl,
  });
  return await client.modelFieldNames(modelName);
}

/** Every tag in use with note counts. */
export async function fetchTagInfo(
  opts: SchemaDiscoveryOptions,
): Promise<TagInfo[]> {
  const client = new AnkiConnectClient({
    url: opts.ankiConnectUrl ?? "http://127.0.0.1:8765",
    fetchImpl: opts.fetchImpl,
  });
  const tags = await client.getTags();
  const out: TagInfo[] = [];
  for (const tag of tags) {
    const ids = await client.findNotes(`tag:${tag}`);
    out.push({ name: tag, count: ids.length });
  }
  return out;
}

/** Full info on one note by id. Returns null when the note doesn't exist. */
export async function fetchNoteInfo(
  noteId: number,
  opts: SchemaDiscoveryOptions,
): Promise<NoteFullInfo | null> {
  const client = new AnkiConnectClient({
    url: opts.ankiConnectUrl ?? "http://127.0.0.1:8765",
    fetchImpl: opts.fetchImpl,
  });
  const infos = await client.notesInfo([noteId]);
  const info = infos[0];
  if (!info) return null;
  const cards = await client.cardsForNote(noteId);
  return {
    noteId: info.noteId,
    guid: info.guid,
    modelName: info.modelName,
    deckName: info.deckName,
    fields: info.fields,
    tags: info.tags ?? [],
    cards,
    mod: info.mod,
  };
}