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

import { XMLParser, XMLValidator } from "fast-xml-parser";
// `captureMetaData: true` attaches per-node start indices under a Symbol.
// The symbol is created internally by fast-xml-parser; the supported way to
// retrieve it is XMLParser.getMetaDataSymbol().
const META = XMLParser.getMetaDataSymbol() as unknown as symbol;
import { getModel, SUPPORTED_MODEL_NAMES } from "./models.ts";
import type {
  NoteValidationError,
  ParsedField,
  ParsedNote,
  SupportedModel,
  ValidationResult,
  ValidatedNote,
  XmlFieldName,
} from "./types.ts";

/** HTML void elements accepted without XML-style `/>` inside Anki fields. */
const HTML_VOID_TAGS = [
  "br",
  "hr",
  "img",
  "input",
  "meta",
  "link",
  "area",
  "base",
  "col",
  "embed",
  "param",
  "source",
  "track",
  "wbr",
];

/** Tags that appear inside `<note>` and map to Anki fields. */
const FIELD_NAMES: ReadonlySet<XmlFieldName> = new Set([
  "front",
  "back",
  "text",
  "extra",
  "addReverse",
]);

/** All supported Anki note types, exactly as Anki names them.
 *
 * Derived from the `MODELS` registry (P2.4) so that the supported set
 * is always in sync with the validator. Used by callers that need to
 * cheaply check model membership without doing a full lookup.
 */
