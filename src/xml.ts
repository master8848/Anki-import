/**
 * XML parsing, raw-HTML extraction, and structural validation for anki-xml.
 *
 * Pipeline:
 *
 *   1.  fast-xml-parser (with `preserveOrder` + `captureMetaData`) checks
 *       well-formedness and yields an ordered element tree annotated with
 *       each element's source-text start offset.
 *
 *   2.  We walk that tree to collect each `<note>` together with its `type`,
 *       `deck`, and `tags` attributes and its child field elements.
 *
 *   3.  For each field we use the captured start offset to index into a
 *       hand-rolled token stream (CDATA / comment / PI / start-tag /
 *       end-tag) over the source text. The token stream lets us find the
 *       matching closing tag of a field without being fooled by CDATA
 *       contents or comments. The substring between the opening tag's
 *       closing `>` and the matching end tag is treated as the raw HTML
 *       payload for that field — entity references inside it pass through
 *       verbatim. CDATA contents are re-escaped for HTML embedding using
 *       a rule that only touches bare `&` characters so existing entities
 *       like `&lt;` and `&amp;` are not double-escaped.
 *
 *   4.  Structural validation (required fields per model, unknown field
 *       tags, allowed values for `<addReverse>`, etc.) is run on the
 *       collected notes. All errors are returned in one pass so users see
 *       every problem at once.
 */

import { XMLParser } from "fast-xml-parser";
// `captureMetaData: true` attaches per-node start indices under a Symbol.
// The symbol is created internally by fast-xml-parser; the supported way to
// retrieve it is XMLParser.getMetaDataSymbol().
const META = XMLParser.getMetaDataSymbol() as unknown as symbol;
import type {
  NoteValidationError,
  ParsedField,
  ParsedNote,
  SupportedModel,
  ValidationResult,
  ValidatedNote,
  XmlFieldName,
} from "./types.ts";

/** Tags that appear inside `<note>` and map to Anki fields. */
const FIELD_NAMES: ReadonlySet<XmlFieldName> = new Set([
  "front",
  "back",
  "text",
  "extra",
  "addReverse",
]);

/** All supported Anki note types, exactly as Anki names them. */
export const SUPPORTED_MODELS: ReadonlySet<string> = new Set<SupportedModel>([
  "Basic",
  "Basic (and reversed card)",
  "Basic (optional reversed card)",
  "Basic (type in the answer)",
  "Cloze",
]);

/** Thrown for any structural / XML problem encountered while parsing. */
export class XmlParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XmlParseError";
  }
}

// ─── Source-text tokenizer ──────────────────────────────────────────────────

type XmlToken =
  | { kind: "start"; name: string; tagStart: number; tagEnd: number; contentStart: number }
  | { kind: "selfClose"; name: string; tagStart: number; tagEnd: number }
  | { kind: "end"; name: string; tagStart: number; tagEnd: number }
  | { kind: "cdata"; tagStart: number; contentStart: number; contentEnd: number; tagEnd: number }
  | { kind: "comment"; tagStart: number; tagEnd: number }
  | { kind: "pi"; tagStart: number; tagEnd: number }
  | { kind: "text"; start: number; end: number };

/**
 * Tokenize an XML source string into structural events.
 *
 * Used to walk the source text while skipping CDATA sections, comments
 * and processing instructions — contexts in which markup-like characters
 * must NOT be treated as real tags.
 */
