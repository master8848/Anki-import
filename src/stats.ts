/**
 * `stats` command: report card counts broken down by Anki scheduler state.
 *
 * Anki classifies every card into one of these states:
 *   - new       : never been studied
 *   - learn     : currently being learned (in the learning queue)
 *   - review    : graduated, in the review queue
 *   - suspended : user-suspended
 *   - buried    : scheduler-buried (manual or auto)
 *
 * The mapping the user asked for is:
 *   - "completed"  = review       (graduated cards)
 *   - "incomplete" = new + learn  (not yet graduated)
 *
 * We also count total notes. The optional `--deck <name>` filter uses
 * Anki's `deck:` search operator; without it the whole collection is
 * counted.
 */

import { AnkiConnectClient } from "./anki-connect.ts";

export interface CardStats {
  new: number;
  learn: number;
  review: number;
  suspended: number;
  buried: number;
  /** Sum of all five states. */
  total: number;
  /** review = graduated = "completed" by the user's definition. */
  completed: number;
  /** new + learn = "incomplete". */
  incomplete: number;
}

export interface CollectionStats extends CardStats {
  notes: number;
  /** Deck filter that produced these stats, or null for the whole collection. */
  deck: string | null;
}

export interface StatsOptions {
  ankiConnectUrl: string;
  fetchImpl?: typeof fetch;
  /** Restrict counts to a single deck (Anki's deck: search syntax). */
  deck?: string;
}

function buildQuery(deck: string | undefined, suffix: string): string {
  // When a deck is specified, we must escape the deck name for Anki's
  // search syntax. We do this with double quotes. The deck name itself
  // is quoted, then a state filter is AND'd in.
  if (!deck) return suffix;
  return `"deck:${deck}" ${suffix}`;
}

export interface FieldFrequency {
  value: string;
  count: number;
}

export interface FieldStatsResult {
  field: string;
  /** Number of distinct non-empty values. */
  unique: number;
  /** Number of notes whose field value was empty. */
  empty: number;
  /** Top N values by frequency, descending. */
  top: FieldFrequency[];
  /** Total notes scanned. */
  total: number;
}

export interface FieldStatsOptions {
  field: string;
  ankiConnectUrl: string;
  fetchImpl?: typeof fetch;
  /** Optional deck filter. */
  deck?: string;
  /** Cap the top list. */
  top?: number;
}

/**
 * Cardinality stats for a single field. Walks every matching note
 * via notesInfo and tallies field values. Use sparingly on large
 * collections.
 */
export async function fetchFieldStats(
  opts: FieldStatsOptions,
): Promise<FieldStatsResult> {
  const client = new AnkiConnectClient({
    url: opts.ankiConnectUrl,
    fetchImpl: opts.fetchImpl,
  });
  const query = opts.deck ? `"deck:${opts.deck}"` : "";
  const ids = await client.findNotes(query);
  const top = opts.top ?? 20;
  if (ids.length === 0) {
    return { field: opts.field, unique: 0, empty: 0, top: [], total: 0 };
  }
  const infos = await client.notesInfo(ids);
  const counts = new Map<string, number>();
  let empty = 0;
  for (const info of infos) {
    if (!info) continue;
    const v = info.fields[opts.field]?.value ?? "";
    if (v.length === 0) {
      empty++;
    } else {
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
  }
  const sorted = [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
  return {
    field: opts.field,
    unique: counts.size,
    empty,
    top: sorted.slice(0, top),
    total: ids.length,
  };
}

/** Empty zeroed stats. */
function zeroStats(): CardStats {
  return { new: 0, learn: 0, review: 0, suspended: 0, buried: 0, total: 0, completed: 0, incomplete: 0 };
}

export async function fetchStats(opts: StatsOptions): Promise<CollectionStats> {
  const client = new AnkiConnectClient({
    url: opts.ankiConnectUrl,
    fetchImpl: opts.fetchImpl,
  });

  const deck = opts.deck ?? null;
  const [newCards, learnCards, reviewCards, suspendedCards, buriedCards, notes] = await Promise.all([
    client.findCards(buildQuery(deck, "is:new")),
    client.findCards(buildQuery(deck, "is:learn")),
    client.findCards(buildQuery(deck, "is:review")),
    client.findCards(buildQuery(deck, "is:suspended")),
    client.findCards(buildQuery(deck, "is:buried")),
    // Note: a "note" isn't a card. A note generates 1..N cards depending
    // on the model. We count notes via findNotes (no is:* filter, since
    // state lives on cards).
    deck ? client.findNotes(`"deck:${deck}"`) : client.findNotes(""),
  ]);

  const stats = zeroStats();
  stats.new = newCards.length;
  stats.learn = learnCards.length;
  stats.review = reviewCards.length;
  stats.suspended = suspendedCards.length;
  stats.buried = buriedCards.length;
  stats.total = stats.new + stats.learn + stats.review + stats.suspended + stats.buried;
  stats.completed = stats.review;
  stats.incomplete = stats.new + stats.learn;

  return { ...stats, notes: notes.length, deck };
}

/**
 * Render a CollectionStats as a human-friendly text block.
 *
 * Layout:
 *   Collection       (or "Deck: Spanish")
 *     Cards: 1234
 *       new:       10
 *       learn:      3
 *       review:  1200
 *       suspended: 20
 *       buried:     1
 *     Completed (review):   1200
 *     Incomplete (new+learn): 13
 *     Notes: 1100
 */
export function renderStats(stats: CollectionStats): string {
  const lines: string[] = [];
  const title = stats.deck ? `Deck: ${stats.deck}` : "Collection";
  lines.push(title);
  lines.push(`  Cards: ${stats.total}`);
  lines.push(`    new:       ${stats.new}`);
  lines.push(`    learn:     ${stats.learn}`);
  lines.push(`    review:    ${stats.review}`);
  lines.push(`    suspended: ${stats.suspended}`);
  lines.push(`    buried:    ${stats.buried}`);
  lines.push(`  Completed (review):    ${stats.completed}`);
  lines.push(`  Incomplete (new+learn): ${stats.incomplete}`);
  lines.push(`  Notes: ${stats.notes}`);
  return lines.join("\n");
}
