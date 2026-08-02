/**
 * YAML / JSON structured note parser.
 *
 * Canonical shape:
 *   deck: Japanese
 *   model: Basic
 *   tags: vocab
 *   notes:
 *     - front: ...
 *       back: ...
 *       tags: greetings        # optional per-note
 *       deck: Japanese         # optional per-note
 *       model: Basic           # optional per-note
 *
 * Field values are passed to Anki as-is (raw text). XML is still the
 * canonical interchange format; these parsers only produce the same
 * in-memory model.
 */

import type { ParsedField, ParsedNote } from "@anki-xml/utils";

export interface StructuredNote {
  deck?: string;
  model?: string;
  tags?: string | string[];
  [field: string]: unknown;
}

export interface StructuredDocument {
  deck?: string;
  model?: string;
  tags?: string | string[];
  notes: StructuredNote[];
}

const SPECIAL_KEYS = new Set(["deck", "model", "tags", "notes"]);

function coerceTags(raw: string | string[] | undefined): string {
  if (raw === undefined) return "";
  if (Array.isArray(raw)) return raw.filter((t) => typeof t === "string").join(" ");
  return String(raw);
}

export function structuredToNotes(doc: StructuredDocument): {
  notes: ParsedNote[];
  defaultDeck: string;
} {
  const defaultDeck = doc.deck ?? "";
  const defaultModel = doc.model ?? "Basic";
  const defaultTags = coerceTags(doc.tags);

  const notes: ParsedNote[] = [];
  const arr = Array.isArray(doc.notes) ? doc.notes : [];
  for (let i = 0; i < arr.length; i++) {
    const raw = arr[i];
    if (raw === null || typeof raw !== "object") continue;
    const rec = raw as StructuredNote;
    const fields: ParsedField[] = [];
    for (const [key, value] of Object.entries(rec)) {
      if (SPECIAL_KEYS.has(key)) continue;
      if (value === undefined || value === null) continue;
      fields.push({ name: key, html: typeof value === "string" ? value : JSON.stringify(value) });
    }
    const note: ParsedNote = {
      number: i + 1,
      type: rec.model ?? defaultModel,
      deck: rec.deck ?? defaultDeck,
      tags: coerceTags(rec.tags) || defaultTags,
      fields,
      unknownElements: [],
    };
    notes.push(note);
  }
  return { notes, defaultDeck };
}