function tokenizeXml(source: string): XmlToken[] {
  const tokens: XmlToken[] = [];
  const len = source.length;
  let i = 0;
  let textStart = 0;

  while (i < len) {
    const ch = source.charCodeAt(i);
    if (ch !== 60 /* `<` */) {
      i++;
      continue;
    }

    // Emit any accumulated text up to this point as a text token.
    if (i > textStart) {
      tokens.push({ kind: "text", start: textStart, end: i });
      textStart = i;
    }

    // <![CDATA[ ... ]]>
    if (source.startsWith("<![CDATA[", i)) {
      const tagStart = i;
      const contentStart = i + "<![CDATA[".length;
      const end = source.indexOf("]]>", contentStart);
      if (end === -1) throw new XmlParseError("Unterminated CDATA section in source");
      tokens.push({
        kind: "cdata",
        tagStart,
        contentStart,
        contentEnd: end,
        tagEnd: end + "]]>".length,
      });
      i = end + "]]>".length;
      textStart = i;
      continue;
    }

    // <!-- ... -->
    if (source.startsWith("<!--", i)) {
      const tagStart = i;
      const end = source.indexOf("-->", i + 4);
      if (end === -1) throw new XmlParseError("Unterminated comment in source");
      tokens.push({ kind: "comment", tagStart, tagEnd: end + "-->".length });
      i = end + "-->".length;
      textStart = i;
      continue;
    }

    // <? ... ?>  (XML declaration or processing instruction)
    if (source.startsWith("<?", i)) {
      const tagStart = i;
      const end = source.indexOf("?>", i + 2);
      if (end === -1) throw new XmlParseError("Unterminated processing instruction");
      tokens.push({ kind: "pi", tagStart, tagEnd: end + "?>".length });
      i = end + "?>".length;
      textStart = i;
      continue;
    }

    // </name>
    if (source.charCodeAt(i + 1) === 47 /* `/` */) {
      const tagStart = i;
      let j = i + 2;
      const nameStart = j;
      while (j < len && isNameChar(source.charCodeAt(j))) j++;
      const name = source.slice(nameStart, j);
      if (!name) throw new XmlParseError(`Empty end tag at offset ${tagStart}`);
      while (j < len && isSpace(source.charCodeAt(j))) j++;
      if (source.charCodeAt(j) !== 62 /* `>` */) {
        throw new XmlParseError(`Expected '>' to close </${name}> at offset ${tagStart}`);
      }
      j++;
      tokens.push({ kind: "end", name, tagStart, tagEnd: j });
      i = j;
      textStart = i;
      continue;
    }

    // <name ...> or <name .../>
    const tagStart = i;
    let j = i + 1;
    const nameStart = j;
    while (j < len && isNameChar(source.charCodeAt(j))) j++;
    const name = source.slice(nameStart, j);
    if (!name) {
      // Stray `<` followed by something we don't recognize — let the
      // downstream XML validator flag it. Skip one char and continue.
      i++;
      continue;
    }
    while (j < len) {
      const c = source.charCodeAt(j);
      if (c === 62 /* `>` */) {
        j++;
        tokens.push({ kind: "start", name, tagStart, tagEnd: j, contentStart: j });
        break;
      }
      if (c === 47 /* `/` */ && source.charCodeAt(j + 1) === 62 /* `>` */) {
        j += 2;
        tokens.push({ kind: "selfClose", name, tagStart, tagEnd: j });
        break;
      }
      if (c === 34 /* `"` */ || c === 39 /* `'` */) {
        const quote = c;
        j++;
        while (j < len && source.charCodeAt(j) !== quote) j++;
        if (j >= len) throw new XmlParseError(`Unterminated attribute value in <${name}>`);
        j++;
        continue;
      }
      j++;
    }
    if (j >= len) throw new XmlParseError(`Unterminated start tag <${name}>`);
    i = j;
    textStart = i;
  }

  if (textStart < len) {
    tokens.push({ kind: "text", start: textStart, end: len });
  }

  return tokens;
}

function isNameChar(code: number): boolean {
  return (
    (code >= 65 && code <= 90) || // A-Z
    (code >= 97 && code <= 122) || // a-z
    (code >= 48 && code <= 57) || // 0-9
    code === 95 || code === 45 || code === 46 || code === 58 // _ - . :
  );
}

function isSpace(code: number): boolean {
  return code === 32 || code === 9 || code === 10 || code === 13;
}

// ─── fast-xml-parser integration ────────────────────────────────────────────

interface RawNode {
  [META]?: { startIndex?: number };
  ":@"?: Record<string, string>;
}

