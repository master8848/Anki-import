import { AnkiClient } from "@anki-xml/anki";
import { collectionStats, deckStats } from "@anki-xml/stats";
import { flagString, type GlobalFlags } from "../args.ts";
import type { Logger } from "@anki-xml/logger";

export async function runStatsCommand(
  rest: Record<string, string | boolean>,
  flags: GlobalFlags,
  log: Logger,
): Promise<number> {
  const client = new AnkiClient({ url: flags.url });
  const deck = flagString(rest, "deck");

  if (deck) {
    const counts = await deckStats(client, deck);
    if (flags.json) {
      console.log(JSON.stringify({ deck, counts: counts[deck] ?? null }));
    } else {
      const c = counts[deck];
      if (!c) {
        log.error(`Deck not found: ${deck}`);
        return 1;
      }
      log.info(`Deck: ${deck}`);
      log.info(`  new: ${c.new}  learning: ${c.learning}  review: ${c.review}  suspended: ${c.suspended}  buried: ${c.buried}`);
    }
    return 0;
  }

  const stats = await collectionStats(client);
  if (flags.json) {
    console.log(JSON.stringify(stats));
  } else {
    log.info(`Decks: ${stats.decks}`);
    log.info(`Models: ${stats.models}`);
    log.info(`Notes: ${stats.notes}`);
    log.info(`Cards: ${stats.cards}`);
    for (const [name, c] of Object.entries(stats.perDeck)) {
      log.info(`  ${name}: ${c.new + c.learning + c.review + c.suspended + c.buried} cards`);
    }
  }
  return 0;
}
