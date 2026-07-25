/**
 * Schema migration tools.
 *
 * `migrate` is a thin command that applies idempotent transforms to
 * a v1 file or to a live collection. Today it supports:
 *
 *   - `migrate assign-guids <file>`: rewrite the file so every <note>
 *     carries a stable GUID (currently derived from the deck+front
 *     hash). This makes re-imports stable across runs.
 *
 *   - `migrate v1-to-v2 <file>`: no-op for now (v2 doesn't exist
 *     yet). Surfaces a clear message so AI authors learn the path
 *     forward.
 *
 * In the future, v1-to-v2 will re-shape the XML for any v2-only
 * features (P3.7's version attribute, P2.5's id attribute as
 * first-class, etc.).
 */

import * as fs from "node:fs/promises";
import { parseDocument, validateNotes } from "./xml.ts";

export interface MigrateOptions {
  inputPath: string;
  outputPath: string;
  /** Transform name. */
  transform: "assign-guids" | "v1-to-v2";
}

export interface MigrateResult {
  transform: string;
  input: string;
  output: string;
  notesProcessed: number;
}

/**
 * Compute a stable GUID for a note, derived from a hash of
 * (deck, model, sorted field names + values). This is what `assign-guids`
 * writes into the `<note guid="...">` attribute. AnkiConnect uses the
 * GUID to deduplicate notes across machines and import runs.
 */
function guidFor(deck: string, model: string, fields: Record<string, string>): string {
  const sorted = Object.keys(fields).sort();
  const payload = [deck, model, ...sorted.map((k) => `${k}=${fields[k]}`)].join("\u0001");
  // Simple FNV-1a hash, hex-encoded. Not cryptographic; just stable.
  let h = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    h ^= payload.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Mix in 4 more rounds for longer strings.
  for (let i = 0; i < 4; i++) {
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
    h ^= h >>> 15;
  }
  return ("00000000" + (h >>> 0).toString(16)).slice(-8);
}

export async function runMigrate(opts: MigrateOptions): Promise<MigrateResult> {
  const source = await fs.readFile(opts.inputPath, "utf8");

  if (opts.transform === "v1-to-v2") {
    throw new Error(
      "v1-to-v2 migration is a no-op: schema v2 has not been defined. See docs/schema-v2.md for the design spec.",
    );
  }

  // assign-guids
  const parsed = parseDocument(source);
  const { errors } = validateNotes(parsed.notes, parsed.defaultDeck, source);
  if (errors.length > 0) {
    const first = errors[0]!;
    throw new Error(
      `cannot assign-guids: file has ${errors.length} validation error(s). Run 'anki-xml validate ${opts.inputPath}' first. First error: Note ${first.noteNumber}: ${first.message}`,
    );
  }

  // Build the new XML by inserting guid="..." into each <note> start tag.
  // We walk the source string with a regex that finds every <note ...>
  // and rebuilds the attribute list with the GUID appended.
  let output = "";
  let cursor = 0;
  let processed = 0;
  const noteRe = /<note\b([^>]*)>/g;
  let m: RegExpExecArray | null;
  while ((m = noteRe.exec(source)) !== null) {
    output += source.slice(cursor, m.index);
    const attrs = m[1] ?? "";
    // Find the parsed note at this index.
    const noteNumber = countNotesBefore(source, m.index) + 1;
    const note = parsed.notes.find((n) => n.number === noteNumber);
    if (!note) {
      // Shouldn't happen unless the regex matches something the
      // parser didn't.
      output += m[0];
      cursor = m.index + m[0].length;
      continue;
    }
    const { fields, deckName, modelName } = note;
    const ankiFields: Record<string, string> = {};
    if (modelName === "Cloze") {
      const text = note.fields.find((f) => f.name === "text")?.html ?? "";
      const extra = note.fields.find((f) => f.name === "extra")?.html ?? "";
      if (text) ankiFields["Text"] = text;
      if (extra) ankiFields["Extra"] = extra;
    } else {
      const front = note.fields.find((f) => f.name === "front")?.html ?? "";
      const back = note.fields.find((f) => f.name === "back")?.html ?? "";
      if (front) ankiFields["Front"] = front;
      if (back) ankiFields["Back"] = back;
      const extra = note.fields.find((f) => f.name === "extra")?.html ?? "";
      if (extra) ankiFields["Extra"] = extra;
    }
    const guid = guidFor(deckName, modelName, ankiFields);
    const newAttrs = attrs.trimEnd() + ` guid="${guid}"`;
    output += `<note${newAttrs}>`;
    cursor = m.index + m[0].length;
    processed++;
  }
  void fields;
  output += source.slice(cursor);

  await fs.writeFile(opts.outputPath, output, "utf8");
  return {
    transform: opts.transform,
    input: opts.inputPath,
    output: opts.outputPath,
    notesProcessed: processed,
  };
}

function countNotesBefore(source: string, offset: number): number {
  let count = 0;
  const re = /<note\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    if (m.index >= offset) break;
    count++;
  }
  return count;
}