function nodeStart(node: unknown): number | undefined {
  if (node && typeof node === "object") {
    const meta = (node as RawNode)[META];
    if (meta && typeof meta.startIndex === "number") return meta.startIndex;
  }
  return undefined;
}

function nodeTagName(node: Record<string, unknown>): string | undefined {
  for (const key of Object.keys(node)) {
    if (key === ":@" || key === "#text" || key === "__cdata") continue;
    if (typeof node[key] === "object") return key;
  }
  return undefined;
}

function nodeChildren(node: Record<string, unknown>): unknown[] | undefined {
  for (const key of Object.keys(node)) {
    if (key === ":@" || key === "#text" || key === "__cdata") continue;
    const v = node[key];
    if (Array.isArray(v)) return v;
  }
  return undefined;
}

/**
 * Locate the first non-PI root element among fast-xml-parser's
 * top-level children. The library surfaces `<?xml ... ?>` as a `?xml`
 * entry and doesn't fold top-level comments/PI into it. Calling code
 * inspects the name to decide whether it's `<anki>` or something else.
 */
function findRootElement(tree: unknown[]): Record<string, unknown> | undefined {
  for (const entry of tree) {
    if (!entry || typeof entry !== "object") continue;
    const node = entry as Record<string, unknown>;
    const name = nodeTagName(node);
    if (name && name !== "?xml") return node;
  }
  return undefined;
}

// ─── Field-content extraction ───────────────────────────────────────────────

/**
 * Walk the token stream from `startIdx` (a `start` token for `name`) to
 * the matching `end` token, honoring same-name nesting. Throws if the
 * closing tag is missing.
 */
function findMatchingClose(tokens: XmlToken[], startIdx: number, name: string): number {
  let depth = 1;
  for (let k = startIdx + 1; k < tokens.length; k++) {
    const tok = tokens[k]!;
    if (tok.kind === "start" && tok.name === name) depth++;
    else if (tok.kind === "end" && tok.name === name) {
      depth--;
      if (depth === 0) return k;
    }
  }
  throw new XmlParseError(`Missing closing </${name}>`);
}

/**
 * Pull the raw source range for a field. Handles two cases:
 *
 *   - The field contains ordinary XML markup (e.g. nested HTML, MathJax,
 *     native LaTeX `[latex]...[/latex]`). Text between tags is already
 *     HTML-escaped by the author (in valid XML, `<` cannot appear in
 *     PCDATA), so we pass those slices through unchanged.
 *
 *   - The field body is a CDATA section. CDATA text is raw — we escape
 *     `<`, `>`, and bare `&` so the result is safe to embed in Anki's
 *     HTML field, while preserving existing entities like `&lt;` and
 *     `&amp;` so they don't get double-escaped.
 *
 * Mixed CDATA + markup is supported: tokens between the open and close
 * tags are concatenated in document order, with CDATA contents escaped
 * and all other tokens copied verbatim from the source.
 */
function extractFieldContent(
  source: string,
  tokens: XmlToken[],
  openIdx: number,
): { html: string } {
  const open = tokens[openIdx]!;
  if (open.kind !== "start") {
    throw new XmlParseError("Internal: extractFieldContent called on non-start token");
  }
  const closeIdx = findMatchingClose(tokens, openIdx, open.name);
  const close = tokens[closeIdx]!;
  if (close.kind !== "end") throw new XmlParseError("Internal: expected end token");

  let out = "";
  for (let k = openIdx + 1; k < closeIdx; k++) {
    const tok = tokens[k]!;
    if (tok.kind === "cdata") {
      out += escapeCdataForHtml(source.slice(tok.contentStart, tok.contentEnd));
    } else if (tok.kind === "start" || tok.kind === "end" || tok.kind === "selfClose") {
      out += source.slice(tok.tagStart, tok.tagEnd);
    } else if (tok.kind === "text") {
      // Text between tags is already-HTML-escaped content; copy verbatim.
      out += source.slice(tok.start, tok.end);
    }
    // Comments and processing instructions are dropped.
  }
  return { html: out };
}

