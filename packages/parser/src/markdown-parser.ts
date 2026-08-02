/**
 * Markdown note parser.
 *
 * Format:
 *   ---
 *   deck: Japanese
 *   model: Basic
 *   tags: vocab
 *   ---
 *
 *   # こんにちは            <- front (h1 starts a new note)
 *   Hello                   <- back (body until next h1)
 *
 *   # さようなら
 *   Goodbye
 *
 * Frontmatter (--- YAML ---) sets deck/model/tags defaults for all notes.
 * Body text is HTML-escaped; newlines become <br>.
 */

import { parse as parseYamlText } from "yaml";
import type { ParsedNote } from "@anki-xml/utils";

export interface MarkdownParseOptions {
  defaultDeck?: string;
}

interface Frontmatter {
  deck?: string;
  model?: string;
  tags?: string | string[];
}

function splitFrontmatter(source: string): { frontmatter: Frontmatter | null; body: string } {
  const trimmed = source.replace(/^\uFEFF/, "");
  if (!trimmed.startsWith("---")) return { frontmatter: null, body: source };
  const end = trimmed.indexOf("\n---", 3);
  if (end === -1) return { frontmatter: null, body: source };
  const fmText = trimmed.slice(3, end).trim();
  let fm: Frontmatter = {};
  if (fmText) {
    try {
      fm = (parseYamlText(fmText) ?? {}) as Frontmatter;
    } catch {
      fm = {};
    }
  }
  return { frontmatter: fm, body: trimmed.slice(end + 4).replace(/^\n+/, "") };
}

/** Escape text for safe HTML embedding. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]*|#\d+|#x[0-9a-fA-F]+);)/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function bodyToHtml(body: string): string {
  return escapeHtml(body.trim()).replace(/\n/g, "<br>");
}

/** Parse a Markdown document into notes. Never decodes XML entities. */
export function parseMarkdown(source: string, opts: MarkdownParseOptions = {}): {
  notes: ParsedNote[];
  defaultDeck: string;
} {
  const { frontmatter, body } = splitFrontmatter(source);
  const defaultDeck = frontmatter?.deck ?? opts.defaultDeck ?? "";
  const defaultModel = frontmatter?.model ?? "Basic";
  const defaultTags = Array.isArray(frontmatter?.tags)
    ? frontmatter!.tags.join(" ")
    : (frontmatter?.tags ?? "");

  const notes: ParsedNote[] = [];
  let number = 0;
  let current: { front: string; body: string[] } | null = null;

  for (const line of body.split("\n")) {
    const h1 = line.match(/^#\s+(.*)$/);
    if (h1) {
      if (current) {
        number++;
        notes.push(makeNote(number, current, defaultDeck, defaultModel, defaultTags));
      }
      current = { front: h1[1]!.trim(), body: [] };
      continue;
    }
    if (current) current.body.push(line);
  }
  if (current) {
    number++;
    notes.push(makeNote(number, current, defaultDeck, defaultModel, defaultTags));
  }

  return { notes, defaultDeck };
}

function makeNote(
  number: number,
  cur: { front: string; body: string[] },
  deck: string,
  model: string,
  tags: string,
): ParsedNote {
  return {
    number,
    type: model,
    deck,
    tags,
    fields: [
      { name: "front", html: escapeHtml(cur.front) },
      { name: "back", html: bodyToHtml(cur.body.join("\n")) },
    ],
    unknownElements: [],
  };
}
