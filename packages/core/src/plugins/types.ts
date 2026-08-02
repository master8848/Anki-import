/**
 * Plugin API — extension points for the import pipeline.
 *
 *   registerImporter("yaml", importer)
 *   registerExporter("json", exporter)
 *   registerValidator("my-rules", validator)
 *   registerTransformer("cloze", transformer)
 *
 * Built-in importers (xml/yaml/json/csv/markdown) are registered by
 * default. XML remains the canonical format; plugins map other formats
 * onto the same in-memory note model.
 */

import type { Readable } from "node:stream";
import type { ParsedNote, NoteValidationError, ValidatedNote } from "@anki-xml/utils";

/** Parses an input stream into notes. `supports` matches file extensions. */
export interface ImportPlugin {
  name: string;
  supports(ext: string): boolean;
  parse(input: Readable): AsyncIterable<ParsedNote>;
}

/** Serializes validated notes to a format string. */
export interface ExporterPlugin {
  name: string;
  supports(format: string): boolean;
  export(notes: ValidatedNote[]): string;
}

/** Extra per-note rules run after built-in validation. */
export interface ValidatorPlugin {
  name: string;
  validate(note: ParsedNote): NoteValidationError[];
}

/** Rewrites parsed notes before validation. */
export interface TransformerPlugin {
  name: string;
  transform(note: ParsedNote): ParsedNote;
}