/**
 * Make a CDATA body safe to embed in an Anki HTML field.
 *
 * CDATA is literally text, so `<` and `>` are not delimiters inside it
 * but they ARE in the surrounding HTML field — we have to escape them.
 * `&` is also escaped, but we must skip sequences that are already a
 * valid entity (`&lt;`, `&amp;`, `&#39;`, `&#x27;`, ...) so they
 * survive verbatim instead of being doubled (`&amp;lt;`).
 *
 *   "<"  -> "&lt;"
 *   ">"  -> "&gt;"
 *   "&"  -> "&amp;"   unless followed by an entity pattern
 */
function escapeCdataForHtml(s: string): string {
  return s
    .replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]*|#\d+|#x[0-9a-fA-F]+);)/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ─── Public parsing API ──────────────────────────────────────────────────────────

/**
 * Result of parsing an `<anki>` document: the list of notes and the
 * deck declared on the root element (used for inheritance).
 */
export interface ParsedDocument {
  notes: ParsedNote[];
  defaultDeck: string;
}

/**
 * Parse the XML document into notes and recover the default-deck
 * attribute on the `<anki>` root. Throws `XmlParseError` for malformed
 * XML, missing root, or any wrong root element.
 *
 * Callers that want both notes and default deck should prefer this
 * over `parseNotes` so they don't have to grep source text with a
 * regex (which is brittle in the face of comments that contain the
 * literal text "<anki>").
 */
export function parseDocument(source: string): ParsedDocument {
  return parseNotesInner(source);
}

/**
 * Parse the XML document and return every `<note>` with its attributes
 * and raw field HTML strings. Throws `XmlParseError` for malformed XML
 * or missing root.
 *
 * Use `parseDocument` instead if you also need the root-level default
 * deck.
 */
export function parseNotes(source: string): ParsedNote[] {
  return parseNotesInner(source).notes;
}

function parseNotesInner(source: string): ParsedDocument {
  const parser = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: false,
    cdataPropName: "__cdata",
    textNodeName: "#text",
    captureMetaData: true,
    removeNSPrefix: false,
    allowBooleanAttributes: false,
    // fast-xml-parser v5.10 ships with an empty default `unpairedTags`
    // list. Anki card content is HTML, so we must declare the common
    // HTML void elements explicitly or they will swallow later tags
    // as if they were paired (e.g. `<br>line2</front><back>...`).
    unpairedTags: [
      "br", "hr", "img", "input", "meta", "link", "area", "base", "col",
      "embed", "param", "source", "track", "wbr",
    ],
  });

  let tree: unknown;
  try {
    tree = parser.parse(source);
  } catch (err) {
    throw new XmlParseError(`Malformed XML: ${(err as Error).message}`);
  }

  if (!Array.isArray(tree) || tree.length === 0) {
    throw new XmlParseError("XML has no root element");
  }

  // fast-xml-parser surfaces the XML declaration `<?xml ... ?>` as a
  // top-level entry with the synthetic tag name "?xml". Walk past any
  // top-level `?xml` / stray processing instruction to find the real
  // root. If the first non-PI element exists but isn't `<anki>`, we
  // surface that fact in the error message.
  const rootEntry = findRootElement(tree);
  if (!rootEntry) {
    throw new XmlParseError("XML has no root element");
  }
  const rootName = nodeTagName(rootEntry);
  if (rootName !== "anki") {
    throw new XmlParseError(`Root element must be <anki>, got <${rootName ?? "?"}>`);
  }

  const rootAttrs = (rootEntry[":@"] as Record<string, string> | undefined) ?? {};
  const defaultDeck = rootAttrs["@_deck"] ?? "";

  const rootChildren = nodeChildren(rootEntry);
  if (!rootChildren) throw new XmlParseError("Root <anki> has no children");

  const tokens = tokenizeXml(source);
  const notes: ParsedNote[] = [];
  let noteCounter = 0;

  for (const child of rootChildren) {
    if (!child || typeof child !== "object") continue;
    const childNode = child as Record<string, unknown>;
    const tag = nodeTagName(childNode);
    if (tag !== "note") continue;
    noteCounter++;
    const attrs = (childNode[":@"] as Record<string, string> | undefined) ?? {};
    const note: ParsedNote = {
      number: noteCounter,
      type: attrs["@_type"] ?? "",
      deck: attrs["@_deck"] ?? "",
      tags: attrs["@_tags"] ?? "",
      fields: [],
    };

    const noteChildren = nodeChildren(childNode) ?? [];

    for (const grandchild of noteChildren) {
      if (!grandchild || typeof grandchild !== "object") continue;
      const gNode = grandchild as Record<string, unknown>;
      const gTag = nodeTagName(gNode);
      if (!gTag || !FIELD_NAMES.has(gTag as XmlFieldName)) continue;
      const fieldName = gTag as XmlFieldName;
      // Duplicate field tags are intentionally NOT silently skipped
      // here — we push every occurrence so the validator can flag
      // repeats via <field>.push + length-based dedup detection.


      const startIdx = nodeStart(gNode);
      if (startIdx === undefined) {
        throw new XmlParseError(`Cannot locate source for <${fieldName}> in note ${noteCounter}`);
      }
      const tokenIdx = tokens.findIndex(
        (t) => t.kind === "start" && t.tagStart === startIdx && t.name === fieldName,
      );
      if (tokenIdx === -1) {
        throw new XmlParseError(`Cannot locate token for <${fieldName}> in note ${noteCounter}`);
      }
      const { html } = extractFieldContent(source, tokens, tokenIdx);
      note.fields.push({ name: fieldName, html });
    }

    notes.push(note);
  }

  return { notes, defaultDeck };
}

