/**
 * Collection and deck statistics via AnkiConnect.
 */

import type { AnkiClient } from "@anki-xml/anki";

/** Per-deck card counts, mirroring AnkiConnect cardCounts. */
export interface DeckCounts {
  new: number;
  learning: number;
  review: number;
  suspended: number;
  buried: number;
}

/** Overall collection statistics. */
export interface CollectionStats {
  decks: number;
  models: number;
  notes: number;
  cards: number;
  perDeck: Record<string, DeckCounts>;
}

/** Per-deck card counts for one deck, or all decks when none is given. */
export async function deckStats(
  client: AnkiClient,
  deck?: string,
): Promise<Record<string, DeckCounts>> {
  if (deck !== undefined) {
    return client.cardCounts([deck]);
  }
  const decks = await client.deckNames();
  return client.cardCounts(decks);
}

/** Collection-level totals and per-deck counts. */
export async function collectionStats(client: AnkiClient): Promise<CollectionStats> {
  const perDeck = await deckStats(client);
  const cards = Object.values(perDeck).reduce(
    (sum, c) => sum + c.new + c.learning + c.review + c.suspended + c.buried,
    0,
  );
  return {
    decks: (await client.deckNames()).length,
    models: (await client.modelNames()).length,
    notes: (await client.findNotes("deck:*")).length,
    cards,
    perDeck,
  };
}
