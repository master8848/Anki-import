/**
 * Streaming XML note parser.
 *
 * Reads a Readable stream, emits one ParsedNote at a time without
 * loading the entire document into memory. Note boundaries are found
 * by a CDATA-aware scanner; each note fragment is parsed with the
 * same tokenizer as the full-document path.
 */

import { Readable } from "node:stream";
import { parseDocument, XmlParseError } from "./xml-parser.ts";
import type { ParsedNote } from "../types/index.ts";

export interface StreamParseOptions {
  /** Optional default deck when not set on notes / nested decks. */
  defaultDeck?: string;
}

/**
 * Find the next complete `<note>...</note>` span, respecting CDATA.
 * Returns [start, endExclusive] or null if incomplete.
 */
function findNextNoteSpan(buf: string, from: number): { start: number; end: number } | null {
  let i = from;
  while (i < buf.length) {
    const open = buf.indexOf("<note", i);
    if (open === -1) return null;
    // Ensure it's a real start tag: <note ...> or <note>
    const after = open + 5;
    if (after < buf.length) {
      const c = buf.charCodeAt(after);
      if (c !== 32 && c !== 9 && c !== 10 && c !== 13 && c !== 62 && c !== 47) {
        i = after;
        continue;
      }
    }

    let depth = 0;
    let pos = open;
    while (pos < buf.length) {
      if (buf.startsWith("<![CDATA[", pos)) {
        const endCdata = buf.indexOf("]]>", pos + 9);
        if (endCdata === -1) return null;
        pos = endCdata + 3;
        continue;
      }
      if (buf.startsWith("<!--", pos)) {
        const endComment = buf.indexOf("-->", pos + 4);
        if (endComment === -1) return null;
        pos = endComment + 3;
        continue;
      }

      if (buf.startsWith("<note", pos)) {
        const a = pos + 5;
        if (a >= buf.length) return null;
        const c = buf.charCodeAt(a);
        if (c === 32 || c === 9 || c === 10 || c === 13 || c === 62 || c === 47) {
          // self-closing?
          const gt = buf.indexOf(">", pos);
          if (gt === -1) return null;
          if (buf.charCodeAt(gt - 1) === 47) {
            // <note .../>
            if (depth === 0) return { start: open, end: gt + 1 };
            pos = gt + 1;
            continue;
          }
          depth++;
          pos = gt + 1;
          continue;
        }
      }

      if (buf.startsWith("</note>", pos)) {
        depth--;
        pos += 7;
        if (depth === 0) return { start: open, end: pos };
        continue;
      }

      pos++;
    }
    return null;
  }
  return null;
}

/**
 * Extract root-level deck attribute from a partial buffer prefix.
 */
function extractRootDeck(buf: string): string {
  const m = buf.match(/<anki\b[^>]*\bdeck\s*=\s*["']([^"']*)["']/);
  return m?.[1] ?? "";
}

/**
 * Extract current nested deck name from buffer before a note offset
 * by scanning open/close deck tags (best-effort for streaming).
 */
function deckAtOffset(buf: string, offset: number): string {
  const slice = buf.slice(0, offset);
  const stack: string[] = [];
  const re = /<deck\b([^>]*)>|<\/deck>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(slice)) !== null) {
    if (m[0].startsWith("</")) {
      stack.pop();
    } else {
      const nameMatch = m[1]?.match(/\bname\s*=\s*["']([^"']*)["']/);
      stack.push(nameMatch?.[1] ?? "");
    }
  }
  return stack.length > 0 ? stack[stack.length - 1]! : "";
}

export async function* parseXmlStream(
  input: Readable | AsyncIterable<string | Buffer>,
  opts: StreamParseOptions = {},
): AsyncGenerator<ParsedNote, void, unknown> {
  let buf = "";
  let scanFrom = 0;
  let noteCounter = 0;
  let rootDeck = opts.defaultDeck ?? "";
  let seenRoot = false;
  let leftoverPrefix = "";

  const readable =
    Symbol.asyncIterator in input
      ? input
      : (input as Readable);

  for await (const chunk of readable) {
    buf += typeof chunk === "string" ? chunk : chunk.toString("utf8");

    if (!seenRoot && buf.includes("<anki")) {
      seenRoot = true;
      if (!rootDeck) rootDeck = extractRootDeck(buf);
    }

    while (true) {
      const span = findNextNoteSpan(buf, scanFrom);
      if (!span) break;

      const fragment = buf.slice(span.start, span.end);
      const inherited = deckAtOffset(buf, span.start) || rootDeck;
      const wrapped = `<anki deck="${escapeAttr(inherited)}">${fragment}</anki>`;

      let parsed;
      try {
        parsed = parseDocument(wrapped);
      } catch (err) {
        if (err instanceof XmlParseError) throw err;
        throw new XmlParseError(`Failed to parse streamed note: ${(err as Error).message}`);
      }

      for (const note of parsed.notes) {
        noteCounter++;
        note.number = noteCounter;
        if (!note.deck) note.deck = inherited || rootDeck;
        yield note;
      }

      // Drop consumed bytes, keep a small prefix for deck stack context
      leftoverPrefix = buf.slice(Math.max(0, span.start - 200), span.start);
      buf = leftoverPrefix + buf.slice(span.end);
      scanFrom = leftoverPrefix.length;
    }

    // Bound buffer growth: if no note found and buffer is huge, keep tail
    if (buf.length > 2_000_000 && scanFrom > 0) {
      buf = buf.slice(scanFrom);
      scanFrom = 0;
    }
  }

  // Final flush — any remaining complete notes
  while (true) {
    const span = findNextNoteSpan(buf, scanFrom);
    if (!span) break;
    const fragment = buf.slice(span.start, span.end);
    const inherited = deckAtOffset(buf, span.start) || rootDeck;
    const wrapped = `<anki deck="${escapeAttr(inherited)}">${fragment}</anki>`;
    const parsed = parseDocument(wrapped);
    for (const note of parsed.notes) {
      noteCounter++;
      note.number = noteCounter;
      if (!note.deck) note.deck = inherited || rootDeck;
      yield note;
    }
    buf = buf.slice(span.end);
    scanFrom = 0;
  }
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/** Convenience: stream from a file path. */
export async function* parseXmlFileStream(
  path: string,
  opts: StreamParseOptions = {},
): AsyncGenerator<ParsedNote, void, unknown> {
  const fs = await import("node:fs");
  const stream = fs.createReadStream(path, { encoding: "utf8" });
  yield* parseXmlStream(stream, opts);
}
