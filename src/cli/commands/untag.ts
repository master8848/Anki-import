/**
 * `untag` command — bulk remove tags from notes by query.
 */

import { runUntag } from "../../tag.ts";
import type { Command } from "../command.ts";
import { formatOutput, withFatal } from "../output.ts";

export interface UntagSubArgs {
  tags: string[];
  deck?: string;
  query?: string;
}

function parseSubArgs(rest: string[]): UntagSubArgs {
  const out: UntagSubArgs = { tags: [] };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a === "--tag") {
      const v = rest[i + 1];
      if (v === undefined) throw new Error("--tag requires a value");
      out.tags.push(v);
      i++;
    } else if (a === "--deck") {
      const v = rest[i + 1];
      if (v === undefined) throw new Error("--deck requires a value");
      out.deck = v;
      i++;
    } else if (a === "--query") {
      const v = rest[i + 1];
      if (v === undefined) throw new Error("--query requires a value");
      out.query = v;
      i++;
    }
  }
  return out;
}

const command: Command<UntagSubArgs> = {
  name: "untag",
  description: "Remove tags from notes that match a query or deck.",
  flags: {
    "--tag <name>": "Tag to remove (repeatable).",
    "--deck <name>": "Restrict to a deck (subtree match).",
    "--query <s>": "Anki search query (overrides --deck).",
    "--dry-run": "Report what would change without contacting AnkiConnect.",
  },
  parseSubArgs(_positional, rest) {
    return parseSubArgs(rest);
  },
  async run(args, sub) {
    return withFatal(async () => {
      const startMs = Date.now();
      const result = await runUntag({
        ankiConnectUrl: args.url,
        deck: sub.deck,
        query: sub.query,
        tags: sub.tags,
        dryRun: args.dryRun,
      });
      const data = {
        matched: result.matched,
        modified: result.modified,
        noteIds: result.noteIds,
      };
      const human = args.dryRun
        ? `Would untag ${result.modified} note(s).`
        : `Untagged ${result.modified} note(s).`;
      console.log(formatOutput(data, { args, startMs, command: "untag" }, human));
      return 0;
    });
  },
};

export default command;
