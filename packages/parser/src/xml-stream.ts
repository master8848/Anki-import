/**
 * Streaming XML note parser.
 *
 * Reads a Readable stream, emits one ParsedNote at a time without
 * loading the entire document into memory. Note boundaries are found
 * by a CDATA-aware scanner that also maintains a deck-name stack, so
 * each byte is scanned at most once (amortized) and deck context is
 * preserved across arbitrary nesting depth. Each note fragment is
 * parsed with the same tokenizer as the full-document path (minus the
 * redundant fast-xml-parser well-formedness pass).
 *
 * Stream vs full-path validation:
 *  - Stream catches: unterminated constructs at chunk boundaries,
 *    duplicate attributes, unquoted/boolean attribute values, stray
 *    `</note>` / `</deck>` end tags (scanner checks below), plus
 *    PCDATA and missing-close issues via the fragment tokenizer.
 *  - Full path additionally rejects: multiple root elements, text
 *    outside the root, root not `<anki>`. Stream mode processes
 *    per-note fragments by design, so trailing text between/after
 *    notes is valid there.
 */

import { Readable } from "node:stream";
import { parseDocument, XmlParseError } from "./xml-parser.ts";
import type { ParsedNote } from "@anki-xml/utils";

export interface StreamParseOptions {
  /** Optional default deck when not set on notes / nested decks. */
  defaultDeck?: string;
}

interface NoteSpan {
  /** Offset of the opening `<note` tag. */
  start: number;
  /** Offset just past the closing `</note ...>` tag. */
  end: number;
  /** Inherited deck name (top of the deck stack at `start`). */
  deck: string;
}

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

/**
 * Extract the `name="..."` attribute from a `<deck ...>` tag slice.
 */
function deckNameFromTag(buf: string, tagStart: number, tagEnd: number): string {
  const m = buf.slice(tagStart, tagEnd).match(/\bname\s*=\s*["']([^"']*)["']/);
  return m?.[1] ?? "";
}

/**
 * Cheap well-formedness checks for a start tag's attribute region,
 * mirroring what fast-xml-parser's XMLValidator rejects in the full
 * path: duplicate attributes and boolean (unquoted or valueless)
 * attributes. The fragment tokenizer's parseAttrs silently takes the
 * last value for duplicates and drops unquoted values, so without
 * this the stream path would accept malformed documents the full
 * path rejects.
 */
function checkTagAttrs(buf: string, attrStart: number, attrEnd: number): void {
  let i = attrStart;
  const seen = new Set<string>();
  while (i < attrEnd) {
    while (i < attrEnd && isSpace(buf.charCodeAt(i))) i++;
    if (i >= attrEnd) break;
    const nameStart = i;
    while (i < attrEnd && isNameChar(buf.charCodeAt(i))) i++;
    if (i === nameStart) break;
    const name = buf.slice(nameStart, i);
    while (i < attrEnd && isSpace(buf.charCodeAt(i))) i++;
    if (buf.charCodeAt(i) !== 61 /* = */) {
      throw new XmlParseError(
        `Malformed XML: attribute "${name}" is missing a value at offset ${nameStart}`,
      );
    }
    i++;
    while (i < attrEnd && isSpace(buf.charCodeAt(i))) i++;
    const quote = buf.charCodeAt(i);
    if (quote !== 34 /* " */ && quote !== 39 /* ' */) {
      throw new XmlParseError(
        `Malformed XML: unquoted value for attribute "${name}" at offset ${nameStart}`,
      );
    }
    i++;
    while (i < attrEnd && buf.charCodeAt(i) !== quote) i++;
    if (seen.has(name)) {
      throw new XmlParseError(
        `Malformed XML: duplicate attribute "${name}" at offset ${nameStart}`,
      );
    }
    seen.add(name);
    i++;
  }
}

/**
 * Single-pass note scanner. Maintains `pos` (next byte to scan) and a
 * deck-name stack so successive `nextNote()` calls never re-scan bytes.
 * Detects `<note>`/`</note>`/`<deck>`/`</deck>` while skipping CDATA,
 * comments, PIs, markup declarations and quoted attribute values.
 */
