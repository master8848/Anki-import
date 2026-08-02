/**
 * YAML note parser (yaml package).
 */

import { parse as parseYamlText } from "yaml";
import { structuredToNotes, type StructuredDocument } from "./structured.ts";
import type { ParsedNote } from "@anki-xml/utils";

/** Parse a YAML document into notes. Never decodes XML entities. */
export function parseYaml(source: string): { notes: ParsedNote[]; defaultDeck: string } {
  const doc = parseYamlText(source, { merge: true }) as unknown;
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
    throw new Error("YAML root must be a mapping with a 'notes' list");
  }
  const structured = doc as StructuredDocument;
  if (!Array.isArray(structured.notes)) {
    throw new Error("YAML document must contain a 'notes' list");
  }
  return structuredToNotes(structured);
}
