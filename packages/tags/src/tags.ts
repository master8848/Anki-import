/**
 * Tag utilities: listing, adding, removing collection tags via AnkiConnect.
 */

import type { AnkiClient } from "@anki-xml/anki";
import { chunkArray } from "@anki-xml/utils";

export { parseTagList } from "@anki-xml/utils";

/** Batch size for addTags/removeTags note ids. */
const TAGS_CHUNK_SIZE = 500;

/** List all tags in the collection, sorted. */
export async function listTags(client: AnkiClient): Promise<string[]> {
  return (await client.getTags()).sort();
}

/** Add tags to notes, batching note ids into chunks of 500. */
export async function addTags(
  client: AnkiClient,
  noteIds: number[],
  tags: string[],
): Promise<void> {
  for (const chunk of chunkArray(noteIds, TAGS_CHUNK_SIZE)) {
    await client.addTags(chunk, tags);
  }
}

/** Remove tags from notes, batching note ids into chunks of 500. */
export async function removeTags(
  client: AnkiClient,
  noteIds: number[],
  tags: string[],
): Promise<void> {
  for (const chunk of chunkArray(noteIds, TAGS_CHUNK_SIZE)) {
    await client.removeTags(chunk, tags);
  }
}
