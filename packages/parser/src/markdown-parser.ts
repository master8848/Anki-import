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
import { escapeCdataForHtml } from "./cdata.ts";
import { YamlParseError } from "./errors.ts";
import { DEFAULT_MODEL } from "./structured.ts";
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
    } catch (err) {
      throw new YamlParseError(`Invalid YAML frontmatter: ${(err as Error).message}`);
    }
  }
  return { frontmatter: fm, body: trimmed.slice(end + 4).replace(/^\n+/, "") };
}

function bodyToHtml(body: string): string {
  return escapeCdataForHtml(body.trim()).replace(/\n/g, "<br>");
}

/** Parse a Markdown document into notes. Never decodes XML entities. */
export function parseMarkdown(source: string, opts: MarkdownParseOptions = {}): {
  notes: ParsedNote[];
  defaultDeck: string;
} {
  const { frontmatter, body } = splitFrontmatter(source);
  const defaultDeck = frontmatter?.deck ?? opts.defaultDeck ?? "";
  const defaultModel = frontmatter?.model ?? DEFAULT_MODEL;
  const fmTags = frontmatter?.tags;
  const defaultTags = Array.isArray(fmTags) ? fmTags.join(" ") : (fmTags ?? "");
  const defaultTagsSpecified = frontmatter?.tags !== undefined;

  const notes: ParsedNote[] = [];
  let number = 0;
  let current: { front: string; body: string[] } | null = null;

  for (const line of body.split("\n")) {
    const h1 = line.match(/^#\s+(.*)$/);
    if (h1) {
      if (current) {
        number++;
        notes.push(makeNote(number, current, defaultDeck, defaultModel, defaultTags, defaultTagsSpecified));
      }
      current = { front: h1[1]!.trim(), body: [] };
      continue;
    }
    if (current) current.body.push(line);
  }
  if (current) {
    number++;
    notes.push(makeNote(number, current, defaultDeck, defaultModel, defaultTags, defaultTagsSpecified));
  }

  return { notes, defaultDeck };
}

function makeNote(
  number: number,
  cur: { front: string; body: string[] },
  deck: string,
  model: string,
  tags: string,
  tagsSpecified: boolean,
): ParsedNote {
  return {
    number,
    type: model,
    deck,
    tags,
    tagsSpecified,
    fields: [
      { name: "front", html: escapeCdataForHtml(cur.front) },
      { name: "back", html: bodyToHtml(cur.body.join("\n")) },
    ],
    unknownElements: [],
  };
}