class NoteScanner {
  buf = "";
  /** Next unscanned byte offset in `buf`. */
  pos = 0;
  /** Deck-name stack at `pos`. */
  deckStack: string[] = [];
  /** When >= 0, resume from this offset (an unterminated construct). */
  resumeAt = -1;

  private static readonly COMPACT_THRESHOLD = 256_000;

  append(chunk: string): void {
    this.buf += chunk;
  }

  nextNote(): NoteSpan | null {
    let pos = this.resumeAt >= 0 ? this.resumeAt : this.pos;
    this.resumeAt = -1;
    // Compaction happens only at call start, before any scanning, and
    // `pos` is always at a safe resume point (a completed construct or
    // an aborted construct start). Slicing from `pos` therefore never
    // drops or re-emits bytes; emitted spans are always relative to the
    // current buffer and are consumed before the next append/compact.
    if (pos > NoteScanner.COMPACT_THRESHOLD) {
      this.buf = this.buf.slice(pos);
      pos = 0;
    }
    const buf = this.buf;
    const len = buf.length;

    let noteStart = -1;
    let depth = 0;
    let noteDeckStack: string[] | null = null;

    // Abort with an incomplete construct. When inside a note, rewind to
    // the note opener (restoring the deck snapshot) so the next call
    // rebuilds nesting depth; otherwise resume at the construct start.
    const abort = (at: number): null => {
      if (noteStart >= 0 && noteDeckStack) {
        this.deckStack = noteDeckStack;
        at = noteStart;
      }
      this.resumeAt = at;
      this.pos = at;
      return null;
    };

    while (pos < len) {
      if (buf.charCodeAt(pos) !== 60 /* < */) {
        pos++;
        continue;
      }

      if (buf.startsWith("<![CDATA[", pos)) {
        const endC = buf.indexOf("]]>", pos + 9);
        if (endC === -1) return abort(pos);
        pos = endC + 3;
        continue;
      }
      if (buf.startsWith("<!--", pos)) {
        const endC = buf.indexOf("-->", pos + 4);
        if (endC === -1) return abort(pos);
        pos = endC + 3;
        continue;
      }
      if (buf.startsWith("<?", pos)) {
        const endC = buf.indexOf("?>", pos + 2);
        if (endC === -1) return abort(pos);
        pos = endC + 2;
        continue;
      }
      if (buf.startsWith("<!", pos)) {
        const endC = buf.indexOf(">", pos + 2);
        if (endC === -1) return abort(pos);
        pos = endC + 1;
        continue;
      }

      // End tag: </name ws* >
      if (buf.charCodeAt(pos + 1) === 47 /* / */) {
        let j = pos + 2;
        const nameStart = j;
        while (j < len && isNameChar(buf.charCodeAt(j))) j++;
        const name = buf.slice(nameStart, j);
        while (j < len && isSpace(buf.charCodeAt(j))) j++;
        if (j >= len) return abort(pos);
        if (buf.charCodeAt(j) !== 62 /* > */) {
          pos++;
          continue;
        }
        j++;
        if (name === "note") {
          if (depth > 0) {
            depth--;
            if (depth === 0) {
              this.pos = j;
              const deck = noteDeckStack
                ? (noteDeckStack[noteDeckStack.length - 1] ?? "")
                : "";
              return { start: noteStart, end: j, deck };
            }
          } else {
            // Full path rejects this via XMLValidator; a stray end tag
            // at depth 0 would otherwise silently drop the enclosing
            // note or accept malformed documents.
            throw new XmlParseError(
              `Malformed XML: stray closing </note> with no open <note> at offset ${pos}`,
            );
          }
        } else if (name === "deck") {
          if (this.deckStack.length === 0) {
            throw new XmlParseError(
              `Malformed XML: stray closing </deck> with no open <deck> at offset ${pos}`,
            );
          }
          this.deckStack.pop();
        }
        pos = j;
        continue;
      }

      // Start tag: <name ...> (quote-aware scan to the closing '>')
      let j = pos + 1;
      const nameStart = j;
      while (j < len && isNameChar(buf.charCodeAt(j))) j++;
      const name = buf.slice(nameStart, j);
      if (!name) {
        // '<' followed by a non-name char is tolerated as text, but if
        // the buffer ends right after '<' a tag may begin in the next
        // chunk - rewind so the '<' is re-examined after appending.
        if (j >= len) return abort(pos);
        pos++;
        continue;
      }
      let k = j;
      let selfClose = false;
      let closed = false;
      while (k < len) {
        const kc = buf.charCodeAt(k);
        if (kc === 34 || kc === 39) {
          const quote = kc;
          k++;
          while (k < len && buf.charCodeAt(k) !== quote) k++;
          if (k >= len) return abort(pos);
          k++;
          continue;
        }
        if (kc === 62 /* > */) {
          closed = true;
          k++;
          break;
        }
        if (kc === 47 /* / */ && buf.charCodeAt(k + 1) === 62) {
          selfClose = true;
          closed = true;
          k += 2;
          break;
        }
        k++;
      }
      if (!closed) return abort(pos);

      // Well-formedness pass over the attribute region (cheap: attrs
      // are small; the scan below already bounded the region quote-
      // aware). Mirrors the full path's XMLValidator rejections.
      checkTagAttrs(buf, j, k - (selfClose ? 2 : 1));

      if (name === "note") {
        if (selfClose) {
          if (depth === 0) {
            this.pos = k;
            return {
              start: pos,
              end: k,
              deck: this.deckStack[this.deckStack.length - 1] ?? "",
            };
          }
        } else {
          if (depth === 0) {
            noteStart = pos;
            noteDeckStack = [...this.deckStack];
          }
          depth++;
        }
      } else if (name === "deck" && !selfClose) {
        this.deckStack.push(deckNameFromTag(buf, pos, k));
      }
      pos = k;
    }

    // Buffer exhausted. If a note is still open, the chunk boundary
    // fell inside the note's content (plain text or a completed tag) —
    // rewind to the note opener, restoring the deck snapshot, so the
    // next call rebuilds nesting depth. Without this, the note's own
    // `</note>` would be seen at depth 0 and the note silently dropped.
    if (depth > 0) return abort(pos);
    this.pos = pos;
    return null;
  }
}