/**
 * Validate the parsed notes against our structural rules.
 *
 * Every error is collected and returned together; the caller decides how
 * to present them. The function does not contact AnkiConnect.
 */
export function validateNotes(
  notes: ParsedNote[],
  defaultDeck: string,
): ValidationResult {
  const errors: NoteValidationError[] = [];
  const valid: ValidatedNote[] = [];

  if (notes.length === 0) {
    errors.push({ noteNumber: 0, message: "No <note> elements found inside <anki>" });
    return { notes: [], errors };
  }

  for (const note of notes) {
    const noteErrors: string[] = [];

    if (!note.type.trim()) {
      noteErrors.push("missing or empty `type` attribute on <note>");
    } else if (!SUPPORTED_MODELS.has(note.type)) {
      noteErrors.push(
        `unsupported note type "${note.type}"; v1 supports: ${[...SUPPORTED_MODELS].join(", ")}`,
      );
    }

    const deck = note.deck.trim() || defaultDeck.trim();
    if (!deck) {
      noteErrors.push("no deck: set `deck` on <anki> or on each <note>");
    }

    // Detect duplicate field tags.
    const fieldNames = note.fields.map((f) => f.name);
    const dupes = fieldNames.filter((n, i) => fieldNames.indexOf(n) !== i);
    for (const d of new Set(dupes)) {
      noteErrors.push(`<${d}> appears more than once`);
    }

    const front = note.fields.find((f) => f.name === "front");
    const back = note.fields.find((f) => f.name === "back");
    const text = note.fields.find((f) => f.name === "text");
    const extra = note.fields.find((f) => f.name === "extra");
    const addReverse = note.fields.find((f) => f.name === "addReverse");

    // Per-model required-field / forbidden-field rules.
    if (note.type === "Basic" || note.type === "Basic (and reversed card)" || note.type === "Basic (type in the answer)") {
      if (!front) noteErrors.push(`<${note.type}> requires <front>`);
      else if (!hasMeaningfulContent(front.html))
        noteErrors.push("<front> is empty or contains only whitespace/HTML tags");
      if (!back) noteErrors.push(`<${note.type}> requires <back>`);
      else if (!hasMeaningfulContent(back.html))
        noteErrors.push("<back> is empty or contains only whitespace/HTML tags");
      if (text) noteErrors.push(`<${note.type}> must not include <text>`);
      if (addReverse) noteErrors.push(`<${note.type}> must not include <addReverse>`);
    } else if (note.type === "Basic (optional reversed card)") {
      if (!front) noteErrors.push("<front> is required");
      else if (!hasMeaningfulContent(front.html))
        noteErrors.push("<front> is empty or contains only whitespace/HTML tags");
      if (!back) noteErrors.push("<back> is required");
      else if (!hasMeaningfulContent(back.html))
        noteErrors.push("<back> is empty or contains only whitespace/HTML tags");
      if (!addReverse) {
        noteErrors.push("<addReverse> is required (use yes or no)");
      } else {
        const v = addReverse.html.trim().toLowerCase();
        if (v !== "yes" && v !== "no") {
          noteErrors.push(`<addReverse> must be "yes" or "no", got "${addReverse.html.trim()}"`);
        }
      }
      if (text) noteErrors.push("Basic (optional reversed card) must not include <text>");
    } else if (note.type === "Cloze") {
      if (!text) noteErrors.push("Cloze requires <text> (containing {{c1::...}} markers)");
      else if (!hasMeaningfulContent(text.html))
        noteErrors.push("<text> is empty or contains only whitespace/HTML tags");
      else if (!hasClozeMarkers(text.html))
        noteErrors.push(`<text> for a Cloze note must contain at least one {{cN::...}} marker`);
      if (front || back)
        noteErrors.push("Cloze must not include <front> or <back> — use <text> instead");
      if (addReverse)
        noteErrors.push("Cloze must not include <addReverse>");
      if (extra && !hasMeaningfulContent(extra.html)) {
        noteErrors.push("<extra> is empty or contains only whitespace/HTML tags");
      }
    }

    if (noteErrors.length > 0) {
      for (const msg of noteErrors) errors.push({ noteNumber: note.number, message: msg });
      continue;
    }

    const validated: ValidatedNote = {
      number: note.number,
      deckName: deck,
      modelName: note.type as SupportedModel,
      fields: buildFields(note.type as SupportedModel, front, back, text, extra, addReverse),
      tags: parseTags(note.tags),
    };
    valid.push(validated);
  }

  return { notes: valid, errors };
}

