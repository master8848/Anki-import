/**
 * `export` command: read notes from the live collection and emit XML.
 *
 * The XML produced is round-trippable: running `anki-xml import` on
 * the output should yield the same note ids (modulo allowDuplicate).
 * This is the read half of the agent's "snapshot + modify + write"
 * workflow: export, edit locally, re-import.
 */

import { AnkiConnectClient, type AnkiConnectNoteInfo } from "./anki-connect.ts";
import { parseDocument, validateNotes, XmlParseError } from "./xml.ts";
import type { SupportedModel, XmlFieldName } from "./types.ts";

export interface ExportOptions {
  ankiConnectUrl?: string;
  /** When set, only export notes in this deck (or subtree). */
  deck?: string;
  /** Find notes by Anki search query (e.g. "tag:spanish"). */
  query?: string;
  /** Cap the number of notes returned. */
  limit?: number;
  fetchImpl?: typeof fetch;
  /** Override the target model. Defaults to the note's existing model. */
  modelOverride?: SupportedModel;
  /** When true, include id attributes so re-import targets the same notes. */
  withIds?: boolean;
}

export interface ExportResult {
  /** The exported XML string, ready to be written to a file. */
  xml: string;
  noteCount: number;
  /** The Anki ids of the exported notes. */
  ids: number[];
}

/** Field names we know how to round-trip in v1. */
const KNOWN_FIELDS: XmlFieldName[] = ["front", "back", "text", "extra", "addReverse"];

export async function runExport(opts: ExportOptions): Promise<ExportResult> {
  const client = new AnkiConnectClient({
    url: opts.ankiConnectUrl ?? "http://127.0.0.1:8765",
    fetchImpl: opts.fetchImpl,
  });

  const query = opts.query ?? (opts.deck ? `deck:"${opts.deck}"` : "");
  if (!query) {
    throw new Error("Either --deck or --query is required for export");
  }

  const ids = await client.findNotes(query);
  const limited = opts.limit && opts.limit > 0 ? ids.slice(0, opts.limit) : ids;

  if (limited.length === 0) {
    return { xml: emptyXml(opts), noteCount: 0, ids: [] };
  }

  const infos = await client.notesInfo(limited);

  const lines: string[] = ['<?xml version="1.0" encoding="UTF-8"?>', "<anki>"];
  for (const info of infos) {
    lines.push(...renderNote(info, opts));
  }
  lines.push("</anki>");
  lines.push("");

  return { xml: lines.join("\n"), noteCount: limited.length, ids: limited };
}

function emptyXml(opts: ExportOptions): string {
  const deck = opts.deck ? ` deck="${escapeAttr(opts.deck)}"` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>\n<anki${deck}>\n</anki>\n`;
}

function renderNote(info: AnkiConnectNoteInfo, opts: ExportOptions): string[] {
  const fields = info.fields;
  const modelName = (opts.modelOverride ?? info.modelName) as SupportedModel;

  // Map Anki display names back to lowercase XML tags.
  const xmlFields: { tag: XmlFieldName; value: string }[] = [];
  for (const tag of KNOWN_FIELDS) {
    const ankiName = displayNameFor(modelName, tag);
    if (!ankiName) continue;
    const value = fields[ankiName]?.value;
    if (value === undefined) continue;
    xmlFields.push({ tag, value });
  }

  const attrs: string[] = [`type="${escapeAttr(modelName)}"`];
  if (info.deckName) attrs.push(`deck="${escapeAttr(info.deckName)}"`);
  if (info.tags && info.tags.length > 0) {
    attrs.push(`tags="${escapeAttr(info.tags.join(" "))}"`);
  }
  if (opts.withIds && info.noteId) {
    attrs.push(`id="${info.noteId}"`);
  }

  const lines: string[] = [];
  lines.push(`  <note ${attrs.join(" ")}>`);
  for (const { tag, value } of xmlFields) {
    lines.push(`    <${tag}>${escapeCdata(value)}</${tag}>`);
  }
  lines.push("  </note>");
  return lines;
}

function displayNameFor(model: SupportedModel, tag: XmlFieldName): string | null {
  if (model === "Cloze") {
    if (tag === "text") return "Text";
    if (tag === "extra") return "Extra";
    return null;
  }
  if (model === "Basic (optional reversed card)") {
    if (tag === "front") return "Front";
    if (tag === "back") return "Back";
    if (tag === "addReverse") return "Add Reverse";
    if (tag === "extra") return "Extra";
    return null;
  }
  if (tag === "front") return "Front";
  if (tag === "back") return "Back";
  return null;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function escapeCdata(s: string): string {
  if (/<|>|&/.test(s)) {
    return `<![CDATA[${s.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
  }
  return s;
}

export { XmlParseError };

// Re-export for callers that want to validate the produced XML.
export { parseDocument, validateNotes };
