/**
 * Source-byte XML tokenizer.
 * Never decodes entities. CDATA / comments / PIs are distinct token kinds.
 */

import { XmlParseError } from "./errors.ts";

export type XmlToken =
  | { kind: "start"; name: string; tagStart: number; tagEnd: number; contentStart: number; attrs: Record<string, string> }
  | { kind: "selfClose"; name: string; tagStart: number; tagEnd: number; attrs: Record<string, string> }
  | { kind: "end"; name: string; tagStart: number; tagEnd: number }
  | { kind: "cdata"; tagStart: number; contentStart: number; contentEnd: number; tagEnd: number }
  | { kind: "comment"; tagStart: number; tagEnd: number }
  | { kind: "pi"; tagStart: number; tagEnd: number }
  | { kind: "markupDecl"; tagStart: number; tagEnd: number }
  | { kind: "text"; start: number; end: number };

function isNameChar(code: number): boolean {
  return (
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    (code >= 48 && code <= 57) ||
    code === 95 ||
    code === 45 ||
    code === 46 ||
    code === 58
  );
}

function isSpace(code: number): boolean {
  return code === 32 || code === 9 || code === 10 || code === 13;
}

function parseAttrs(source: string, from: number, to: number): Record<string, string> {
  const attrs: Record<string, string> = {};
  let i = from;
  while (i < to) {
    while (i < to && isSpace(source.charCodeAt(i))) i++;
    if (i >= to) break;
    const nameStart = i;
    while (i < to && isNameChar(source.charCodeAt(i))) i++;
    if (i === nameStart) break;
    const name = source.slice(nameStart, i);
    while (i < to && isSpace(source.charCodeAt(i))) i++;
    if (source.charCodeAt(i) !== 61 /* = */) continue;
    i++;
    while (i < to && isSpace(source.charCodeAt(i))) i++;
    const quote = source.charCodeAt(i);
    if (quote !== 34 && quote !== 39) continue;
    i++;
    const valStart = i;
    while (i < to && source.charCodeAt(i) !== quote) i++;
    attrs[name] = source.slice(valStart, i);
    if (i < to) i++;
  }
  return attrs;
}

export function tokenizeXml(source: string): XmlToken[] {
  const tokens: XmlToken[] = [];
  const len = source.length;
  let i = 0;
  let textStart = 0;

  while (i < len) {
    const ch = source.charCodeAt(i);
    if (ch !== 60 /* < */) {
      i++;
      continue;
    }

    if (i > textStart) {
      tokens.push({ kind: "text", start: textStart, end: i });
      textStart = i;
    }

    if (source.startsWith("<![CDATA[", i)) {
      const tagStart = i;
      const contentStart = i + 9;
      const end = source.indexOf("]]>", contentStart);
      if (end === -1) throw new XmlParseError("Unterminated CDATA section in source");
      tokens.push({
        kind: "cdata",
        tagStart,
        contentStart,
        contentEnd: end,
        tagEnd: end + 3,
      });
      i = end + 3;
      textStart = i;
      continue;
    }

    if (source.startsWith("<!--", i)) {
      const tagStart = i;
      const end = source.indexOf("-->", i + 4);
      if (end === -1) throw new XmlParseError("Unterminated comment in source");
      tokens.push({ kind: "comment", tagStart, tagEnd: end + 3 });
      i = end + 3;
      textStart = i;
      continue;
    }

    if (source.startsWith("<!", i)) {
      const tagStart = i;
      const end = source.indexOf(">", i + 2);
      if (end === -1) throw new XmlParseError("Unterminated markup declaration");
      tokens.push({ kind: "markupDecl", tagStart, tagEnd: end + 1 });
      i = end + 1;
      textStart = i;
      continue;
    }

    if (source.startsWith("<?", i)) {
      const tagStart = i;
      const end = source.indexOf("?>", i + 2);
      if (end === -1) throw new XmlParseError("Unterminated processing instruction");
      tokens.push({ kind: "pi", tagStart, tagEnd: end + 2 });
      i = end + 2;
      textStart = i;
      continue;
    }

    if (source.charCodeAt(i + 1) === 47 /* / */) {
      const tagStart = i;
      let j = i + 2;
      const nameStart = j;
      while (j < len && isNameChar(source.charCodeAt(j))) j++;
      const name = source.slice(nameStart, j);
      if (!name) throw new XmlParseError(`Empty end tag at offset ${tagStart}`);
      while (j < len && isSpace(source.charCodeAt(j))) j++;
      if (source.charCodeAt(j) !== 62) {
        throw new XmlParseError(`Expected '>' to close </${name}> at offset ${tagStart}`);
      }
      j++;
      tokens.push({ kind: "end", name, tagStart, tagEnd: j });
      i = j;
      textStart = i;
      continue;
    }

    const tagStart = i;
    let j = i + 1;
    const nameStart = j;
    while (j < len && isNameChar(source.charCodeAt(j))) j++;
    const name = source.slice(nameStart, j);
    if (!name) {
      i++;
      continue;
    }
    const attrStart = j;
    let terminated = false;
    while (j < len) {
      const c = source.charCodeAt(j);
      if (c === 62) {
        j++;
        const attrs = parseAttrs(source, attrStart, j - 1);
        tokens.push({ kind: "start", name, tagStart, tagEnd: j, contentStart: j, attrs });
        terminated = true;
        break;
      }
      if (c === 47 && source.charCodeAt(j + 1) === 62) {
        const attrs = parseAttrs(source, attrStart, j);
        j += 2;
        tokens.push({ kind: "selfClose", name, tagStart, tagEnd: j, attrs });
        terminated = true;
        break;
      }
      if (c === 34 || c === 39) {
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

/**
 * Build a line-start offset index for `source` (one entry per `\n` + 1).
 * Used with `lineAtOffset` to resolve offsets to line/column in O(log n).
 */
export function createLineIndex(source: string): number[] {
  const starts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source.charCodeAt(i) === 10) starts.push(i + 1);
  }
  return starts;
}

/**
 * Resolve an offset to `{ line, column }` via binary search on a
 * `createLineIndex` index. Column counts bytes since the line start.
 */
export function lineAtOffset(
  lineStarts: number[],
  offset: number,
): { line: number; column: number } {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStarts[mid]! <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, column: offset - lineStarts[lo]! + 1 };
}

/** One-shot convenience: build an index and resolve a single offset. */
export function sourceLocation(source: string, offset: number): { line: number; column: number } {
  return lineAtOffset(createLineIndex(source), offset);
}
