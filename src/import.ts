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
import { toAddNotePayloads } from "./anki-payload.ts";
import { ingestMedia } from "./media.ts";
import type { ImportResult } from "./types.ts";

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
  /**
   * Resume from a named checkpoint (M11). When set, notes whose
   * payload already appears in the checkpoint (same deck+model+
   * fields hash) are skipped, allowing recovery from a network
   * drop or partial failure.
   */
  resumeFromCheckpoint?: string;
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
    source,
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

  // Resume filter (M11): if a checkpoint is supplied, skip any note
  // whose (deck, model, fields) fingerprint matches a snapshotted note.
  // The checkpoint's noteId is what got assigned last time; we use the
  // fields fingerprint as the identity so renamed fields still match.
  let resumeFingerprints: Set<string> | null = null;
  if (opts.resumeFromCheckpoint) {
    const { loadCheckpoint } = await import("./checkpoints.ts");
    const snap = await loadCheckpoint(opts.resumeFromCheckpoint);
    resumeFingerprints = new Set();
    for (const snapNote of Object.values(snap.notes)) {
      resumeFingerprints.add(fingerprintNote(snapNote.deckName, snapNote.modelName, snapNote.fields));
    }
  }
  const skippedByResume = new Set<number>();
  if (resumeFingerprints) {
    for (let i = createNotes.length - 1; i >= 0; i--) {
      const n = createNotes[i]!;
      const fp = fingerprintNote(n.deckName, n.modelName, n.fields);
      if (resumeFingerprints.has(fp)) {
        skippedByResume.add(n.number);
        createNotes.splice(i, 1);
      }
    }
  }

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

  // 2b) Ingest media files referenced in note fields (<img src="...">, [sound:...])
  const allFieldHtmls = createNotes.flatMap((n) => Object.values(n.fields));
  await ingestMedia({
    sourcePath: opts.inputPath,
    ankiConnectUrl: opts.ankiConnectUrl,
    fetchImpl: opts.fetchImpl,
    fields: allFieldHtmls,
  });

  const payloads = toAddNotePayloads(createNotes, {
    allowDuplicate: opts.allowDuplicate,
  });

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

  if (ids.length !== createNotes.length) {
    throw new AnkiConnectError(
      `AnkiConnect returned ${ids.length} ids for ${createNotes.length} notes — protocol mismatch`,
    );
  }

  for (let i = 0; i < createNotes.length; i++) {
    const note = createNotes[i]!;
    const id = ids[i];
    if (typeof id === "number") created++;
    else failed.push({ noteNumber: note.number, reason: "AnkiConnect rejected this note" });
  }
  // Resume-skip report: each skipped note is treated as a successful
  // creation from the caller's perspective.
  const skipped = skippedByResume.size;
  created += skipped;

  return {
    result: { created, failed },
    validationErrors,
    validCount: validNotes.length,
  };
}

/**
 * Compute a stable fingerprint of a note's content identity (excluding
 * the Anki-assigned id). Used by resume-from to recognize notes that
 * were already successfully imported in a previous run.
 */
function fingerprintNote(deck: string, model: string, fields: Record<string, string>): string {
  const sortedKeys = Object.keys(fields).sort();
  const payload = [deck, model, ...sortedKeys.map((k) => `${k}=${fields[k]}`)].join("\u0001");
  let h = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    h ^= payload.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ("00000000" + (h >>> 0).toString(16)).slice(-8);
}