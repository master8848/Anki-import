/**
 * Plan pipeline — parse (via plugins) + validate, then build a plan
 * against the live collection. Dry-run preview for import/sync.
 */

import * as fsp from "node:fs/promises";
import { Readable } from "node:stream";
import { buildPlan, type ImportPlan, type PlannerOptions } from "@anki-xml/planner";
import { validateNotes } from "@anki-xml/validation";
import { parseDocument } from "@anki-xml/parser";
import type { NoteValidationError, ParsedNote } from "@anki-xml/utils";
import { applyTransformers, getImporterFor, runValidatorPlugins } from "./plugins/registry.ts";
import type { Logger } from "@anki-xml/logger";

export interface PlanFileOptions extends PlannerOptions {
  stream?: boolean;
  logger?: Logger;
}

export interface PlanFileResult {
  plan: ImportPlan;
  errors: NoteValidationError[];
  warnings: NoteValidationError[];
  noteCount: number;
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
    defaultDeck = parseDocument(source).defaultDeck;
    notes = parseDocument(source).notes.map(applyTransformers);
  } else {
    const source = await fsp.readFile(file, "utf8");
    for await (const note of plugin.parse(Readable.from([source]))) {
      notes.push(applyTransformers(note));
    }
  }

  const validated = validateNotes(notes, defaultDeck);
  const errors = [...validated.errors];
  for (const note of notes) errors.push(...runValidatorPlugins(note));

  if (errors.length > 0) {
    return {
      plan: { add: [], update: [], remove: [], duplicates: [], unchanged: 0 },
      errors,
      warnings: validated.warnings,
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

  return { plan, errors, warnings: validated.warnings, noteCount: notes.length };
}
