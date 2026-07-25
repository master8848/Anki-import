/**
 * Scheduling commands: suspend, unsuspend, bury.
 */

import { runBury, runSuspend, runUnsuspend } from "../../scheduling.ts";
import type { Command } from "../command.ts";
import { formatOutput, withFatal } from "../output.ts";

interface ScheduleSubArgs {
  query?: string;
  deck?: string;
}

function parseSubArgs(rest: string[]): ScheduleSubArgs {
  const out: ScheduleSubArgs = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a === "--query") {
      const v = rest[i + 1];
      if (v === undefined) throw new Error("--query requires a value");
      out.query = v;
      i++;
    } else if (a === "--deck") {
      const v = rest[i + 1];
      if (v === undefined) throw new Error("--deck requires a value");
      out.deck = v;
      i++;
    }
  }
  return out;
}

function makeCommand(
  name: "suspend" | "unsuspend" | "bury",
  description: string,
  runner: (opts: { ankiConnectUrl: string; query?: string; deck?: string; dryRun: boolean }) => Promise<{ matchedCards: number; scheduled: number; cardIds: number[] }>,
) {
  const cmd: Command<ScheduleSubArgs> = {
    name,
    description,
    flags: {
      "--query <s>": "Anki search query.",
      "--deck <name>": "Restrict to a deck (subtree match).",
      "--dry-run": "Report what would be scheduled without contacting AnkiConnect.",
    },
    parseSubArgs(_positional, rest) {
      return parseSubArgs(rest);
    },
    async run(args, sub) {
      return withFatal(async () => {
        const startMs = Date.now();
        const result = await runner({
          ankiConnectUrl: args.url,
          query: sub.query,
          deck: sub.deck,
          dryRun: args.dryRun,
        });
        const data = {
          matchedCards: result.matchedCards,
          scheduled: result.scheduled,
          cardIds: result.cardIds,
        };
        const verb = name === "bury" ? "Bury" : name.charAt(0).toUpperCase() + name.slice(1);
        const human = args.dryRun
          ? `Would ${name} ${result.matchedCards} card(s).`
          : `${verb}ed ${result.scheduled} card(s).`;
        console.log(formatOutput(data, { args, startMs, command: name }, human));
        return 0;
      });
    },
  };
  return cmd;
}

const suspendCmd = makeCommand("suspend", "Suspend cards (hide from review).", (o) => runSuspend(o));
const unsuspendCmd = makeCommand("unsuspend", "Unsuspend cards (return to review).", (o) => runUnsuspend(o));
const buryCmd = makeCommand("bury", "Bury cards (hide until tomorrow).", (o) => runBury(o));

export { suspendCmd, unsuspendCmd, buryCmd };
