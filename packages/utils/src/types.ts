/**
 * Shared types for anki-import.
 * XML remains the canonical interchange format; these types are in-memory only.
 */

/** Supported Anki note type name (built-in or custom). */
export type SupportedModel = string;

/** XML field tag or normalized field key. */
export type XmlFieldName = string;

/** A field inside a `<note>` before validation. */
export interface ParsedField {
  name: XmlFieldName;
  /** Anki display name when provided via `<field name="...">`. */
  displayName?: string;
  /**
   * Raw HTML for the Anki field. Entities are never decoded.
   * CDATA contents are escaped for safe HTML embedding.
   */
  html: string;
}

/** A note parsed from XML, before validation. */
export interface ParsedNote {
  /** 1-based index across the document. */
  number: number;
  /** Optional positive Anki note id (update target). */
  id?: number;
  type: string;
  deck: string;
  /** Whitespace-separated tags attribute, plus any `<tag>` children. */
  tags: string;
  fields: ParsedField[];
  sourceOffset?: number;
  fieldSourceOffsets?: number[];
  unknownElements?: string[];
  /** 1-based line of the `<note>` start tag when known. */
  line?: number;
}

/** A validation problem attached to a specific note. */
export interface NoteValidationError {
  noteNumber: number;
  message: string;
  line?: number;
  column?: number;
}

/** A note that has passed validation and is ready for AnkiConnect. */
export interface ValidatedNote {
  number: number;
  id?: number;
  deckName: string;
  modelName: SupportedModel;
  fields: Record<string, string>;
  tags: string[];
  line?: number;
}

export interface ValidationResult {
  notes: ValidatedNote[];
  errors: NoteValidationError[];
  warnings: NoteValidationError[];
}

export interface AnkiConnectNote {
  deckName: string;
  modelName: SupportedModel;
  fields: Record<string, string>;
  tags: string[];
  options: { allowDuplicate: boolean };
}

export interface AnkiConnectResponse<T> {
  result: T | null;
  error: string | null;
}

export interface ImportResult {
  created: number;
  failed: { noteNumber: number; reason: string }[];
  noteIds: number[];
}

export interface Checkpoint {
  id: string;
  deck: string;
  created: string;
  noteIds: number[];
}

export type LogLevel = "error" | "warn" | "info" | "debug";
