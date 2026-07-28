/**
 * `search` command: full-text search across note fields.
 *
 * We delegate the actual matching to Anki's own search engine because it
 * already understands HTML stripping, case-insensitivity, and operators
 * like `deck:`, `tag:`, `is:new`, etc. The CLI is a thin facade:
 *
 *   anki-xml search "phrase"            -> findNotes('"phrase"')
 *   anki-xml search "phrase" --tag foo  -> findNotes('"phrase" tag:foo')
 *   anki-xml search --query 'deck:X'    -> findNotes('deck:X')
 *
 * Results come back as note ids plus their card ids. We then call
 * `notesInfo` to get the field text, strip HTML for human/AI display,
 * and emit a short snippet around the first match.
 *
 * The output includes BOTH note id and card id, so the caller can
 * drive `update --id <noteId>` immediately.
 */

import { AnkiConnectClient, AnkiConnectNoteInfo } from "./anki-connect.ts";

export interface SearchHit {
  noteId: number;
  modelName: string;
  tags: string[];
  cards: number[];
  /** HTML stripped from every field, joined by "\n---\n". */
  plainText: string;
  /**
   * Short snippet (up to ~120 chars) of the first field containing a
   * case-insensitive match for the user's query. Empty when the query
   * was a structural filter (e.g. `deck:Spanish`) with no phrase.
   */
  snippet: string;
  /** Field name where the snippet came from. */
  snippetField: string | null;
}

export interface SearchOptions {
  ankiConnectUrl: string;
  fetchImpl?: typeof fetch;
  /**
   * Raw Anki search query. If `phrase` is provided it is wrapped in
   * double quotes and AND'd with the structural filters below.
   */
  query?: string;
  /** Phrase search (case-insensitive substring across all field text). */
  phrase?: string;
  /** Restrict to a single deck (Anki `deck:` operator). */
  deck?: string;
  /** Restrict to a single tag (Anki `tag:` operator). May be repeated. */
  tags?: string[];
  /** Maximum number of hits to return. Defaults to 100. */
  limit?: number;
}

/**
 * Build the Anki search query string from a structured SearchOptions.
 * Quotes the phrase for substring search and ANDs all structural filters.
 */
export function buildSearchQuery(opts: SearchOptions): string {
  const parts: string[] = [];
  if (opts.query && opts.query.length > 0) {
    parts.push(opts.query);
  }
  if (opts.phrase && opts.phrase.length > 0) {
    // Wrap in double quotes for substring matching, escaping any
    // embedded double quotes.
    const escaped = opts.phrase.replace(/"/g, '\\"');
    parts.push(`"${escaped}"`);
  }
  if (opts.deck) parts.push(`"deck:${opts.deck}"`);
  for (const t of opts.tags ?? []) parts.push(`tag:${t}`);
  return parts.join(" ");
}

/** Strip HTML tags and decode a few common named entities. */
export function stripHtml(html: string): string {
  return html
    // Remove Cloze markers but keep their content: {{c1::foo}} -> foo
    .replace(/\{\{c\d+(?:,\d+)*::([^}]*?)(?:::[^}]*)?\}\}/g, "$1")
    // Remove remaining {{...::...::hint}} fragments
    .replace(/\{\{[^}]*\}\}/g, "")
    // Remove tags.
    .replace(/<[^>]+>/g, " ")
    // Decode the five XML entities Anki produces most often.
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Collapse whitespace.
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Build a snippet of up to ~`maxLen` characters around the first
 * case-insensitive match of `needle` in `text`. If no match, returns
 * the first `maxLen` characters of `text`.
 */
export function makeSnippet(text: string, needle: string, maxLen = 120): string {
  if (text.length === 0) return "";
  if (needle.length === 0) return text.length <= maxLen ? text : text.slice(0, maxLen - 1) + "…";

  const lower = text.toLowerCase();
  const idx = lower.indexOf(needle.toLowerCase());
  if (idx < 0) {
    return text.length <= maxLen ? text : text.slice(0, maxLen - 1) + "…";
  }
  const radius = Math.floor((maxLen - needle.length) / 2);
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, start + maxLen);
  let snippet = text.slice(start, end);
  if (start > 0) snippet = "…" + snippet;
  if (end < text.length) snippet = snippet + "…";
  return snippet;
}

export async function runSearch(opts: SearchOptions): Promise<SearchHit[]> {
  const client = new AnkiConnectClient({
    url: opts.ankiConnectUrl,
    fetchImpl: opts.fetchImpl,
  });

  const query = buildSearchQuery(opts);
  const noteIds = await client.findNotes(query);
  const limit = opts.limit ?? 100;
  const truncated = noteIds.length > limit;
  const slice = truncated ? noteIds.slice(0, limit) : noteIds;

  if (slice.length === 0) return [];

  const infos = await client.notesInfo(slice);

  const hits: SearchHit[] = [];
  for (let i = 0; i < infos.length; i++) {
    const info = infos[i];
    if (!info) continue; // AnkiConnect returns null for missing ids.
    hits.push(infoToHit(info, opts.phrase ?? ""));
  }
  return hits;
}

function infoToHit(info: AnkiConnectNoteInfo, phrase: string): SearchHit {
  // Field order: Anki stores the order on each field entry. Sort by it.
  const fieldEntries = Object.entries(info.fields).sort(
    ([, a], [, b]) => a.order - b.order,
  );
  const plainParts: string[] = [];
  for (const [fieldName, field] of fieldEntries) {
    plainParts.push(`[${fieldName}] ${stripHtml(field.value)}`);
  }
  const plainText = plainParts.join("\n");

  // Find the first field that contains the phrase (case-insensitive).
  let snippet = "";
  let snippetField: string | null = null;
  const needle = phrase.toLowerCase();
  if (needle.length > 0) {
    for (const [fieldName, field] of fieldEntries) {
      const text = stripHtml(field.value);
      if (text.toLowerCase().includes(needle)) {
        snippet = makeSnippet(text, needle);
        snippetField = fieldName;
        break;
      }
    }
    if (snippetField === null && fieldEntries.length > 0) {
      // No field contained the phrase directly (the match was
      // structural, like a tag). Still produce a short preview.
      const [firstName, firstField] = fieldEntries[0]!;
      snippet = makeSnippet(stripHtml(firstField.value), "");
      snippetField = firstName;
    }
  }

  return {
    noteId: info.noteId,
    modelName: info.modelName,
    tags: info.tags,
    cards: info.cards,
    plainText,
    snippet,
    snippetField,
  };
}

/** Render a list of hits as a human-friendly text block. */
export function renderSearch(hits: SearchHit[]): string {
  if (hits.length === 0) return "No matches.";
  const lines: string[] = [`${hits.length} match${hits.length === 1 ? "" : "es"}:`];
  for (const h of hits) {
    const cardList = h.cards.length === 0 ? "(no cards)" : h.cards.map((c) => `#${c}`).join(", ");
    const tags = h.tags.length === 0 ? "" : `  [${h.tags.join(" ")}]`;
    lines.push("");
    lines.push(`Note ${h.noteId}  (${h.modelName})${tags}`);
    lines.push(`  cards: ${cardList}`);
    if (h.snippet) {
      const where = h.snippetField ? ` (in ${h.snippetField})` : "";
      lines.push(`  ${h.snippet}${where}`);
    }
  }
  return lines.join("\n");
}
