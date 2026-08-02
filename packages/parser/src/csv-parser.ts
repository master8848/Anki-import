/**
 * CSV note parser.
 *
 * Header row defines fields; `deck`, `model`, `tags` are special columns.
 * Example:
 *   deck,model,front,back,tags
 *   Japanese,Basic,こんにちは,Hello,greetings
 */

import { parse } from "csv-parse/sync";
import type { ParsedField, ParsedNote } from "@anki-xml/utils";

export interface CsvParseOptions {
  /** Default deck when the file has no `deck` column. */
  defaultDeck?: string;
  /** Default model when the file has no `model` column. */
  defaultModel?: string;
}

const SPECIAL_KEYS = new Set(["deck", "model", "tags"]);

/** Parse CSV text into notes. Never decodes XML entities. */
export function parseCsv(source: string, opts: CsvParseOptions = {}): {
  notes: ParsedNote[];
  defaultDeck: string;
} {
  let rows: Record<string, string>[];
  try {
    rows = parse(source, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    }) as Record<string, string>[];
  } catch (err) {
    throw new Error(`Invalid CSV: ${(err as Error).message}`);
  }

  const defaultDeck = opts.defaultDeck ?? "";
  const defaultModel = opts.defaultModel ?? "Basic";
  const notes: ParsedNote[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const fields: ParsedField[] = [];
    let deck = "";
    let model = "";
    let tags = "";
    for (const [key, value] of Object.entries(row)) {
      if (key === "deck") {
        deck = value;
      } else if (key === "model") {
        model = value;
      } else if (key === "tags") {
        tags = value;
      } else if (!SPECIAL_KEYS.has(key)) {
        fields.push({ name: key, html: value });
      }
    }
    notes.push({
      number: i + 1,
      type: model || defaultModel,
      deck: deck || defaultDeck,
      tags,
      fields,
      unknownElements: [],
    });
  }
  return { notes, defaultDeck };
}
