/**
 * `sample` command — random sample of notes.
 */

import { runSample } from "../../sample.ts";
import type { Command } from "../command.ts";
import { formatOutput, withFatal } from "../output.ts";

export interface SampleSubArgs {
  positional: string[];
  query?: string;
  seed?: number;
}

function parseSubArgs(positional: string[], rest: string[]): SampleSubArgs {
  const out: SampleSubArgs = { positional };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a === "--query") {
      out.query = rest[i + 1];
      i++;
    } else if (a === "--seed") {
      const n = Number(rest[i + 1]);
      if (Number.isFinite(n) && n >= 0) out.seed = Math.floor(n);
      i++;
    }
  }
  return out;
}

const command: Command<SampleSubArgs> = {
  name: "sample",
  description: "Random sample of notes (deterministic with --seed).",
  flags: {
    "--query <q>": "AnkiConnect search query (default: every note).",
    "--seed <N>": "Seed for reproducible sampling.",
  },
  parseSubArgs(positional, rest) {
    return parseSubArgs(positional, rest);
  },
  async run(args, sub) {
    if (sub.positional.length !== 1) {
      console.error("Usage: anki-xml sample <N> [--query q] [--seed N]");
      return 2;
    }
    const count = Number(sub.positional[0]);
    if (!Number.isInteger(count) || count <= 0) {
      console.error(`error: '${sub.positional[0]}' is not a positive integer`);
      return 2;
    }
    return withFatal(async () => {
      const startMs = Date.now();
      const result = await runSample({
        count,
        query: sub.query,
        seed: sub.seed,
        ankiConnectUrl: args.url,
      });
      const data = result;
      const human = [
        `Total matched: ${result.totalMatched}; sampled ${result.notes.length} (seed ${result.seed}).`,
        ...result.notes.map(
          (n) =>
            `  [${n.noteId}] ${n.modelName} (${n.deckName})${n.tags.length ? " #" + n.tags.join(" #") : ""}`,
        ),
      ].join("\n");
      console.log(formatOutput(data, { args, startMs, command: "sample" }, human));
      return 0;
    });
  },
};

export default command;