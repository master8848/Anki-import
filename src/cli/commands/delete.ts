/**
 * `delete` command — bulk note removal.
 */

import { runDelete } from "../../delete.ts";
import type { Command } from "../command.ts";
import { formatOutput, withFatal } from "../output.ts";

export interface DeleteSubArgs {
  query?: string;
  deck?: string;
  tags: string[];
  ids: number[];
}

function parseSubArgs(rest: string[]): DeleteSubArgs {
  const out: DeleteSubArgs = { tags: [], ids: [] };
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
    } else if (a === "--tag") {
      const v = rest[i + 1];
      if (v === undefined) throw new Error("--tag requires a value");
      out.tags.push(v);
      i++;
    } else if (a === "--ids") {
      const v = rest[i + 1];
      if (v === undefined) throw new Error("--ids requires a value");
      out.ids = v.split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
      i++;
    }
  }
  return out;
}

const command: Command<DeleteSubArgs> = {
  name: "delete",
  description: "Delete notes that match a query, deck, tag, or explicit ids.",
  flags: {
    "--query <s>": "Anki search query (e.g. 'tag:old deck:Spanish').",
    "--deck <name>": "Restrict to a deck (subtree match).",
    "--tag <name>": "Tag match (repeatable; AND with --query).",
    "--ids <list>": "Comma-separated note ids to delete.",
    "--dry-run": "Report what would be deleted without contacting AnkiConnect.",
  },
  parseSubArgs(_positional, rest) {
    return parseSubArgs(rest);
  },
  async run(args, sub) {
    return withFatal(async () => {
      const startMs = Date.now();
      const result = await runDelete({
        ankiConnectUrl: args.url,
        query: sub.query,
        deck: sub.deck,
        tags: sub.tags,
        ids: sub.ids,
        dryRun: args.dryRun,
      });
      const data = {
        matched: result.matched,
        deleted: result.deleted,
        noteIds: result.noteIds,
      };
      const human = args.dryRun
        ? `Would delete ${result.matched} note(s).`
        : `Deleted ${result.deleted} note(s).`;
      console.log(formatOutput(data, { args, startMs, command: "delete" }, human));
      return 0;
    });
  },
};

export default command;
