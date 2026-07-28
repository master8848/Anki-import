/**
 * `sample` command — random sample of notes from the collection.
 *
 * An AI agent uses this for:
 *   - eval/test-set construction: pick 100 random notes to verify a
 *     regex doesn't blow up.
 *   - prompt-context gathering: "show me 5 random notes from the
 *     Spanish deck so I can see what fields are used in practice".
 *   - composition audit: "how variable is my deck really?".
 *
 * The sample is unbiased: we pull all matching ids, then take a
 * Fisher-Yates shuffle of the requested prefix. Deterministic when
 * --seed is given (so the agent can reproduce a sample).
 */

import { AnkiConnectClient } from "./anki-connect.ts";

export interface SampleOptions {
  count: number;
  query?: string;
  seed?: number;
  ankiConnectUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface SampleResult {
  notes: {
    noteId: number;
    modelName: string;
    deckName: string;
    fields: Record<string, string>;
    tags: string[];
  }[];
  /** Total matching notes in the collection (before sampling). */
  totalMatched: number;
  /** The seed used (echoed back for reproducibility). */
  seed: number;
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function makeRng(seed: number): () => number {
  // Mulberry32 PRNG — small, fast, well-distributed.
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function runSample(opts: SampleOptions): Promise<SampleResult> {
  const seed = opts.seed ?? Math.floor(Math.random() * 0x7fffffff);
  const client = new AnkiConnectClient({
    url: opts.ankiConnectUrl ?? "http://127.0.0.1:8765",
    fetchImpl: opts.fetchImpl,
  });
  const matchedIds = await client.findNotes(opts.query ?? "");
  const rng = makeRng(seed);
  const shuffled = shuffle(matchedIds, rng);
  const pickedIds = shuffled.slice(0, Math.min(opts.count, shuffled.length));
  const infos = pickedIds.length === 0 ? [] : await client.notesInfo(pickedIds);
  const notes = infos
    .filter((info): info is NonNullable<typeof info> => info !== null)
    .map((info) => ({
      noteId: info.noteId,
      modelName: info.modelName,
      deckName: info.deckName,
      fields: Object.fromEntries(
        Object.entries(info.fields).map(([k, v]) => [k, v.value]),
      ),
      tags: info.tags ?? [],
    }));
  return { notes, totalMatched: matchedIds.length, seed };
}