/**
 * Media ingestion (P4.3).
 *
 * Walks the validated notes' field HTML, finds every <img src="...">
 * and [sound:file.mp3] reference, resolves the file relative to the
 * XML file's directory, and uploads each unique file to Anki's
 * media collection via storeMediaFile.
 *
 * This is the simplest "good enough" implementation: it uploads any
 * file referenced by an <img> or [sound:] tag. It does NOT handle
 * inline base64 (use <img src="data:..."> if you want that — Anki
 * accepts the URL form too).
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { AnkiConnectClient } from "./anki-connect.ts";

export interface MediaIngestOptions {
  /** Absolute path to the source XML file (used to resolve relative URLs). */
  sourcePath: string;
  ankiConnectUrl?: string;
  fetchImpl?: typeof fetch;
  /** When true, don't actually upload; just report. */
  dryRun?: boolean;
}

export interface MediaIngestResult {
  /** Resolved media file paths, in upload order. */
  files: string[];
  /** Names as Anki will store them (usually the basename). */
  storedNames: string[];
  /** True when dryRun was set. */
  dryRun: boolean;
}

const IMG_RE = /<img\b[^>]*\bsrc\s*=\s*"([^"]+)"/gi;
const SOUND_RE = /\[sound:([^\]]+)\]/gi;
const DATA_URL = /^data:/i;

export async function ingestMedia(opts: MediaIngestOptions): Promise<MediaIngestResult> {
  const fields: string[] = (opts as unknown as { fields?: string[] }).fields ?? [];
  const refs = new Set<string>();
  for (const html of fields) {
    for (const re of [IMG_RE, SOUND_RE]) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(html)) !== null) refs.add(m[1]!);
    }
  }
  const sourceDir = path.dirname(opts.sourcePath);
  const files: string[] = [];
  for (const ref of refs) {
    if (DATA_URL.test(ref)) continue;
    if (/^https?:/i.test(ref)) continue; // remote URLs are left to Anki
    const resolved = path.isAbsolute(ref) ? ref : path.resolve(sourceDir, ref);
    files.push(resolved);
  }
  if (opts.dryRun) {
    return { files, storedNames: files.map((f) => path.basename(f)), dryRun: true };
  }
  if (files.length === 0) {
    return { files, storedNames: [], dryRun: false };
  }
  const client = new AnkiConnectClient({
    url: opts.ankiConnectUrl ?? "http://127.0.0.1:8765",
    fetchImpl: opts.fetchImpl,
  });
  const storedNames: string[] = [];
  for (const f of files) {
    const data = await fs.readFile(f);
    const base64 = data.toString("base64");
    const name = path.basename(f);
    const stored = await client.storeMediaFile(name, base64);
    storedNames.push(stored);
  }
  return { files, storedNames, dryRun: false };
}

/**
 * Extract media references from a list of field HTML strings. Pure
 * function — does no I/O. Used by the import command to know which
 * files to upload before addNotes.
 */
export function extractMediaRefs(fields: string[]): string[] {
  const refs = new Set<string>();
  for (const html of fields) {
    for (const re of [IMG_RE, SOUND_RE]) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(html)) !== null) refs.add(m[1]!);
    }
  }
  return [...refs];
}
