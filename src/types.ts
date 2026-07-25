/**
 * Internal types for anki-xml.
 *
 * Scope: this CLI v1 supports the five built-in Anki note types that ship
 * with every fresh Anki install:
 *
 *   - "Basic"
 *   - "Basic (and reversed card)"
 *   - "Basic (optional reversed card)"
 *   - "Basic (type in the answer)"
 *   - "Cloze"
 *
 * Custom note types are explicitly out of scope.
 *
 * Naming conventions:
 *   - "Model" / `modelName` refer to the Anki note type identifier as it
 *     appears in Anki's "Note Type" dropdown. We use this in the XML
 *     schema as the value of `<note type="...">`.
 *   - "Field" refers to a single field of a note (e.g. Front, Back).
 *   - "Tag" refers to user-applied labels visible in the Anki browser.
 */

/** The five supported Anki note types. */
export type SupportedModel =
  | "Basic"
  | "Basic (and reversed card)"
  | "Basic (optional reversed card)"
  | "Basic (type in the answer)"
  | "Cloze";

/** Names of the XML field tags allowed inside `<note>`. */
export type XmlFieldName =
  | "front"
  | "back"
  | "text"
  | "extra"
  | "addReverse";

/** A single note parsed from the XML document, before validation. */
export interface ParsedNote {
  /** 1-based index across the document, used for human-friendly error messages. */
  number: number;
  /**
   * Optional `id` attribute on `<note>`. When present and positive,
   * the note is treated as an UPDATE against an existing Anki note
   * with that id; when absent, the note is created fresh.
   *
   * Quickstart: leave the attribute off for new cards. The custom
   * flag `--update-existing` (Phase 4) lets a single import target
   * existing notes by id without mixing the two cases accidentally.
   * For now, a note with `id="N"` is skipped on import — use
   * `anki-xml update --id N --field ...` for explicit updates.
   */
  id?: number;
  /** Raw `type` attribute value. Empty string when missing. */
  type: string;
  /** Per-note `deck` override. Empty string when absent (caller falls back to document default). */
  deck: string;
  /** Raw `tags` attribute (whitespace-separated). Empty string when absent. */
  tags: string;
  /** Inner fields, in document order. */
  fields: ParsedField[];
  /**
   * Source offset of the `<note>` start tag. Used by the validator
   * to compute line/column for error messages.
   */
  sourceOffset?: number;
  /**
   * Source offsets for each field, in the same order as `fields`.
   * Lets the validator point at the precise field that failed.
   */
  fieldSourceOffsets?: number[];
}

/** A field inside a `<note>`. */
export interface ParsedField {
  name: XmlFieldName;
  /**
   * Raw HTML string to be embedded into the Anki field. For CDATA sections
   * the inner text has been lightly escaped so HTML special characters are
   * safe without double-escaping existing entities.
   */
  html: string;
}

/** A validation problem attached to a specific note. */
export interface NoteValidationError {
  noteNumber: number;
  message: string;
  /** 1-based line number in the source file. Absent when unknown. */
  line?: number;
  /** 1-based column number in the source file. Absent when unknown. */
  column?: number;
}

/** A note that has passed validation and is ready for AnkiConnect. */
export interface ValidatedNote {
  number: number;
  /** Optional id (only set when the source `<note>` had `id="N"`). */
  id?: number;
  deckName: string;
  modelName: SupportedModel;
  fields: Record<string, string>;
  tags: string[];
}

/** Output of validating an entire document. */
export interface ValidationResult {
  notes: ValidatedNote[];
  errors: NoteValidationError[];
  /**
   * Non-fatal problems found during validation. The CLI surfaces these
   * as warnings unless `--strict` is passed.
   *
   * Currently used for tag-format issues (commas inside tags, very long
   * tags, control characters). The list is empty when no problems are
   * found.
   */
  warnings: NoteValidationError[];
}

/** Payload structure for AnkiConnect's `addNotes` API. */
export interface AnkiConnectNote {
  deckName: string;
  modelName: SupportedModel;
  fields: Record<string, string>;
  tags: string[];
  options: {
    allowDuplicate: boolean;
  };
}

/** Generic AnkiConnect JSON-RPC response envelope. */
export interface AnkiConnectResponse<T> {
  result: T | null;
  error: string | null;
}

/** Result of importing a validated batch. */
export interface ImportResult {
  /** Number of notes AnkiConnect reported as added. */
  created: number;
  /** Number of notes that AnkiConnect rejected (with reasons). */
  failed: { noteNumber: number; reason: string }[];
}