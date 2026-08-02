/**
 * Anki-side model introspection — reads note types from the collection
 * via AnkiConnect (through @anki-xml/anki, never directly).
 */

import { AnkiClient } from "@anki-xml/anki";

export interface ModelInfo {
  name: string;
  fields: string[];
}

/** List all models in the collection with their field names. */
export async function listModels(client: AnkiClient): Promise<ModelInfo[]> {
  const names = await client.modelNames();
  const out: ModelInfo[] = [];
  for (const name of names) {
    const fieldList = await client.modelFieldNames(name);
    out.push({ name, fields: fieldList });
  }
  return out;
}

/** Field names of a single model. */
export async function fields(client: AnkiClient, modelName: string): Promise<string[]> {
  return client.modelFieldNames(modelName);
}

/** Template (card) definitions of a single model. */
export async function templates(
  client: AnkiClient,
  modelName: string,
): Promise<Record<string, Record<string, string>>> {
  return client.modelTemplates(modelName);
}
