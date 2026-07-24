/**
 * Standalone validation: parse + structural validate, no network.
 *
 * Same parser + validator used by `import`, but without touching
 * AnkiConnect. This is the cheapest feedback loop for AI-generated
 * XML: catch malformed files before they ever reach the network.
 *
 * The command is wired into the CLI by `runValidate` in `src/index.ts`.
 */

import * as fs from "node:fs/promises";
import { parseDocument, validateNotes, XmlParseError } from "./xml.ts";
import type { NoteValidationError } from "./types.ts";

export interface ValidateOptions {
  filePath: string;
  /** Treat warnings as errors. Off by default. */
  strict?: boolean;
}

export interface ValidateReport {
  file: string;
  valid: boolean;
  /** Total `<note>` elements found in the document. */
  noteCount: number;
  /** Validation errors. Empty array means the file is import-ready. */
  errors: NoteValidationError[];
  /** Non-fatal problems (e.g. malformed tags). */
  warnings: NoteValidationError[];
  /** Unique deck names referenced by valid notes. */
  decks: string[];
}

/**
 * Read an XML file, parse it, and run structural validation.
 *
 * Throws `XmlParseError` for malformed XML or missing root. Validation
 * errors and warnings are returned in the report rather than thrown so
 * callers can show the full picture at once.
 */
export async function runValidate(opts: ValidateOptions): Promise<ValidateReport> {
  const source = await fs.readFile(opts.filePath, "utf8");

  // parseDocument throws XmlParseError for malformed XML / wrong root;
  // let those propagate so the CLI can map them to exit code 2.
  const parsed = parseDocument(source);

  const { notes: validNotes, errors, warnings } = validateNotes(
    parsed.notes,
    parsed.defaultDeck,
  );

  const decks = [
    ...new Set(validNotes.map((n) => n.deckName).filter((d) => d.length > 0)),
  ];

  // Strict mode promotes warnings to errors. The CLI surface is just
  // an exit-code switch; the agent sees the same report shape.
  const effectiveErrors = opts.strict ? [...errors, ...warnings] : errors;
  const effectiveWarnings = opts.strict ? [] : warnings;

  return {
    file: opts.filePath,
    valid: effectiveErrors.length === 0,
    noteCount: parsed.notes.length,
    errors: effectiveErrors,
    warnings: effectiveWarnings,
    decks,
  };
}

// Re-export for callers that want to distinguish parse failures from
// validation failures without importing from src/xml.ts.
export { XmlParseError };