/**
 * Import orchestration: parse → transform → validate → batch → AnkiConnect.
 * Input format is resolved through the plugin registry (XML built-in).
 */

import * as fsp from "node:fs/promises";
import { Readable } from "node:stream";
import { AnkiClient } from "@anki-xml/anki";
import { parseDocument, parseXmlFileStream } from "@anki-xml/parser";
import { validateNote } from "@anki-xml/validation";
import { createCheckpointForNotes } from "@anki-xml/checkpoint";
import type { Logger } from "@anki-xml/logger";
import type {
  AnkiConnectNote,
  ImportResult,
  NoteValidationError,
  ParsedNote,
  ValidatedNote,
} from "@anki-xml/utils";
import { applyOverrides, validateWithPlugins } from "../plan.ts";
import {
  applyTransformers,
  getImporterFor,
  runValidatorPlugins,
} from "../plugins/registry.ts";

export interface ImportOptions {
  inputPath: string;
  url?: string;
  fetchImpl?: typeof fetch;
  dryRun?: boolean;
  stream?: boolean;
  batchSize?: number;
  autoCreateDeck?: boolean;
  allowDuplicate?: boolean;
  checkpointId?: string;
  /** Fill empty decks with this value. */
  deck?: string;
  /** Fill empty model types with this value. */
  model?: string;
  logger?: Logger;
}

export interface ImportOutcome {
  result: ImportResult;
  validationErrors: NoteValidationError[];
  warnings: NoteValidationError[];
  validCount: number;
  checkpointId?: string;
}

function toPayload(note: ValidatedNote, allowDuplicate: boolean): AnkiConnectNote {
  return {
    deckName: note.deckName,
    modelName: note.modelName,
    fields: { ...note.fields },
    tags: [...note.tags],
    options: { allowDuplicate },
  };
}

function emptyImportResult(): ImportResult {
  return { created: 0, failed: [], noteIds: [] };
}

async function flushBatch(
  client: AnkiClient,
  batch: ValidatedNote[],
  allowDuplicate: boolean,
  autoCreateDeck: boolean,
  createdDecks: Set<string>,
  result: ImportResult,
): Promise<void> {
  if (batch.length === 0) return;

  if (autoCreateDeck) {
    for (const n of batch) {
      if (!createdDecks.has(n.deckName)) {
        await client.createDeck(n.deckName);
        createdDecks.add(n.deckName);
      }
    }
  }

  const payloads = batch.map((n) => toPayload(n, allowDuplicate));
  const ids = await client.addNotes(payloads);
  for (let i = 0; i < batch.length; i++) {
    const id = ids[i] ?? null;
    const note = batch[i];
    if (note === undefined) continue;
    if (id === null) {
      result.failed.push({
        noteNumber: note.number,
        reason: "AnkiConnect rejected the note (duplicate or invalid)",
      });
    } else {
      result.created++;
      result.noteIds.push(id);
    }
  }
  batch.length = 0;
}

/** Shared tail of both paths: batch the validated notes, write checkpoint. */
async function importValidatedNotes(
  opts: ImportOptions,
  createNotes: ValidatedNote[],
  validationErrors: NoteValidationError[],
  warnings: NoteValidationError[],
  defaultDeck: string,
  log: Logger | undefined,
  result: ImportResult,
): Promise<ImportOutcome> {
  const batchSize = opts.batchSize ?? 500;
  const allowDuplicate = opts.allowDuplicate ?? false;
  const autoCreateDeck = opts.autoCreateDeck ?? true;

  for (const idNote of createNotes.filter((n) => n.id !== undefined)) {
    validationErrors.push({
      noteNumber: idNote.number,
      message: `<note id="${idNote.id}"> is an update target; import creates notes only (use 'sync')`,
      line: idNote.line,
    });
  }
  const createList = createNotes.filter((n) => n.id === undefined);

  if (validationErrors.length > 0) {
    return {
      result: emptyImportResult(),
      validationErrors,
      warnings,
      validCount: createList.length,
    };
  }

  log?.info(`Validated ${createList.length} notes...`);

  if (opts.dryRun || createList.length === 0) {
    return { result, validationErrors, warnings, validCount: createList.length };
  }

  const client = new AnkiClient({ url: opts.url, fetchImpl: opts.fetchImpl });
  const createdDecks = new Set<string>();
  const batch: ValidatedNote[] = [];

  for (const note of createList) {
    batch.push(note);
    if (batch.length >= batchSize) {
      await flushBatch(client, batch, allowDuplicate, autoCreateDeck, createdDecks, result);
    }
  }
  await flushBatch(client, batch, allowDuplicate, autoCreateDeck, createdDecks, result);

  let checkpointId: string | undefined;
  const checkpoint = await createCheckpointForNotes(createdDecks, result.noteIds, "import", {
    id: opts.checkpointId,
    defaultDeck,
  });
  checkpointId = checkpoint?.id;

  log?.info(`Imported ${result.created} notes.`);
  return { result, validationErrors, warnings, validCount: createList.length, checkpointId };
}

