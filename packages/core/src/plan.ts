/**
 * Plan pipeline — parse (via plugins) + validate, then build a plan
 * against the live collection. Dry-run preview for import/sync.
 */

import * as fsp from "node:fs/promises";
import { Readable } from "node:stream";
import { buildPlan, type ImportPlan, type PlannerOptions } from "@anki-xml/planner";
import { validateNotes } from "@anki-xml/validation";
import { parseDocument } from "@anki-xml/parser";
import type { NoteValidationError, ParsedNote, ValidatedNote } from "@anki-xml/utils";
import { applyTransformers, getImporterFor, runValidatorPlugins } from "./plugins/registry.ts";
import type { Logger } from "@anki-xml/logger";

export interface PlanFileOptions extends PlannerOptions {
  stream?: boolean;
  /** Fill empty decks with this value. */
  deck?: string;
  /** Fill empty model types with this value. */
  model?: string;
  logger?: Logger;
}

export interface PlanFileResult {
  plan: ImportPlan;
  errors: NoteValidationError[];
  warnings: NoteValidationError[];
  validated: ValidatedNote[];
  noteCount: number;
}

/** Apply CLI-level deck/model overrides to notes that lack them. */
export function applyOverrides(
  notes: ParsedNote[],
  opts: { deck?: string; model?: string },
): void {
  for (const note of notes) {
    if (opts.deck && !note.deck) note.deck = opts.deck;
    if (opts.model && !note.type) note.type = opts.model;
  }
}

export function emptyPlan(): ImportPlan {
  return { add: [], update: [], remove: [], duplicates: [], unchanged: 0 };
}

/** Validate notes and append validator-plugin errors. */
export function validateWithPlugins(
  notes: ParsedNote[],
  defaultDeck: string,
  source?: string,
): { notes: ValidatedNote[]; errors: NoteValidationError[]; warnings: NoteValidationError[] } {
  const result = validateNotes(notes, defaultDeck, source);
  for (const note of notes) result.errors.push(...runValidatorPlugins(note));
  return result;
}

/** Parse + validate a file (any registered format), then plan it. */
export async function planFile(
  file: string,
  opts: PlanFileOptions = {},
): Promise<PlanFileResult> {
  const logger = opts.logger;
  const plugin = getImporterFor(file);
  if (!plugin) {
    throw new Error(
      `Unsupported file format: ${file} (expected .xml, .yaml, .yml, .json, .csv, .md — or register an importer plugin)`,
    );
  }

  let notes: ParsedNote[] = [];
  let defaultDeck = "";
  if (plugin.name === "xml" && opts.stream) {
    const { parseXmlFileStream } = await import("@anki-xml/parser");
    for await (const note of parseXmlFileStream(file)) {
      notes.push(applyTransformers(note));
    }
  } else if (plugin.name === "xml") {
    const source = await fsp.readFile(file, "utf8");
    const parsed = parseDocument(source);
    defaultDeck = parsed.defaultDeck;
    notes = parsed.notes.map(applyTransformers);
  } else {
    const source = await fsp.readFile(file, "utf8");
    for await (const note of plugin.parse(Readable.from([source]))) {
      notes.push(applyTransformers(note));
    }
  }

  applyOverrides(notes, opts);

  const validated = validateWithPlugins(notes, defaultDeck);

  if (validated.errors.length > 0) {
    return {
      plan: emptyPlan(),
      errors: validated.errors,
      warnings: validated.warnings,
      validated: [],
      noteCount: notes.length,
    };
  }

  logger?.debug(`Planning ${validated.notes.length} notes against the collection...`);
  const plan = await buildPlan(validated.notes, {
    url: opts.url,
    fetchImpl: opts.fetchImpl,
    batchSize: opts.batchSize,
    allowDuplicate: opts.allowDuplicate,
    logger,
  });

  return {
    plan,
    errors: validated.errors,
    warnings: validated.warnings,
    validated: validated.notes,
    noteCount: notes.length,
  };
}