export async function* parseXmlStream(
  input: Readable | AsyncIterable<string | Buffer>,
  opts: StreamParseOptions = {},
): AsyncGenerator<ParsedNote, void, unknown> {
  const scanner = new NoteScanner();
  let noteCounter = 0;
  let rootDeck = opts.defaultDeck ?? "";
  let seenRoot = false;

  const readable =
    Symbol.asyncIterator in input
      ? input
      : (input as Readable);

  const emitSpan = (span: NoteSpan) => {
    const fragment = scanner.buf.slice(span.start, span.end);
    const inherited = span.deck || rootDeck;
    const wrapped = `<anki deck="${escapeAttr(inherited)}">${fragment}</anki>`;

    let parsed;
    try {
      parsed = parseDocument(wrapped, { validateWellformed: false });
    } catch (err) {
      if (err instanceof XmlParseError) throw err;
      throw new XmlParseError(`Failed to parse streamed note: ${(err as Error).message}`);
    }

    const notes: ParsedNote[] = [];
    for (const note of parsed.notes) {
      noteCounter++;
      note.number = noteCounter;
      if (!note.deck) note.deck = inherited || rootDeck;
      notes.push(note);
    }
    return notes;
  };

  for await (const chunk of readable) {
    scanner.append(typeof chunk === "string" ? chunk : chunk.toString("utf8"));

    // The root <anki deck="..."> tag may itself be split across chunks;
    // only settle `rootDeck` once the full root tag has arrived, so a
    // chunk boundary inside it cannot silently lose the root deck.
    if (!seenRoot && scanner.buf.includes("<anki")) {
      const m = scanner.buf.match(/<anki\b[^>]*\bdeck\s*=\s*["']([^"']*)["']/);
      if (m && !rootDeck) rootDeck = m[1]!;
      if (m || /<anki\b[^>]*>/.test(scanner.buf)) seenRoot = true;
    }

    while (true) {
      const span = scanner.nextNote();
      if (!span) break;
      yield* emitSpan(span);
    }
  }

  // Final flush — any remaining complete notes
  while (true) {
    const span = scanner.nextNote();
    if (!span) break;
    yield* emitSpan(span);
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
