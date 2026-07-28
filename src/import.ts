/**
 * Top-level import orchestration:
 *
 *   1. read the XML file from disk
 *   2. parse + validate (single batch, all errors collected)
 *   3. POST every valid note to AnkiConnect in one `addNotes` call
 *   4. cross-reference per-note results with our 1-based note numbers and
 *      produce a structured ImportResult
 */

import * as fs from "node:fs/promises";
import { AnkiConnectClient, AnkiConnectError } from "./anki-connect.ts";
import { parseDocument, validateNotes, XmlParseError } from "./xml.ts";
import type { AnkiConnectNote, ImportResult } from "./types.ts";

export interface ImportOptions {
  /** Path to the XML input file. */
  inputPath: string;
  /** AnkiConnect base URL. Defaults to http://127.0.0.1:8765. */
  ankiConnectUrl?: string;
  /** Override `fetch` for tests. Defaults to the global. */
  fetchImpl?: typeof fetch;
}

export interface ImportOutcome {
  /** Notes that passed validation and were (or were not) created. */
  result: ImportResult;
  /** Structural problems found before contacting AnkiConnect. */
  validationErrors: { noteNumber: number; message: string }[];
}

/**
 * Read an XML file, validate it, and push every valid note to Anki.
 *
 * The function does not throw for validation failures or per-note
 * rejections — those are surfaced through `outcome.validationErrors` and
 * `outcome.result.failed`. It only throws for problems that prevent the
 * import from running at all: malformed XML, file read errors, and
 * AnkiConnect connectivity problems.
 */
export async function importFromFile(opts: ImportOptions): Promise<ImportOutcome> {
  const source = await fs.readFile(opts.inputPath, "utf8");

  // 1) Parse and validate.
  let parsed;
  try {
    parsed = parseDocument(source);
  } catch (err) {
    if (err instanceof XmlParseError) {
      throw err;
    }
    throw err;
  }

  const { notes: validNotes, errors: validationErrors } = validateNotes(
    parsed.notes,
    parsed.defaultDeck,
  );

  // Short-circuit when validation failed entirely; nothing to send.
  if (validNotes.length === 0) {
    return {
      result: { created: 0, failed: [] },
      validationErrors,
    };
  }

  // 2) Hit AnkiConnect.
  const client = new AnkiConnectClient({
    url: opts.ankiConnectUrl ?? "http://127.0.0.1:8765",
    fetchImpl: opts.fetchImpl,
  });

  const payloads: AnkiConnectNote[] = validNotes.map((n) => ({
    deckName: n.deckName,
    modelName: n.modelName,
    fields: n.fields,
    tags: n.tags,
    options: { allowDuplicate: false },
  }));

  let ids: (number | null)[];
  try {
    ids = await client.addNotes(payloads);
  } catch (err) {
    if (err instanceof AnkiConnectError) throw err;
    throw err;
  }

  // 3) Reconcile results. AnkiConnect returns one entry per input note in
  //    the same order; a `null` means that note was rejected.
  let created = 0;
  const failed: { noteNumber: number; reason: string }[] = [];

  if (ids.length !== validNotes.length) {
    throw new AnkiConnectError(
      `AnkiConnect returned ${ids.length} ids for ${validNotes.length} notes — protocol mismatch`,
    );
  }

  for (let i = 0; i < validNotes.length; i++) {
    const note = validNotes[i]!;
    const id = ids[i];
    if (typeof id === "number") created++;
    else failed.push({ noteNumber: note.number, reason: "AnkiConnect rejected this note" });
  }

  return {
    result: { created, failed },
    validationErrors,
  };
}