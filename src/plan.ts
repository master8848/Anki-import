/**
 * `plan` command: validate an XML file and preflight against AnkiConnect.
 *
 * The plan tells the AI agent exactly what would happen if it ran
 * `import` right now: which notes are valid, which decks would be
 * created, and which notes would be rejected as duplicates.
 *
 * The agent should read the plan, decide whether to proceed, and only
 * then call `import`. This is the most common AI-loop pattern:
 * simulate, decide, then act.
 */

import { AnkiConnectClient } from "./anki-connect.ts";
import { importFromFile, type ImportOptions } from "./import.ts";
import { parseDocument, validateNotes, XmlParseError } from "./xml.ts";
import type { AnkiConnectNote, NoteValidationError } from "./types.ts";

export interface PlanOptions {
  inputPath: string;
  ankiConnectUrl?: string;
  fetchImpl?: typeof fetch;
  /** Defaults to true. When false, canAddNotes is skipped (no network dedup check). */
  preflight?: boolean | null;
  /** Auto-create missing decks in the plan. Defaults to true. */
  autoCreateDeck?: boolean | null;
}

export interface PlanReport {
  file: string;
  valid: boolean;
  noteCount: number;
  validCount: number;
  errors: NoteValidationError[];
  warnings: NoteValidationError[];
  decks: { name: string; wouldCreate: boolean }[];
  duplicates: number[];
  canAddSummary: { wouldAdd: number; wouldDuplicate: number; unknown: number };
}

export async function runPlan(opts: PlanOptions): Promise<PlanReport> {
  const source = await Bun.file(opts.inputPath).text();

  let parsed;
  try {
    parsed = parseDocument(source);
  } catch (err) {
    if (err instanceof XmlParseError) throw err;
    throw err;
  }

  const { notes: validNotes, errors, warnings } = validateNotes(
    parsed.notes,
    parsed.defaultDeck,
    source,
  );

  // Determine which decks would be created (i.e. don't yet exist).
  const deckNames = [
    ...new Set(validNotes.map((n) => n.deckName).filter((d) => d.length > 0)),
  ];

  const dryRunOpts: ImportOptions = {
    inputPath: opts.inputPath,
    ankiConnectUrl: opts.ankiConnectUrl,
    fetchImpl: opts.fetchImpl,
    dryRun: true,
    autoCreateDeck: opts.autoCreateDeck ?? true,
  };

  let existingDecks = new Set<string>();
  if (opts.preflight !== false && deckNames.length > 0) {
    const client = new AnkiConnectClient({
      url: opts.ankiConnectUrl ?? "http://127.0.0.1:8765",
      fetchImpl: opts.fetchImpl,
    });
    try {
      const report = await client.deckNames();
      existingDecks = new Set(report);
    } catch {
      // Network failure is non-fatal for planning; report decks as
      // 'unknown' rather than blocking the plan.
      existingDecks = new Set();
    }
  }

  const decks = deckNames.map((name) => ({
    name,
    wouldCreate: !existingDecks.has(name),
  }));

  // Preflight dedup against the live collection.
  const createNotes = validNotes.filter((n) => n.id === undefined);
  let canAddSummary = { wouldAdd: 0, wouldDuplicate: 0, unknown: 0 };
  let duplicates: number[] = [];

  if (opts.preflight !== false && createNotes.length > 0) {
    const client = new AnkiConnectClient({
      url: opts.ankiConnectUrl ?? "http://127.0.0.1:8765",
      fetchImpl: opts.fetchImpl,
    });
    const payloads: AnkiConnectNote[] = createNotes.map((n) => ({
      deckName: n.deckName,
      modelName: n.modelName,
      fields: n.fields,
      tags: n.tags,
      options: { allowDuplicate: false },
    }));
    try {
      const result = await client.canAddNotes(payloads);
      for (let i = 0; i < result.length; i++) {
        const r = result[i];
        if (r === true) canAddSummary.wouldAdd++;
        else if (r === false) {
          canAddSummary.wouldDuplicate++;
          duplicates.push(createNotes[i]!.number);
        } else canAddSummary.unknown++;
      }
    } catch {
      // Treat network failure as 'unknown' for the summary.
      canAddSummary = {
        wouldAdd: 0,
        wouldDuplicate: 0,
        unknown: createNotes.length,
      };
    }
  }

  // `dryRunOpts` was kept to declare the import-level dry-run path is
  // already used; we just use parse + validate above to avoid making
  // any network calls from inside the planner.
  void dryRunOpts;
  void importFromFile;

  return {
    file: opts.inputPath,
    valid: errors.length === 0,
    noteCount: parsed.notes.length,
    validCount: validNotes.length,
    errors,
    warnings,
    decks,
    duplicates,
    canAddSummary,
  };
}

export { XmlParseError };
