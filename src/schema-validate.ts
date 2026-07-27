/**
 * `schema-validate <file>` — static validation PLUS live schema check.
 *
 * Compares the file's field names against the actual field names of
 * each model in the live collection. Surfaces drift:
 *
 *   - field used in the file but doesn't exist in the model
 *   - field exists in the model but isn't provided in the note
 *   - model name in the file doesn't exist in the collection
 *
 * Output is a structured list of `SchemaIssue`s, so the agent can
 * render them as JSON or as a human report.
 */

import * as fs from "node:fs/promises";
import { AnkiConnectClient } from "./anki-connect.ts";
import { MODELS } from "./models.ts";
import { parseDocument, validateNotes } from "./xml.ts";

/**
 * For a given ParsedNote, find every element name that appears
 * inside its <note>...</note> body in the source. We re-walk the
 * source because the parser drops unknown elements.
 */
function extractFieldNamesForNote(
  source: string,
  note: { number: number; rawStart?: number; rawEnd?: number },
): Set<string> {
  const names = new Set<string>();
  // Find the <note ...> for this note number.
  const noteRe = /<note\b[^>]*>/g;
  let m: RegExpExecArray | null;
  let count = 0;
  while ((m = noteRe.exec(source)) !== null) {
    count++;
    if (count !== note.number) continue;
    const bodyStart = m.index + m[0].length;
    const closeIdx = source.indexOf("</note>", bodyStart);
    if (closeIdx < 0) break;
    const body = source.slice(bodyStart, closeIdx);
    const elRe = /<([A-Za-z_][A-Za-z0-9_-]*)\b/g;
    let em: RegExpExecArray | null;
    while ((em = elRe.exec(body)) !== null) names.add(em[1]!);
    break;
  }
  return names;
}

export interface SchemaIssue {
  noteNumber: number;
  /** One of: unknown-field, missing-required-field, unknown-model */
  kind: "unknown-field" | "missing-required-field" | "unknown-model";
  field?: string;
  message: string;
}

export interface SchemaValidationOptions {
  inputPath: string;
  ankiConnectUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface SchemaValidationResult {
  file: string;
  issues: SchemaIssue[];
  /** Number of notes that had zero issues. */
  cleanNotes: number;
  totalNotes: number;
}

export async function runSchemaValidate(
  opts: SchemaValidationOptions,
): Promise<SchemaValidationResult> {
  const source = await fs.readFile(opts.inputPath, "utf8");
  const parsed = parseDocument(source);
  const { errors: staticErrors } = validateNotes(parsed.notes, parsed.defaultDeck, source);
  if (staticErrors.length > 0) {
    // Re-throw the first static error so the agent sees XML validity
    // problems before schema-drift problems.
    throw new Error(`file has ${staticErrors.length} static validation error(s): ${staticErrors[0]!.message}`);
  }

  const client = new AnkiConnectClient({
    url: opts.ankiConnectUrl ?? "http://127.0.0.1:8765",
    fetchImpl: opts.fetchImpl,
  });

  // Pull every model's field names. We use modelFieldNames per model
  // (the agent doesn't know ahead of time which models appear in the
  // file).
  const modelsInFile = new Set(parsed.notes.map((n) => n.type).filter((s) => s.length > 0));
  const modelFields = new Map<string, string[]>();
  for (const name of modelsInFile) {
    try {
      const fields = await client.modelFieldNames(name);
      modelFields.set(name, fields);
    } catch {
      // The model doesn't exist in the live collection. We'll surface
      // that as an issue below.
      modelFields.set(name, []);
    }
  }

  const issues: SchemaIssue[] = [];
  let clean = 0;
  for (const note of parsed.notes) {
    const modelName = note.type;
    if (modelName.length === 0) {
      issues.push({
        noteNumber: note.number,
        kind: "unknown-model",
        message: `note has no model declared (missing type attribute)`,
      });
      continue;
    }
    const valid = modelFields.get(modelName);
    if (valid === undefined) {
      issues.push({
        noteNumber: note.number,
        kind: "unknown-model",
        message: `model '${modelName}' is not registered in the live collection`,
      });
      continue;
    }
    if (valid.length === 0) {
      issues.push({
        noteNumber: note.number,
        kind: "unknown-model",
        message: `model '${modelName}' is unknown to the live collection`,
      });
      continue;
    }
    // Walk the source for THIS note's element list, so we can detect
    // unknown fields that the parser silently dropped.
    const presentFields = extractFieldNamesForNote(source, note);
    // Map the XML-side field names (e.g. "front") to the Anki display
    // names (e.g. "Front") using the local registry when the model
    // is known; otherwise fall back to case-insensitive comparison.
    const xmlToAnki = new Map<string, string>();
    const modelDef = MODELS[modelName as keyof typeof MODELS];
    if (modelDef) {
      for (const m of modelDef.fieldMap) {
        xmlToAnki.set(m.xml.toLowerCase(), m.anki);
      }
    }
    const presentAnki = new Set<string>();
    for (const f of presentFields) {
      const mapped = xmlToAnki.get(f.toLowerCase());
      if (mapped) {
        presentAnki.add(mapped);
      } else {
        const ci = valid.find((v) => v.toLowerCase() === f.toLowerCase());
        presentAnki.add(ci ?? f);
      }
    }
    let noteOk = true;
    for (const want of valid) {
      if (!presentAnki.has(want)) {
        issues.push({
          noteNumber: note.number,
          kind: "missing-required-field",
          field: want,
          message: `field '${want}' exists in the model but is missing from the note`,
        });
        noteOk = false;
      }
    }
    for (const f of presentAnki) {
      if (!valid.includes(f)) {
        issues.push({
          noteNumber: note.number,
          kind: "unknown-field",
          field: f,
          message: `field '${f}' does not exist in model '${modelName}'`,
        });
        noteOk = false;
      }
    }
    if (noteOk) clean++;
  }

  return {
    file: opts.inputPath,
    issues,
    cleanNotes: clean,
    totalNotes: parsed.notes.length,
  };
}