/** Map our parsed fields onto Anki field names per supported model. */
function buildFields(
  model: SupportedModel,
  front: ParsedField | undefined,
  back: ParsedField | undefined,
  text: ParsedField | undefined,
  extra: ParsedField | undefined,
  addReverse: ParsedField | undefined,
): Record<string, string> {
  switch (model) {
    case "Basic":
    case "Basic (and reversed card)":
    case "Basic (type in the answer)":
      return {
        Front: front!.html.trim(),
        Back: back!.html.trim(),
      };
    case "Basic (optional reversed card)":
      return {
        Front: front!.html.trim(),
        Back: back!.html.trim(),
        "Add Reverse": addReverse!.html.trim(),
        Extra: extra?.html.trim() ?? "",
      };
    case "Cloze":
      return {
        Text: text!.html.trim(),
        Extra: extra?.html.trim() ?? "",
      };
  }
}

/** Parse the `tags` attribute (whitespace-separated). Empty -> []. */
function parseTags(raw: string): string[] {
  return raw
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/**
 * A field is "empty" if its stripped text is empty. Tags are stripped
 * before checking so `<img src="..."/>` alone does not count as content.
 */
function hasMeaningfulContent(html: string): boolean {
  const stripped = html.replace(/<[^>]*>/g, "").trim();
  return stripped.length > 0;
}

/** A Cloze field must contain at least one `{{cN::...}}` marker. */
function hasClozeMarkers(html: string): boolean {
  return /\{\{c\d+::/.test(html);
}