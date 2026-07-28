/**
 * Note-model registry.
 *
 * Each Anki note type (Basic, Cloze, ...) is described as data so that
 * `validateNotes` does not need a giant if/else. Adding a new model
 * (in Phase 4, for custom note types) is a single registry entry.
 *
 * The registry answers four questions per model:
 *
 *   1. Which XML field tags are allowed?
 *   2. Which are required and which are optional?
 *   3. What is the XML tag → Anki display name mapping?
 *   4. What extra structural rules apply (e.g. addReverse=yes|no)?
 */

import type { ParsedField, ParsedNote, XmlFieldName } from "./types.ts";

export interface NoteModel {
  /** The Anki note type name, exactly as Anki stores it. */
  name: string;
  /** XML tag names that this model accepts. Anything else is a hard error. */
  accepts: ReadonlySet<XmlFieldName>;
  /** XML tag names that must be present. */
  required: ReadonlySet<XmlFieldName>;
  /** XML tag names that are allowed but optional. */
  optional: ReadonlySet<XmlFieldName>;
  /** XML tag → Anki display name. Required fields must be present. */
  fieldNames: Partial<Record<XmlFieldName, string>>;
  /** Trivial content check (empty/whitespace/HTML-only) — applied to all fields. */
  checkContent?: boolean;
  /** Extra structural rules beyond required/optional. */
  validateExtras?: (parsed: ParsedNote) => string[];
  /** Build the Anki field map from parsed fields. */
  buildFields: (fields: ParsedField[]) => Record<string, string>;
}

function hasMeaningfulContent(html: string): boolean {
  return html.replace(/<[^>]*>/g, "").trim().length > 0;
}

function hasClozeMarkers(html: string): boolean {
  return /\{\{c\d+(?:,\d+)*::/.test(html);
}

export { hasMeaningfulContent, hasClozeMarkers };

function findField(fields: ParsedField[], name: XmlFieldName): ParsedField | undefined {
  return fields.find((f) => f.name === name);
}

const BASIC: NoteModel = {
  name: "Basic",
  accepts: new Set<XmlFieldName>(["front", "back"]),
  required: new Set<XmlFieldName>(["front", "back"]),
  optional: new Set<XmlFieldName>(),
  fieldNames: { front: "Front", back: "Back" },
  checkContent: true,
  buildFields(fields) {
    return {
      Front: findField(fields, "front")!.html.trim(),
      Back: findField(fields, "back")!.html.trim(),
    };
  },
};

const BASIC_REVERSED: NoteModel = {
  ...BASIC,
  name: "Basic (and reversed card)",
  // Same field set as Basic; a different model name lets Anki render
  // the second card automatically.
};

const BASIC_TYPE_IN: NoteModel = {
  ...BASIC,
  name: "Basic (type in the answer)",
};

const BASIC_OPTIONAL_REVERSED: NoteModel = {
  name: "Basic (optional reversed card)",
  accepts: new Set<XmlFieldName>(["front", "back", "addReverse", "extra"]),
  required: new Set<XmlFieldName>(["front", "back", "addReverse"]),
  optional: new Set<XmlFieldName>(["extra"]),
  fieldNames: {
    front: "Front",
    back: "Back",
    addReverse: "Add Reverse",
    extra: "Extra",
  },
  checkContent: true,
  validateExtras(parsed) {
    const errors: string[] = [];
    const addReverse = findField(parsed.fields, "addReverse");
    if (addReverse) {
      const v = addReverse.html.trim().toLowerCase();
      if (v !== "yes" && v !== "no") {
        errors.push(`<addReverse> must be "yes" or "no", got "${addReverse.html.trim()}"`);
      }
    }
    return errors;
  },
  buildFields(fields) {
    const extra = findField(fields, "extra");
    return {
      Front: findField(fields, "front")!.html.trim(),
      Back: findField(fields, "back")!.html.trim(),
      "Add Reverse": findField(fields, "addReverse")!.html.trim(),
      ...(extra ? { Extra: extra.html.trim() } : {}),
    };
  },
};

const CLOZE: NoteModel = {
  name: "Cloze",
  accepts: new Set<XmlFieldName>(["text", "extra"]),
  required: new Set<XmlFieldName>(["text"]),
  optional: new Set<XmlFieldName>(["extra"]),
  fieldNames: { text: "Text", extra: "Extra" },
  checkContent: true,
  validateExtras(parsed) {
    const errors: string[] = [];
    const text = findField(parsed.fields, "text");
    if (text && !hasClozeMarkers(text.html)) {
      errors.push(`<text> for a Cloze note must contain at least one {{cN::...}} marker`);
    }
    return errors;
  },
  buildFields(fields) {
    const extra = findField(fields, "extra");
    return {
      Text: findField(fields, "text")!.html.trim(),
      ...(extra ? { Extra: extra.html.trim() } : {}),
    };
  },
};

export const MODELS: ReadonlyMap<string, NoteModel> = new Map<string, NoteModel>([
  [BASIC.name, BASIC],
  [BASIC_REVERSED.name, BASIC_REVERSED],
  [BASIC_OPTIONAL_REVERSED.name, BASIC_OPTIONAL_REVERSED],
  [BASIC_TYPE_IN.name, BASIC_TYPE_IN],
  [CLOZE.name, CLOZE],
]);

export function getModel(name: string): NoteModel | undefined {
  return MODELS.get(name);
}

/** All supported model names, in registry order. */
export const SUPPORTED_MODEL_NAMES: string[] = [...MODELS.keys()];

/**
 * Look up the Anki display name for a given XML tag in a given model.
 * Returns `null` if the field is not accepted by this model.
 */
export function ankiFieldName(model: NoteModel, xmlTag: XmlFieldName): string | null {
  return model.fieldNames[xmlTag] ?? null;
}
