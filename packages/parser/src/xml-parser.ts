/**
 * Full-document XML parser for `<anki>` documents.
 * Supports legacy short field tags and `<field name="...">` / `<tag>` / nested `<deck>`.
 */

import { XMLValidator } from "fast-xml-parser";
import { escapeCdataForHtml, HTML_VOID_TAGS } from "./cdata.ts";
import {
  createLineIndex,
  lineAtOffset,
  tokenizeXml,
  type XmlToken,
} from "./tokenize.ts";
import { XmlParseError } from "./errors.ts";
import { normalizeFieldKey } from "@anki-xml/models";
import type { ParsedField, ParsedNote } from "@anki-xml/utils";

const LEGACY_FIELD_TAGS = new Set([
  "front",
  "back",
  "text",
  "extra",
  "addreverse",
]);

export interface ParsedDocument {
  notes: ParsedNote[];
  defaultDeck: string;
  version: string;
}

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

export function extractFieldContent(
  source: string,
  tokens: XmlToken[],
  openIdx: number,
): { html: string } {
  const open = tokens[openIdx]!;
  if (open.kind !== "start") {
    throw new XmlParseError("Internal: extractFieldContent called on non-start token");
  }
  const closeIdx = findMatchingClose(tokens, openIdx, open.name);
  let out = "";
  for (let k = openIdx + 1; k < closeIdx; k++) {
    const tok = tokens[k]!;
    if (tok.kind === "cdata") {
      out += escapeCdataForHtml(source.slice(tok.contentStart, tok.contentEnd));
    } else if (tok.kind === "start" || tok.kind === "end" || tok.kind === "selfClose") {
      out += source.slice(tok.tagStart, tok.tagEnd);
    } else if (tok.kind === "text") {
      out += source.slice(tok.start, tok.end);
    }
  }
  return { html: out };
}

function extractTextContent(source: string, tokens: XmlToken[], openIdx: number): string {
  return extractFieldContent(source, tokens, openIdx).html;
}