export async function importFromFile(opts: ImportOptions): Promise<ImportOutcome> {
  const log = opts.logger;
  const batchSize = opts.batchSize ?? 500;
  const allowDuplicate = opts.allowDuplicate ?? false;
  const autoCreateDeck = opts.autoCreateDeck ?? true;

  const result = emptyImportResult();
  const validationErrors: NoteValidationError[] = [];
  const warnings: NoteValidationError[] = [];

  const plugin = getImporterFor(opts.inputPath);
  if (!plugin) {
    throw new Error(
      `Unsupported file format: ${opts.inputPath} (expected .xml, .yaml, .yml, .json, .csv, .md — or register an importer plugin)`,
    );
  }

  // XML keeps its streaming fast path.
  if (plugin.name === "xml") {
    if (opts.stream) {
      log?.info("Parsing XML (stream)...");
      const batch: ValidatedNote[] = [];
      const createdDecks = new Set<string>();
      let client: AnkiClient | null = null;
      if (!opts.dryRun) {
        client = new AnkiClient({ url: opts.url, fetchImpl: opts.fetchImpl });
      }

      // The streaming parser extracts the root deck and per-note decks
      // itself; no head read needed here.
      let validCount = 0;
      for await (const parsed of parseXmlFileStream(opts.inputPath)) {
        const transformed = applyTransformers(parsed);
        applyOverrides([transformed], opts);
        const { note, errors, warnings: w } = validateNote(transformed, "");
        validationErrors.push(...errors);
        warnings.push(...w);
        validationErrors.push(...runValidatorPlugins(transformed));
        if (!note) continue;
        if (note.id !== undefined) {
          validationErrors.push({
            noteNumber: note.number,
            message: `<note id="${note.id}"> is an update target; import creates notes only (use 'sync')`,
            line: note.line,
          });
          continue;
        }
        validCount++;
        if (opts.dryRun) continue;

        batch.push(note);
        if (batch.length >= batchSize && client) {
          await flushBatch(client, batch, allowDuplicate, autoCreateDeck, createdDecks, result);
          log?.debug(`Flushed batch; created=${result.created}`);
        }
      }

      if (validationErrors.length > 0) {
        log?.info(`Validated with errors (${validationErrors.length}).`);
        return {
          result: emptyImportResult(),
          validationErrors,
          warnings,
          validCount,
        };
      }

      log?.info(`Validated ${validCount} notes...`);

      if (opts.dryRun) {
        return { result, validationErrors, warnings, validCount };
      }

      if (client) {
        await flushBatch(client, batch, allowDuplicate, autoCreateDeck, createdDecks, result);
      }

      const checkpoint = await createCheckpointForNotes(createdDecks, result.noteIds, "import", {
        id: opts.checkpointId,
      });

      log?.info(`Imported ${result.created} notes.`);
      return { result, validationErrors, warnings, validCount, checkpointId: checkpoint?.id };
    }

    // Non-streaming XML path
    log?.info("Parsing XML...");
    const source = await fsp.readFile(opts.inputPath, "utf8");
    const parsed = parseDocument(source);
    applyOverrides(parsed.notes, opts);
    const transformed = parsed.notes.map(applyTransformers);
    const validated = validateWithPlugins(transformed, parsed.defaultDeck, source);
    validationErrors.push(...validated.errors);
    warnings.push(...validated.warnings);
    return importValidatedNotes(
      opts,
      validated.notes,
      validationErrors,
      warnings,
      parsed.defaultDeck,
      log,
      result,
    );
  }

  // Other formats (yaml/json/csv/markdown + user plugins)
  log?.info(`Parsing ${plugin.name}...`);
  const source = await fsp.readFile(opts.inputPath, "utf8");
  const parsed = { notes: [] as ParsedNote[], defaultDeck: "" };
  for await (const note of plugin.parse(Readable.from([source]))) {
    const n = applyTransformers(note);
    applyOverrides([n], opts);
    parsed.notes.push(n);
  }
  if (parsed.notes.length === 0) {
    parsed.defaultDeck = "";
  }
  const validated = validateWithPlugins(parsed.notes, parsed.defaultDeck, undefined);
  validationErrors.push(...validated.errors);
  warnings.push(...validated.warnings);
  return importValidatedNotes(
    opts,
    validated.notes,
    validationErrors,
    warnings,
    parsed.defaultDeck,
    log,
    result,
  );
}
