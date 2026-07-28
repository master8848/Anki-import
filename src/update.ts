/**
 * `update` command: change the fields of existing notes.
 *
 * Three input modes:
 *   1. --id <noteId>  --field Name="value" ...
 *      Edit a single note from the command line.
 *   2. --ids "1,2,3" --file updates.xml
 *      Map ids to <note> elements in document order.
 *   3. --file updates.xml (each <note> carries id="...")
 *      Self-describing file format; preferred for AI workflows.
 *
 * Update semantics:
 *   - Only the fields you name are changed. Unnamed fields keep their
 *     existing Anki content.
 *   - Tags are NOT touched by update (use a separate command if needed).
 *   - Validation: if the XML file fails to parse, abort with diagnostics.
 *   - Atomicity: if ANY update fails, the others are still attempted
 *     (unlike `import`, which is strictly atomic). This matches Anki's
 *     own model where a single bad field value shouldn't block the
 *     rest of a bulk update.
 *   - Dry-run: validate and report, do not call updateNoteFields.
 */

import * as fs from "node:fs/promises";
import { AnkiConnectClient } from "./anki-connect.ts";
import { parseDocument, XmlParseError } from "./xml.ts";

/** A single field update: which Anki field to overwrite and with what. */
export interface FieldUpdate {
  name: string;
  value: string;
}

export interface UpdateEntry {
  /** Anki note id to update. */
  noteId: number;
  /** Fields to replace, in document order. */
  fields: FieldUpdate[];
}

export interface UpdateOptions {
  ankiConnectUrl: string;
  fetchImpl?: typeof fetch;
  /** Pre-built list of (noteId, fields) updates. */
  entries: UpdateEntry[];
  /** Validate only; do not call AnkiConnect. */
  dryRun?: boolean;
}

export interface UpdateResult {
  attempted: number;
  updated: number;
  failed: { noteId: number; reason: string }[];
}

/**
 * Parse an XML file in which each <note> carries an `id` attribute and
 * at least one field. The result is a list of UpdateEntry.
 *
 * Update files deliberately *do not* require a `deck` attribute on
 * `<anki>` or `<note>` because the deck of an existing note is not
 * being changed by this command. We do, however, still need to know
 * the model name to translate XML field tags to Anki display names,
 * so the `type` attribute on each `<note>` is still required.
 *
 * We reuse the same `parseDocument` for tokenization/PCDATA safety,
 * then walk the parsed tree directly instead of going through
 * `validateNotes` (which would reject updates for missing deck).
 */
export async function loadUpdatesFromXml(path: string): Promise<UpdateEntry[]> {
  const source = await fs.readFile(path, "utf8");
  const parsed = parseDocument(source);
  if (parsed.notes.length === 0) {
    throw new XmlParseError(`No <note> elements found in ${path}`);
  }

  // Structural validation: every note must have a type attribute, and
  // the model must be one of the supported built-ins so we can map
  // XML field names to Anki display names.
  for (const n of parsed.notes) {
    if (!n.type) {
      throw new XmlParseError(
        `Note ${n.number} in ${path} is missing a required type="..." attribute`,
      );
    }
  }

  const entries: UpdateEntry[] = [];
  for (const note of parsed.notes) {
    const id = extractNoteIdFromSource(source, note.number);
    if (id === null) {
      throw new XmlParseError(
        `Note ${note.number} in ${path} is missing a required id="..." attribute`,
      );
    }
    if (note.fields.length === 0) {
      throw new XmlParseError(
        `Note ${note.number} in ${path} has no fields to update`,
      );
    }
    const fieldUpdates: FieldUpdate[] = [];
    for (const f of note.fields) {
      const displayName = displayFieldName(note.type, f.name);
      fieldUpdates.push({ name: displayName, value: f.html });
    }
    entries.push({ noteId: id, fields: fieldUpdates });
  }
  return entries;
}

/**
 * Extract the `id` attribute of the Nth (1-based) `<note>` element from
 * the raw XML source. Used because parseNotes doesn't preserve it.
 */
function extractNoteIdFromSource(source: string, oneBased: number): number | null {
  let count = 0;
  const re = /<note\b([^>]*)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    count++;
    if (count === oneBased) {
      const attrs = m[1] ?? "";
      const idMatch = /\bid\s*=\s*"([^"]+)"/.exec(attrs);
      if (!idMatch) return null;
      const n = Number(idMatch[1]);
      return Number.isFinite(n) && Number.isInteger(n) ? n : null;
    }
  }
  return null;
}

/**
 * Translate a lowercase XML field tag to the Anki display name for the
 * given built-in model. Returns the input unchanged for unknown
 * combinations (e.g. a custom model where the user wrote the display
 * name directly in the XML).
 */
export function displayFieldName(modelName: string, xmlField: string): string {
  if (modelName === "Cloze") {
    if (xmlField === "text") return "Text";
    if (xmlField === "extra") return "Extra";
    return xmlField;
  }
  // All other built-in models use "Front" and "Back".
  if (xmlField === "front") return "Front";
  if (xmlField === "back") return "Back";
  if (xmlField === "extra") return "Extra";
  if (xmlField === "addReverse") return "AddReverse";
  return xmlField;
}

export async function runUpdate(opts: UpdateOptions): Promise<UpdateResult> {
  if (opts.entries.length === 0) {
    return { attempted: 0, updated: 0, failed: [] };
  }

  if (opts.dryRun) {
    return {
      attempted: opts.entries.length,
      updated: 0,
      failed: [],
    };
  }

  const client = new AnkiConnectClient({
    url: opts.ankiConnectUrl,
    fetchImpl: opts.fetchImpl,
  });

  const result: UpdateResult = { attempted: opts.entries.length, updated: 0, failed: [] };
  // Run sequentially: bulk AnkiConnect calls are not supported for
  // updateNoteFields, and we want a per-note error to not abort the
  // rest of the batch.
  for (const entry of opts.entries) {
    try {
      const fields: Record<string, string> = {};
      for (const f of entry.fields) fields[f.name] = f.value;
      await client.updateNoteFields(entry.noteId, fields);
      result.updated++;
    } catch (err) {
      result.failed.push({
        noteId: entry.noteId,
        reason: (err as Error).message,
      });
    }
  }
  return result;
}

/** Render an UpdateResult as a human-friendly text block. */
export function renderUpdate(result: UpdateResult): string {
  const lines: string[] = [];
  lines.push(`Attempted: ${result.attempted}`);
  lines.push(`Updated:   ${result.updated}`);
  if (result.failed.length > 0) {
    lines.push(`Failed:    ${result.failed.length}`);
    for (const f of result.failed) {
      lines.push(`  Note ${f.noteId}: ${f.reason}`);
    }
  }
  return lines.join("\n");
}
