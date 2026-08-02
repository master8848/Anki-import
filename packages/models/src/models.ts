/**
 * Note-model registry — one source of truth for valid type= values and fields.
 */

import type { ParsedField, ParsedNote, XmlFieldName } from "@anki-xml/utils";

export interface NoteModel {
  name: string;
  accepts: ReadonlySet<XmlFieldName>;
  required: ReadonlySet<XmlFieldName>;
  optional: ReadonlySet<XmlFieldName>;
  fieldNames: Partial<Record<XmlFieldName, string>>;
  checkContent?: boolean;
  validateExtras?: (parsed: ParsedNote) => string[];
  buildFields: (fields: ParsedField[]) => Record<string, string>;
}

export function hasMeaningfulContent(html: string): boolean {
  return html.replace(/<[^>]*>/g, "").trim().length > 0;
}

export function hasClozeMarkers(html: string): boolean {
  return /\{\{c\d+(?:,\d+)*::/.test(html);
}

function findField(fields: ParsedField[], name: XmlFieldName): ParsedField | undefined {
  return fields.find((f) => f.name === name);
}

/** Required fields are guaranteed by validation; throw otherwise. */
function requiredField(
  fields: ParsedField[],
  name: XmlFieldName,
  modelName: string,
): ParsedField {
  const f = findField(fields, name);
  if (!f) throw new Error(`model "${modelName}" is missing required field <${name}>`);
  return f;
}

/** Normalize field keys: "Front" / "front" → "front". */
export function normalizeFieldKey(name: string): string {
  const lower = name.trim().toLowerCase();
  if (lower === "add reverse" || lower === "addreverse") return "addReverse";
  return lower;
}

/** Default note type when a document does not specify one. */
export const DEFAULT_MODEL_NAME = "Basic";

const BASIC: NoteModel = {
  name: DEFAULT_MODEL_NAME,
  accepts: new Set<XmlFieldName>(["front", "back"]),
  required: new Set<XmlFieldName>(["front", "back"]),
  optional: new Set<XmlFieldName>(),
  fieldNames: { front: "Front", back: "Back" },
  checkContent: true,
  buildFields(fields) {
    return {
      Front: requiredField(fields, "front", DEFAULT_MODEL_NAME).html.trim(),
      Back: requiredField(fields, "back", DEFAULT_MODEL_NAME).html.trim(),
    };
  },
};

const BASIC_REVERSED: NoteModel = {
  ...BASIC,
  name: "Basic (and reversed card)",
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

const modelRegistry = new Map<string, NoteModel>([
  [BASIC.name, BASIC],
  [BASIC_REVERSED.name, BASIC_REVERSED],
  [BASIC_OPTIONAL_REVERSED.name, BASIC_OPTIONAL_REVERSED],
  [BASIC_TYPE_IN.name, BASIC_TYPE_IN],
  [CLOZE.name, CLOZE],
]);

export const MODELS: ReadonlyMap<string, NoteModel> = modelRegistry;

export function getModel(name: string): NoteModel | undefined {
  return modelRegistry.get(name);
}

export const SUPPORTED_MODEL_NAMES: string[] = [...modelRegistry.keys()];
