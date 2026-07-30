/**
 * Note validation — Valibot shape check + model registry rules.
 */

import * as v from "valibot";
import {
  getModel,
  hasMeaningfulContent,
  SUPPORTED_MODEL_NAMES,
} from "../../anki/models.ts";
import { NoteSchema } from "../../validation/schemas.ts";
import { sourceLocation } from "../../parser/tokenize.ts";
import type {
  NoteValidationError,
  ParsedNote,
  ValidatedNote,
  ValidationResult,
} from "../../types/index.ts";

function parseTags(raw: string): string[] {
  return raw
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

function validateTags(
  tags: string[],
  noteNumber: number,
  warnings: NoteValidationError[],
): void {
  for (const tag of tags) {
    if (tag.includes(",")) {
      warnings.push({
        noteNumber,
        message: `tag "${tag}" contains a comma; split into whitespace-separated tags`,
      });
    }
    if (tag.length > 100) {
      warnings.push({
        noteNumber,
        message: `tag is unusually long (${tag.length} chars)`,
      });
    }
  }
}

export function validateNote(
  note: ParsedNote,
  defaultDeck: string,
  source?: string,
): { note?: ValidatedNote; errors: NoteValidationError[]; warnings: NoteValidationError[] } {
  const errors: NoteValidationError[] = [];
  const warnings: NoteValidationError[] = [];

  const shape = v.safeParse(NoteSchema, note);
  if (!shape.success) {
    for (const issue of shape.issues) {
      errors.push({
        noteNumber: note.number,
        message: issue.message,
        line: note.line,
      });
    }
    return { errors, warnings };
  }

  const model = getModel(note.type);
  if (!model) {
    errors.push({
      noteNumber: note.number,
      message: `unsupported note type "${note.type}"; supported: ${SUPPORTED_MODEL_NAMES.join(", ")}`,
      line: note.line,
    });
  }

  const deck = note.deck.trim() || defaultDeck.trim();
  if (!deck) {
    errors.push({
      noteNumber: note.number,
      message: "no deck: set deck on <anki>, <deck name>, or <note deck>",
      line: note.line,
    });
  }

  if (model) {
    const seen = new Set<string>();
    for (let i = 0; i < note.fields.length; i++) {
      const field = note.fields[i]!;
      if (seen.has(field.name)) {
        errors.push({
          noteNumber: note.number,
          message: `<${field.name}> appears more than once`,
          line: note.line,
          ...(source && note.fieldSourceOffsets?.[i] !== undefined
            ? sourceLocation(source, note.fieldSourceOffsets[i]!)
            : {}),
        });
      }
      seen.add(field.name);

      if (model.accepts.size > 0 && !model.accepts.has(field.name)) {
        errors.push({
          noteNumber: note.number,
          message: `<${field.name}> is not accepted by ${model.name}; expected: ${[...model.accepts].join(", ")}`,
          line: note.line,
        });
      }
    }

    for (const req of model.required) {
      const present = note.fields.find((f) => f.name === req);
      if (!present) {
        errors.push({
          noteNumber: note.number,
          message: `Missing field: ${model.fieldNames[req] ?? req}`,
          line: note.line,
        });
      } else if (model.checkContent && !hasMeaningfulContent(present.html)) {
        errors.push({
          noteNumber: note.number,
          message: `<${req}> is empty or contains only whitespace/HTML tags`,
          line: note.line,
        });
      }
    }

    if (model.validateExtras) {
      for (const msg of model.validateExtras(note)) {
        errors.push({ noteNumber: note.number, message: msg, line: note.line });
      }
    }
  }

  if (note.unknownElements) {
    for (const el of note.unknownElements) {
      warnings.push({
        noteNumber: note.number,
        message: `unknown element <${el}> inside <note> — ignored`,
        line: note.line,
      });
    }
  }

  if (errors.length > 0) return { errors, warnings };

  const tags = parseTags(note.tags);
  validateTags(tags, note.number, warnings);

  return {
    note: {
      number: note.number,
      id: note.id,
      deckName: deck,
      modelName: note.type,
      fields: model!.buildFields(note.fields),
      tags,
      line: note.line,
    },
    errors,
    warnings,
  };
}

export function validateNotes(
  notes: ParsedNote[],
  defaultDeck: string,
  source?: string,
): ValidationResult {
  const errors: NoteValidationError[] = [];
  const warnings: NoteValidationError[] = [];
  const valid: ValidatedNote[] = [];

  if (notes.length === 0) {
    errors.push({ noteNumber: 0, message: "No <note> elements found inside <anki>" });
    return { notes: [], errors, warnings };
  }

  const seenIds = new Map<number, number>();

  for (const note of notes) {
    if (note.id !== undefined) {
      const first = seenIds.get(note.id);
      if (first !== undefined) {
        errors.push({
          noteNumber: note.number,
          message: `id ${note.id} is used more than once (also in note ${first})`,
          line: note.line,
        });
        continue;
      }
      seenIds.set(note.id, note.number);
    }

    const result = validateNote(note, defaultDeck, source);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
    if (result.note) valid.push(result.note);
  }

  return { notes: valid, errors, warnings };
}

/** Format a validation error for human output. */
export function formatValidationError(err: NoteValidationError): string {
  const loc = err.line !== undefined ? `Line ${err.line}:\n` : "";
  return `${loc}${err.message}`;
}
