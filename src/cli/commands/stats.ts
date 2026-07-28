/**
 * `stats` command — new / learn / review counts (per-state).
 *
 * With --field <name>, instead reports cardinality stats for that
 * field across all matching notes (useful for understanding a deck
 * before designing schema changes).
 */

import { fetchFieldStats, fetchStats, renderStats } from "../../stats.ts";
import { CliError } from "../args.ts";
import type { Command } from "../command.ts";
import { formatOutput, withFatal } from "../output.ts";

export interface StatsSubArgs {
  deck?: string;
  field?: string;
  top: number;
}

function parseSubArgs(rest: string[]): StatsSubArgs {
  const out: StatsSubArgs = { top: 20 };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a === "--deck") {
      const v = rest[i + 1];
      if (v === undefined) throw new CliError("--deck requires a value");
      out.deck = v;
      i++;
    } else if (a === "--field") {
      const v = rest[i + 1];
      if (v === undefined) throw new CliError("--field requires a value");
      out.field = v;
      i++;
    } else if (a === "--top") {
      const n = Number(rest[i + 1]);
      if (Number.isFinite(n) && n > 0) out.top = Math.floor(n);
      i++;
    }
  }
  return out;
}

const command: Command<StatsSubArgs> = {
  name: "stats",
  description: "Show new / learn / review counts, or field cardinality with --field.",
  flags: {
    "--deck <name>": "Restrict to a deck (subtree match).",
    "--field <name>": "Report frequency stats on this field instead.",
    "--top <N>": "Cap the top-N list for --field (default: 20).",
  },
  parseSubArgs(_positional, rest) {
    return parseSubArgs(rest);
  },
  async run(args, sub) {
    return withFatal(async () => {
      const startMs = Date.now();
      if (sub.field) {
        const fieldStats = await fetchFieldStats({
          field: sub.field,
          ankiConnectUrl: args.url,
          deck: sub.deck,
          top: sub.top,
        });
        const data = fieldStats;
        const human = [
          `Field: ${fieldStats.field}`,
          `Total notes: ${fieldStats.total}; unique: ${fieldStats.unique}; empty: ${fieldStats.empty}`,
          ...fieldStats.top.map(
            (t, i) => `  ${(i + 1).toString().padStart(3)}. ${t.count.toString().padStart(5)}  ${t.value}`,
          ),
        ].join("\n");
        console.log(formatOutput(data, { args, startMs, command: "stats" }, human));
        return 0;
      }
      const stats = await fetchStats({ ankiConnectUrl: args.url, deck: sub.deck });
      console.log(formatOutput(stats, { args, startMs, command: "stats" }, renderStats(stats)));
      return 0;
    });
  },
};

export default command;
