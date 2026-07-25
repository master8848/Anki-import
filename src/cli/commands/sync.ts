/**
 * `sync` command — reconcile a file with the live collection.
 */

import { runSync } from "../../sync.ts";
import type { Command } from "../command.ts";
import { formatOutput, withFatal } from "../output.ts";

export interface SyncSubArgs {
  positional: string[];
  yes: boolean;
  deck?: string;
}

function parseSubArgs(positional: string[], rest: string[]): SyncSubArgs {
  const out: SyncSubArgs = { positional, yes: rest.includes("--yes") };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a === "--deck") {
      const v = rest[i + 1];
      if (v === undefined) throw new Error("--deck requires a value");
      out.deck = v;
      i++;
    }
  }
  return out;
}

const command: Command<SyncSubArgs> = {
  name: "sync",
  description: "Reconcile a file with the live collection (creates, updates, deletes).",
  flags: {
    "--yes": "Confirm the destructive parts (deletes).",
    "--deck <name>": "Restrict the collection side to a deck.",
    "--dry-run": "Show what would change without contacting AnkiConnect.",
  },
  parseSubArgs(positional, rest) {
    return parseSubArgs(positional, rest);
  },
  async run(args, sub) {
    if (sub.positional.length !== 1) {
      console.error("Usage: anki-xml sync <file> [--yes] [--deck NAME] [--dry-run]");
      return 2;
    }
    const file = sub.positional[0]!;
    return withFatal(async () => {
      const startMs = Date.now();
      const result = await runSync({
        inputPath: file,
        ankiConnectUrl: args.url,
        yes: sub.yes,
        dryRun: args.dryRun,
        deck: sub.deck,
      });
      const data = {
        created: result.created,
        updated: result.updated,
        deleted: result.deleted,
        new: result.diff.new,
        changed: result.diff.changed,
        removed: result.diff.removed,
      };
      const human = [
        args.dryRun ? "[dry run]" : "",
        `Created: ${result.created}`,
        `Updated: ${result.updated}`,
        `Deleted: ${result.deleted}`,
      ].filter((s) => s).join("\n");
      console.log(formatOutput(data, { args, startMs, command: "sync" }, human));
      return 0;
    });
  },
};

export default command;
