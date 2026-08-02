/**
 * YAML note parser (yaml package).
 */

import { parse as parseYamlText } from "yaml";
import { structuredToNotes, type StructuredDocument } from "./structured.ts";
import { YamlParseError } from "./errors.ts";
import type { ParsedNote } from "@anki-xml/utils";

/** Parse a YAML document into notes. Never decodes XML entities. */
export function parseYaml(source: string): { notes: ParsedNote[]; defaultDeck: string } {
  let doc: unknown;
  try {
    doc = parseYamlText(source, { merge: true }) as unknown;
  } catch (err) {
    throw new YamlParseError(`Invalid YAML: ${(err as Error).message}`);
  }
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
    throw new YamlParseError("YAML root must be a mapping with a 'notes' list");
  }
  const structured = doc as StructuredDocument;
  if (!Array.isArray(structured.notes)) {
    throw new YamlParseError("YAML document must contain a 'notes' list");
  }
  return structuredToNotes(structured);
}
