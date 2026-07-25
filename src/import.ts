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
  /**
   * Validate only — never contact AnkiConnect. The returned
   * `result.created` is always `0` because no notes were created.
   * `validCount` reflects how many notes *would* have been sent.
   */
  dryRun?: boolean;
  /**
   * Create any missing decks before posting notes. Defaults to `true`.
   * AnkiConnect's `createDeck` is idempotent — calling it for a deck
   * that already exists is a no-op, so leaving this on is safe.
   * Set to `false` to surface the original `deck was not found` error
   * and abort the import (handy for CI / strict workflows).
   */
  autoCreateDeck?: boolean;
}

export interface ImportOutcome {
  /** Notes that passed validation and were (or were not) created. */
  result: ImportResult;
  /** Structural problems found before contacting AnkiConnect. */
  validationErrors: { noteNumber: number; message: string }[];
  /**
   * Number of notes that passed validation. In dry-run mode this is the
   * number of notes that *would* have been sent to AnkiConnect.
   */
  validCount: number;
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

  // Phase 2: <note id="N"> is parsed and validated but not yet honored
  // by `import`. Notes with an id are skipped and surfaced as a warning
  // so AI authors get visibility instead of a silent re-import that
  // would create a duplicate. Phase 4 adds an `--update-existing` flag
  // (or a dedicated `upsert` command) that targets these.
  const idNotes = validNotes.filter((n) => n.id !== undefined);
  const createNotes = validNotes.filter((n) => n.id === undefined);
  for (const id of idNotes) {
    validationErrors.push({
      noteNumber: id.number,
      message: `<note id="${id.id}"> is treated as an update; run 'anki-xml update --id ${id.id} --field ...' instead`,
    });
  }

  // Imports are atomic at the file-validation boundary: if even one note
  // is invalid, do not create decks and do not post the otherwise-valid
  // subset. This matches the CLI's "fix all errors and re-run" contract and
  // prevents a corrected second run from colliding with notes created by a
  // partially successful first run.
  if (validationErrors.length > 0) {
    return {
      result: { created: 0, failed: [] },
      validationErrors,
      validCount: validNotes.length,
    };
  }

  // A defensive fallback for an impossible parser/validator outcome.
  if (validNotes.length === 0) {
    return {
      result: { created: 0, failed: [] },
      validationErrors,
      validCount: 0,
    };
  }

  // If every note in the file had an id (and was therefore skipped),
  // short-circuit with a clean error result.
  if (createNotes.length === 0) {
    return {
      result: { created: 0, failed: [] },
      validationErrors,
      validCount: 0,
    };
  }

  // Dry run: validation is done, AnkiConnect stays untouched.
  if (opts.dryRun) {
    return {
      result: { created: 0, failed: [] },
      validationErrors,
      validCount: validNotes.length,
    };
  }

  // 2) Hit AnkiConnect.
  const client = new AnkiConnectClient({
    url: opts.ankiConnectUrl ?? "http://127.0.0.1:8765",
    fetchImpl: opts.fetchImpl,
  });

  // Ensure every deck referenced by the batch exists. AnkiConnect's
  // createDeck is idempotent and creates missing parents on the fly,
  // so we can safely call it for the full set of unique deck names.
  if (opts.autoCreateDeck ?? true) {
    const uniqueDecks = [...new Set(createNotes.map((n) => n.deckName))];
    for (const name of uniqueDecks) {
      if (!name) continue; // belt-and-braces; validation already errors on empty deck
      await client.createDeck(name);
    }
  }

  const payloads: AnkiConnectNote[] = createNotes.map((n) => ({
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
    validCount: validNotes.length,
  };
}