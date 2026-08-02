/**
 * Media helpers: store, retrieve, delete files in the Anki collection media folder.
 */

import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import type { AnkiClient } from "@anki-xml/anki";

/** Store raw bytes as a media file. */
export async function storeMedia(
  client: AnkiClient,
  filename: string,
  data: Buffer,
): Promise<string> {
  return client.storeMedia(filename, data);
}

/** Read a file from disk and store it as media, defaulting to its basename. */
export async function storeMediaFile(
  client: AnkiClient,
  filePath: string,
  filename?: string,
): Promise<string> {
  const data = await readFile(filePath);
  return client.storeMedia(filename ?? basename(filePath), data);
}

/** Retrieve a media file as raw bytes. */
export async function retrieveMedia(client: AnkiClient, filename: string): Promise<Buffer> {
  return client.retrieveMedia(filename);
}

/** Retrieve a media file and write it to disk. */
export async function retrieveMediaToFile(
  client: AnkiClient,
  filename: string,
  outPath: string,
): Promise<void> {
  await writeFile(outPath, await client.retrieveMedia(filename));
}

/** Delete a media file. */
export async function deleteMedia(client: AnkiClient, filename: string): Promise<void> {
  await client.deleteMedia(filename);
}

/** List all media files in the collection. */
export async function listMedia(client: AnkiClient): Promise<string[]> {
  return client.mediaList();
}
