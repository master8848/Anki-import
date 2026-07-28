/**
 * `stats` command — new / learn / review counts (per-state).
 */

import { fetchStats, renderStats } from "../../stats.ts";
import { CliError } from "../args.ts";
import type { Command } from "../command.ts";
import { formatOutput, withFatal } from "../output.ts";

export interface StatsSubArgs {
  deck?: string;
}

function parseSubArgs(rest: string[]): StatsSubArgs {
  const out: StatsSubArgs = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a === "--deck") {
      const v = rest[i + 1];
      if (v === undefined) throw new CliError("--deck requires a value");
      out.deck = v;
      i++;
    }
  }
  return out;
}

const command: Command<StatsSubArgs> = {
  name: "stats",
  description: "Show new / learn / review counts.",
  flags: { "--deck <name>": "Restrict to a deck (subtree match)." },
  parseSubArgs(_positional, rest) {
    return parseSubArgs(rest);
  },
  async run(args, sub) {
    return withFatal(async () => {
      const startMs = Date.now();
      const stats = await fetchStats({ ankiConnectUrl: args.url, deck: sub.deck });
      console.log(formatOutput(stats, { args, startMs, command: "stats" }, renderStats(stats)));
      return 0;
    });
  },
};

export default command;
