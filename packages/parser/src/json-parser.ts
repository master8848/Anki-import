/**
 * JSON note parser — same canonical shape as YAML.
 */

import { structuredToNotes, type StructuredDocument } from "./structured.ts";
import { JsonParseError } from "./errors.ts";
import type { ParsedNote } from "@anki-xml/utils";

/** Parse a JSON document into notes. Never decodes XML entities. */
export function parseJson(source: string): { notes: ParsedNote[]; defaultDeck: string } {
  let doc: unknown;
  try {
    doc = JSON.parse(source);
  } catch (err) {
    throw new JsonParseError(`Invalid JSON: ${(err as Error).message}`);
  }
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
    throw new JsonParseError("JSON root must be an object with a 'notes' list");
  }
  const structured = doc as StructuredDocument;
  if (!Array.isArray(structured.notes)) {
    throw new JsonParseError("JSON document must contain a 'notes' list");
  }
  return structuredToNotes(structured);
}