export const SUPPORTED_MODELS: ReadonlySet<string> = new Set<SupportedModel>(
  SUPPORTED_MODEL_NAMES as SupportedModel[],
);

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
  | { kind: "markupDecl"; tagStart: number; tagEnd: number }
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

    // <!DOCTYPE ...> and other <! ... > markup declarations. We
    // discard them the same way fast-xml-parser does — we don't
    // validate against any DTD, so the declaration is a no-op. We
    // also emit a `markupDecl` token so the text-token PCDATA check
    // never sees the inner `<` characters of e.g. `<!ENTITY ...>`.
    if (source.startsWith("<!", i)) {
      const tagStart = i;
      const end = source.indexOf(">", i + 2);
      if (end === -1) throw new XmlParseError("Unterminated markup declaration");
      tokens.push({ kind: "markupDecl", tagStart, tagEnd: end + 1 });
      i = end + 1;
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
    let terminated = false;
    while (j < len) {
      const c = source.charCodeAt(j);
      if (c === 62 /* `>` */) {
        j++;
        tokens.push({ kind: "start", name, tagStart, tagEnd: j, contentStart: j });
        terminated = true;
        break;
      }
      if (c === 47 /* `/` */ && source.charCodeAt(j + 1) === 62 /* `>` */) {
        j += 2;
        tokens.push({ kind: "selfClose", name, tagStart, tagEnd: j });
        terminated = true;
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
    if (!terminated) throw new XmlParseError(`Unterminated start tag <${name}>`);
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

/**
 * Validate the PCDATA in a source text.
 *
 * `<` and a bare `&` (one not followed by an entity pattern) are
 * illegal in PCDATA per the XML spec. fast-xml-parser is lenient and
 * will happily produce a corrupted tree when they appear — e.g.
 * `5 < 10` gets parsed as text + a phantom `<10>` element. We reject
 * these up front so the author gets a clear error instead of a
 * silently broken import.
 *
 * CDATA sections, comments, processing instructions, and attribute
 * values are skipped: those contexts permit `<` and `&` literally.
 */
function validatePcdata(source: string, tokens: XmlToken[]): void {
  for (const tok of tokens) {
    if (tok.kind !== "text") continue;
    const text = source.slice(tok.start, tok.end);
    const idx = tok.start;
    if (text.includes("<")) {
      throw new XmlParseError(
        `Illegal '<' in PCDATA at offset ${idx}; use &lt; or wrap the field in CDATA`,
      );
    }
    if (/&(?!(?:[a-zA-Z][a-zA-Z0-9]*|#[0-9]+|#x[0-9a-fA-F]+);)/.test(text)) {
      throw new XmlParseError(
        `Illegal '&' in PCDATA at offset ${idx}; use &amp; or wrap the field in CDATA`,
      );
    }
  }
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
    // Comments, processing instructions, and DOCTYPE/markup
    // declarations are dropped — they never contribute to the
    // rendered field body.
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
  // XMLParser is deliberately permissive (it can recover from a missing
  // `</note>`, for example), so validate first. This keeps malformed AI
  // output from being silently interpreted as a different note structure.
  // The same HTML void-tag extension is passed to both stages.
  const wellFormed = XMLValidator.validate(source, {
    allowBooleanAttributes: false,
    unpairedTags: HTML_VOID_TAGS,
  });
  if (wellFormed !== true) {
    const { msg, line, col } = wellFormed.err;
    throw new XmlParseError(`Malformed XML: ${msg} (line ${line}, column ${col})`);
  }

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
    unpairedTags: HTML_VOID_TAGS,
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

  // Optional `version="N"` attribute on <anki> for forward-compat with
  // future schema versions. v1 is the default; explicit "1" is a no-op.
  // Any other value is a validation error so authors learn early when
  // they're writing against a schema the current CLI doesn't support.
  const versionAttr = rootAttrs["@_version"];
  if (versionAttr !== undefined && versionAttr !== "1") {
    // We'll surface this as a validation error after parsing so the
    // caller gets a clean report. Throw with a sentinel message that
    // the validator can match.
    throw new XmlParseError(
      `Unsupported <anki version="${versionAttr}">; this CLI targets schema version 1. Remove the attribute or set version="1".`,
    );
  }

  const rootChildren = nodeChildren(rootEntry) ?? [];

  const tokens = tokenizeXml(source);
  // Catch illegal PCDATA early — before the parser's lenient handling
  // can produce a silently corrupted tree. See validatePcdata docs.
  validatePcdata(source, tokens);
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
      sourceOffset: nodeStart(childNode),
      fieldSourceOffsets: [],
      unknownElements: [],
    };
    // Optional `id="N"` attribute: when present, the note is treated as
    // an update against an existing Anki note. Parsing/validation here
    // is passive — the import command skips these notes (Phase 4 will
    // add an `--update-existing` flag). The numeric check + duplicate
    // detection live in validateNotes().
    const idRaw = attrs["@_id"];
    if (idRaw !== undefined && idRaw !== "") {
      const n = Number(idRaw);
      if (Number.isFinite(n) && Number.isInteger(n) && n > 0) {
        note.id = n;
      }
    }

    const noteChildren = nodeChildren(childNode) ?? [];

    for (const grandchild of noteChildren) {
      if (!grandchild || typeof grandchild !== "object") continue;
      const gNode = grandchild as Record<string, unknown>;
      const gTag = nodeTagName(gNode);
      if (!gTag) continue;
      if (!FIELD_NAMES.has(gTag as XmlFieldName)) {
        // Not a known field. Surface as a warning so the AI author
        // can fix typos (e.g. `<frobt>` instead of `<front>`)
        // without silently dropping data.
        note.unknownElements?.push(gTag);
        continue;
      }
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
      if (note.fieldSourceOffsets) note.fieldSourceOffsets.push(startIdx);
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
 *
 * The per-model rules live in the `MODELS` registry (P2.4). This
 * function is therefore model-agnostic: it looks up the model, checks
 * required/optional/forbidden fields, applies any model-specific
 * extra validator, and uses the registry's `buildFields` to assemble
 * the Anki field map. Adding a new model no longer requires editing
 * this function.
 */
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

  // Track ids seen so we can detect duplicates across the file.
  const seenIds = new Map<number, number>();

  for (const note of notes) {
    const noteErrors: { msg: string; fieldIndex?: number }[] = [];

    if (!note.type.trim()) {
      noteErrors.push({ msg: "missing or empty `type` attribute on <note>" });
    } else if (!SUPPORTED_MODELS.has(note.type)) {
      noteErrors.push({
        msg: `unsupported note type "${note.type}"; v1 supports: ${[...SUPPORTED_MODELS].join(", ")}`,
      });
    }

    const deck = note.deck.trim() || defaultDeck.trim();
    if (!deck) {
      noteErrors.push({ msg: "no deck: set `deck` on <anki> or on each <note>" });
    }

    // Validate id attribute (must be a positive integer if present).
    if (note.id !== undefined) {
      if (note.id <= 0) {
        noteErrors.push({ msg: `id attribute must be a positive integer (got ${note.id})` });
      } else {
        const firstSeen = seenIds.get(note.id);
        if (firstSeen !== undefined) {
          noteErrors.push({
            msg: `id ${note.id} is used more than once (also in note ${firstSeen})`,
          });
        } else {
          seenIds.set(note.id, note.number);
        }
      }
    }

    const model = getModel(note.type);
    if (model) {
      // Detect duplicate field tags.
      const fieldNames = note.fields.map((f) => f.name);
      const fieldIndices = note.fields.map((_, i) => i);
      const dupes = fieldNames
        .map((n, i) => ({ n, i }))
        .filter((x, idx) => fieldNames.indexOf(x.n) !== idx);
      const seenDupes = new Set<string>();
      for (const d of dupes) {
        if (seenDupes.has(d.n)) continue;
        seenDupes.add(d.n);
        noteErrors.push({ msg: `<${d.n}> appears more than once`, fieldIndex: d.i });
      }
      // Suppress unused linter warning.
      void fieldIndices;

      // Fields used in this note that the model doesn't accept.
      note.fields.forEach((field, i) => {
        if (!model.accepts.has(field.name)) {
          noteErrors.push({
            msg: `<${field.name}> is not accepted by ${model.name}; expected one of: ${[...model.accepts].join(", ")}`,
            fieldIndex: i,
          });
        }
      });

      // Required fields that are missing.
      for (const req of model.required) {
        const i = note.fields.findIndex((f) => f.name === req);
        if (i === -1) {
          noteErrors.push({ msg: `${model.name} requires <${req}>` });
        } else {
          const present = note.fields[i]!;
          if (model.checkContent && !hasMeaningfulContent(present.html)) {
            noteErrors.push({
              msg: `<${req}> is empty or contains only whitespace/HTML tags`,
              fieldIndex: i,
            });
          }
        }
      }

      // Optional fields with empty content get flagged when content
      // checks are on (catches `<extra>   </extra>` accidents).
      if (model.checkContent) {
        note.fields.forEach((field, i) => {
          if (model.optional.has(field.name) && !hasMeaningfulContent(field.html)) {
            noteErrors.push({
              msg: `<${field.name}> is empty or contains only whitespace/HTML tags`,
              fieldIndex: i,
            });
          }
        });
      }

      // Model-specific extra rules.
      if (model.validateExtras) {
        const extraErrors = model.validateExtras(note);
        for (const msg of extraErrors) noteErrors.push({ msg });
      }
    }

    if (noteErrors.length > 0) {
      for (const e of noteErrors) {
        const offset = e.fieldIndex !== undefined
          ? note.fieldSourceOffsets?.[e.fieldIndex]
          : note.sourceOffset;
        const loc = source !== undefined && offset !== undefined
          ? sourceLocation(source, offset)
          : {};
        errors.push({ noteNumber: note.number, message: e.msg, ...loc });
      }
      continue;
    }

    const tags = parseTags(note.tags);
    validateTags(tags, note.number, warnings);
    // Unknown elements are warnings, not errors. Anki's own parser
    // is permissive about extra fields; we surface them so the AI
    // author can fix typos without the import failing.
    if (note.unknownElements) {
      for (const el of note.unknownElements) {
        warnings.push({
          noteNumber: note.number,
          message: `unknown element <${el}> inside <note> — expected one of the model's fields; this element was ignored`,
        });
      }
    }

    const validated: ValidatedNote = {
      number: note.number,
      id: note.id,
      deckName: deck,
      modelName: note.type as SupportedModel,
      fields: model!.buildFields(note.fields),
      tags,
    };
    valid.push(validated);
  }

  return { notes: valid, errors, warnings };
}

/**
 * Compute the 1-based line and column for a source offset. Used by
 * the validator to attach a precise location to each error.
 */
function sourceLocation(source: string, offset: number): { line: number; column: number } {
  let line = 1;
  let column = 1;
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source.charCodeAt(i) === 10) {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  return { line, column };
}

/**
 * Surface non-fatal tag problems so AI authors can fix them before
 * they reach the collection. Each check appends to `warnings` rather
 * than `errors` — Anki itself accepts almost anything as a tag.
 */
function validateTags(
  tags: string[],
  noteNumber: number,
  warnings: NoteValidationError[],
): void {
  for (const tag of tags) {
    if (tag.includes(",")) {
      warnings.push({
        noteNumber,
        message: `tag "${tag}" contains a comma; this is usually two tags accidentally joined — split into separate whitespace-separated tags`,
      });
    }
    if (tag.length > 100) {
      warnings.push({
        noteNumber,
        message: `tag "${tag.slice(0, 30)}${tag.length > 30 ? "…" : ""}" is unusually long (${tag.length} chars)`,
      });
    }
    if (/[\x00-\x1f\x7f]/.test(tag)) {
      warnings.push({
        noteNumber,
        message: `tag contains control characters`,
      });
    }
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
 *
 * Re-exported from models.ts so the validator and the registry share
 * one implementation.
 */
import { hasMeaningfulContent } from "./models.ts";