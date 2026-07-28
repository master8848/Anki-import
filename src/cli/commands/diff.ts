/**
 * `diff` command — compare a file against the live collection.
 */

import { runDiff } from "../../diff.ts";
import type { Command } from "../command.ts";
import { formatOutput, withFatal } from "../output.ts";

export interface DiffSubArgs {
  positional: string[];
  deck?: string;
}

function parseSubArgs(positional: string[], rest: string[]): DiffSubArgs {
  const out: DiffSubArgs = { positional };
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

const command: Command<DiffSubArgs> = {
  name: "diff",
  description: "Compare a file against the live collection.",
  flags: {
    "--deck <name>": "Restrict the collection side to a deck.",
  },
  parseSubArgs(positional, rest) {
    return parseSubArgs(positional, rest);
  },
  async run(args, sub) {
    if (sub.positional.length !== 1) {
      console.error("Usage: anki-xml diff <file> [--deck NAME]");
      return 2;
    }
    const file = sub.positional[0]!;
    return withFatal(async () => {
      const startMs = Date.now();
      const result = await runDiff({
        inputPath: file,
        ankiConnectUrl: args.url,
        deck: sub.deck,
      });
      const data = {
        file: result.file,
        fileNoteCount: result.fileNoteCount,
        collectionNoteCount: result.collectionNoteCount,
        new: result.new,
        changed: result.changed,
        removed: result.removed,
        unchanged: result.unchanged,
      };
      const human = [
        `File: ${result.file}`,
        `File notes: ${result.fileNoteCount}; Collection notes: ${result.collectionNoteCount}`,
        `New: ${result.new.length}`,
        `Changed: ${result.changed.length}`,
        `Removed: ${result.removed.length}`,
        `Unchanged: ${result.unchanged.length}`,
      ].join("\n");
      console.log(formatOutput(data, { args, startMs, command: "diff" }, human));
      return 0;
    });
  },
};

export default command;