function validatePcdata(source: string, tokens: XmlToken[], lineStarts: number[]): void {
  for (const tok of tokens) {
    if (tok.kind !== "text") continue;
    const text = source.slice(tok.start, tok.end);
    if (text.includes("<")) {
      throw new XmlParseError(
        `Illegal '<' in PCDATA at offset ${tok.start}; use &lt; or wrap the field in CDATA`,
        lineAtOffset(lineStarts, tok.start),
      );
    }
    if (/&(?!(?:[a-zA-Z][a-zA-Z0-9]*|#[0-9]+|#x[0-9a-fA-F]+);)/.test(text)) {
      throw new XmlParseError(
        `Illegal '&' in PCDATA at offset ${tok.start}; use &amp; or wrap the field in CDATA`,
        lineAtOffset(lineStarts, tok.start),
      );
    }
  }
}

export interface ParseDocumentOptions {
  /**
   * Skip the fast-xml-parser well-formedness pass. The streaming path
   * passes `false` because its scanner + tokenizer already detect
   * unterminated CDATA/comments/tags, duplicate or unquoted
   * attributes, stray `</note>`/`</deck>` end tags, and PCDATA issues.
   */
  validateWellformed?: boolean;
}

/**
 * Walk tokens and collect notes. Handles:
 *   <anki deck="X"> <note>...</note> </anki>
 *   <anki> <deck name="X"> <note>...</note> </deck> </anki>
 */
export function parseDocument(
  source: string,
  options: ParseDocumentOptions = {},
): ParsedDocument {
  if (options.validateWellformed !== false) {
    const wellFormed = XMLValidator.validate(source, {
      allowBooleanAttributes: false,
      unpairedTags: [...HTML_VOID_TAGS],
    });
    if (wellFormed !== true) {
      const { msg, line, col } = wellFormed.err;
      throw new XmlParseError(`Malformed XML: ${msg}`, { line, column: col });
    }
  }

  const lineStarts = createLineIndex(source);
  const tokens = tokenizeXml(source);
  validatePcdata(source, tokens, lineStarts);

  let rootIdx = -1;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.kind === "start" && t.name === "anki") {
      rootIdx = i;
      break;
    }
  }
  if (rootIdx === -1) {
    throw new XmlParseError("Root element must be <anki>");
  }

  const root = tokens[rootIdx] as Extract<XmlToken, { kind: "start" }>;
  const version = root.attrs["version"] ?? "1";
  if (version !== "1") {
    throw new XmlParseError(
      `Unsupported <anki version="${version}">; this CLI targets schema version 1.`,
    );
  }
  const defaultDeck = root.attrs["deck"] ?? "";

  const notes: ParsedNote[] = [];
  let noteCounter = 0;
  let deckStack: string[] = [];

  const rootClose = findMatchingClose(tokens, rootIdx, "anki");

  for (let i = rootIdx + 1; i < rootClose; i++) {
    const tok = tokens[i]!;

    if (tok.kind === "start" && tok.name === "deck") {
      deckStack.push(tok.attrs["name"] ?? "");
      continue;
    }
    if (tok.kind === "end" && tok.name === "deck") {
      deckStack.pop();
      continue;
    }

    if (tok.kind !== "start" || tok.name !== "note") continue;

    noteCounter++;
    const noteClose = findMatchingClose(tokens, i, "note");
    const loc = lineAtOffset(lineStarts, tok.tagStart);
    const inheritedDeck = deckStack.length > 0 ? deckStack[deckStack.length - 1]! : "";
    const note: ParsedNote = {
      number: noteCounter,
      type: tok.attrs["type"] ?? "",
      deck: tok.attrs["deck"] || inheritedDeck,
      tags: tok.attrs["tags"] ?? "",
      tagsSpecified: tok.attrs["tags"] !== undefined,
      fields: [],
      sourceOffset: tok.tagStart,
      fieldSourceOffsets: [],
      unknownElements: [],
      line: loc.line,
    };

    const idRaw = tok.attrs["id"];
    if (idRaw !== undefined && idRaw !== "") {
      const n = Number(idRaw);
      if (Number.isFinite(n) && Number.isInteger(n) && n > 0) note.id = n;
    }

    const tagParts: string[] = [];
    let hasTagChildren = false;
    if (note.tags.trim()) tagParts.push(note.tags.trim());

    for (let j = i + 1; j < noteClose; j++) {
      const child = tokens[j]!;
      if (child.kind !== "start") continue;

      const tagLower = child.name.toLowerCase();

      if (tagLower === "tag") {
        hasTagChildren = true;
        const text = extractTextContent(source, tokens, j).trim();
        if (text) tagParts.push(text);
        j = findMatchingClose(tokens, j, child.name);
        continue;
      }

      if (tagLower === "field") {
        const displayName = child.attrs["name"] ?? "";
        if (!displayName) {
          note.unknownElements?.push("field(missing name)");
          j = findMatchingClose(tokens, j, child.name);
          continue;
        }
        const { html } = extractFieldContent(source, tokens, j);
        const field: ParsedField = {
          name: normalizeFieldKey(displayName),
          displayName,
          html,
        };
        note.fields.push(field);
        note.fieldSourceOffsets?.push(child.tagStart);
        j = findMatchingClose(tokens, j, child.name);
        continue;
      }

      if (LEGACY_FIELD_TAGS.has(tagLower)) {
        const key = tagLower === "addreverse" ? "addReverse" : tagLower;
        const { html } = extractFieldContent(source, tokens, j);
        note.fields.push({ name: key, html });
        note.fieldSourceOffsets?.push(child.tagStart);
        j = findMatchingClose(tokens, j, child.name);
        continue;
      }

      // Nested elements that aren't fields — skip with warning, advance past
      if (tagLower !== "note") {
        note.unknownElements?.push(child.name);
        try {
          j = findMatchingClose(tokens, j, child.name);
        } catch {
          /* ignore */
        }
      }
    }

    note.tags = tagParts.join(" ");
    if (note.tagsSpecified !== true && hasTagChildren) note.tagsSpecified = true;
    notes.push(note);
    i = noteClose;
  }

  return { notes, defaultDeck, version };
}

export { XmlParseError, HTML_VOID_TAGS };
