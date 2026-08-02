/**
 * Import orchestration: parse → validate → batch → AnkiConnect.
 */

import * as fsp from "node:fs/promises";
import { AnkiClient } from "@anki-xml/anki";
import { parseDocument, XmlParseError, parseXmlFileStream } from "@anki-xml/parser";
import { validateNote, validateNotes } from "@anki-xml/validation";
import { createCheckpoint } from "@anki-xml/checkpoint";
import type { Logger } from "@anki-xml/logger";
import type {
  AnkiConnectNote,
  ImportResult,
  NoteValidationError,
  ValidatedNote,
} from "@anki-xml/utils";

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
    const note = batch[i]!;
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

export async function importFromFile(opts: ImportOptions): Promise<ImportOutcome> {
  const log = opts.logger;
  const batchSize = opts.batchSize ?? 500;
  const allowDuplicate = opts.allowDuplicate ?? false;
  const autoCreateDeck = opts.autoCreateDeck ?? true;

  const result: ImportResult = { created: 0, failed: [], noteIds: [] };
  const validationErrors: NoteValidationError[] = [];
  const warnings: NoteValidationError[] = [];
  let validCount = 0;

  if (opts.stream) {
    log?.info("Parsing XML (stream)...");
    const batch: ValidatedNote[] = [];
    const createdDecks = new Set<string>();
    let client: AnkiClient | null = null;
    if (!opts.dryRun) {
      client = new AnkiClient({ url: opts.url, fetchImpl: opts.fetchImpl });
    }

    let defaultDeck = "";
    // Peek root deck from first chunk
    try {
      const fh = await fsp.open(opts.inputPath, "r");
      const buf = Buffer.alloc(4096);
      const { bytesRead } = await fh.read(buf, 0, 4096, 0);
      await fh.close();
      const head = buf.slice(0, bytesRead).toString("utf8");
      const m = head.match(/<anki\b[^>]*\bdeck\s*=\s*["']([^"']*)["']/);
      if (m) defaultDeck = m[1]!;
    } catch {
      /* continue */
    }

    let noteCount = 0;
    for await (const parsed of parseXmlFileStream(opts.inputPath, { defaultDeck })) {
      noteCount++;
      const { note, errors, warnings: w } = validateNote(parsed, defaultDeck);
      validationErrors.push(...errors);
      warnings.push(...w);
      if (!note) continue;
      if (note.id !== undefined) {
        validationErrors.push({
          noteNumber: note.number,
          message: `<note id="${note.id}"> is an update target; import creates notes only`,
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
      return { result: { created: 0, failed: [], noteIds: [] }, validationErrors, warnings, validCount };
    }

    log?.info(`Validated ${validCount} notes...`);

    if (opts.dryRun) {
      return { result, validationErrors, warnings, validCount };
    }

    if (client) {
      await flushBatch(client, batch, allowDuplicate, autoCreateDeck, createdDecks, result);
    }

    let checkpointId: string | undefined;
    if (opts.checkpointId || result.noteIds.length > 0) {
      const id = opts.checkpointId ?? `import-${Date.now()}`;
      const deck = createdDecks.size === 1 ? [...createdDecks][0]! : "";
      await createCheckpoint({ id, deck, noteIds: result.noteIds });
      checkpointId = id;
    }

    log?.info(`Imported ${result.created} notes.`);
    void noteCount;
    return { result, validationErrors, warnings, validCount, checkpointId };
  }

  // Non-streaming path
  log?.info("Parsing XML...");
  const source = await fsp.readFile(opts.inputPath, "utf8");
  let parsed;
  try {
    parsed = parseDocument(source);
  } catch (err) {
    if (err instanceof XmlParseError) throw err;
    throw err;
  }

  const { notes: validNotes, errors, warnings: w } = validateNotes(
    parsed.notes,
    parsed.defaultDeck,
    source,
  );
  validationErrors.push(...errors);
  warnings.push(...w);

  const createNotes = validNotes.filter((n) => n.id === undefined);
  for (const idNote of validNotes.filter((n) => n.id !== undefined)) {
    validationErrors.push({
      noteNumber: idNote.number,
      message: `<note id="${idNote.id}"> is an update target; import creates notes only`,
      line: idNote.line,
    });
  }

  if (validationErrors.length > 0) {
    return {
      result: { created: 0, failed: [], noteIds: [] },
      validationErrors,
      warnings,
      validCount: createNotes.length,
    };
  }

  validCount = createNotes.length;
  log?.info(`Validated ${validCount} notes...`);

  if (opts.dryRun || validCount === 0) {
    return { result, validationErrors, warnings, validCount };
  }

  const client = new AnkiClient({ url: opts.url, fetchImpl: opts.fetchImpl });
  const createdDecks = new Set<string>();
  const batch: ValidatedNote[] = [];

  for (const note of createNotes) {
    batch.push(note);
    if (batch.length >= batchSize) {
      await flushBatch(client, batch, allowDuplicate, autoCreateDeck, createdDecks, result);
    }
  }
  await flushBatch(client, batch, allowDuplicate, autoCreateDeck, createdDecks, result);

  let checkpointId: string | undefined;
  if (result.noteIds.length > 0) {
    const id = opts.checkpointId ?? `import-${Date.now()}`;
    const deck =
      createdDecks.size === 1
        ? [...createdDecks][0]!
        : parsed.defaultDeck || "";
    await createCheckpoint({ id, deck, noteIds: result.noteIds });
    checkpointId = id;
  }

  log?.info(`Imported ${result.created} notes.`);
  return { result, validationErrors, warnings, validCount, checkpointId };
}
