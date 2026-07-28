/**
 * `suspend` / `unsuspend` / `bury` commands: card scheduling.
 *
 * Operates on cards (not notes) because Anki's review state is
 * per-card. Each command takes a query and finds the matching cards.
 */

import { AnkiConnectClient } from "./anki-connect.ts";

export interface ScheduleOptions {
  ankiConnectUrl?: string;
  query?: string;
  deck?: string;
  fetchImpl?: typeof fetch;
  dryRun?: boolean;
}

export interface ScheduleResult {
  matchedCards: number;
  scheduled: number;
  cardIds: number[];
}

export async function runSuspend(opts: ScheduleOptions): Promise<ScheduleResult> {
  return runSchedule(opts, "suspend");
}

export async function runUnsuspend(opts: ScheduleOptions): Promise<ScheduleResult> {
  return runSchedule(opts, "unsuspend");
}

export async function runBury(opts: ScheduleOptions): Promise<ScheduleResult> {
  return runSchedule(opts, "bury");
}

async function runSchedule(
  opts: ScheduleOptions,
  mode: "suspend" | "unsuspend" | "bury",
): Promise<ScheduleResult> {
  const client = new AnkiConnectClient({
    url: opts.ankiConnectUrl ?? "http://127.0.0.1:8765",
    fetchImpl: opts.fetchImpl,
  });

  let query = opts.query ?? "";
  if (!query && opts.deck) query = `deck:"${opts.deck}"`;
  if (!query) {
    throw new Error(`${mode} requires --query or --deck`);
  }
  const noteIds = await client.findNotes(query);
  if (noteIds.length === 0) {
    return { matchedCards: 0, scheduled: 0, cardIds: [] };
  }

  // Find all cards for these notes.
  const cardLists = await Promise.all(noteIds.map((id) => client.cardsForNote(id)));
  const cardIds = cardLists.flat();
  if (cardIds.length === 0) {
    return { matchedCards: 0, scheduled: 0, cardIds: [] };
  }
  if (opts.dryRun) {
    return { matchedCards: cardIds.length, scheduled: cardIds.length, cardIds };
  }
  if (mode === "suspend") await client.suspendCards(cardIds);
  else if (mode === "unsuspend") await client.unsuspendCards(cardIds);
  else await client.buryCards(cardIds);
  return { matchedCards: cardIds.length, scheduled: cardIds.length, cardIds };
}
