/**
 * `rollback` command — restore a checkpoint.
 */

import { rollbackCheckpoint } from "../../checkpoints.ts";
import type { Command } from "../command.ts";
import { formatOutput, withFatal } from "../output.ts";

export interface RollbackSubArgs {
  positional: string[];
  to: string | null;
}

function parseSubArgs(positional: string[], rest: string[]): RollbackSubArgs {
  const out: RollbackSubArgs = { positional, to: null };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a === "--to") {
      out.to = rest[i + 1];
      i++;
    }
  }
  return out;
}

const command: Command<RollbackSubArgs> = {
  name: "rollback",
  description: "Restore a checkpoint (undo a previous destructive operation).",
  flags: {
    "--to <name>": "Name of the checkpoint to restore.",
  },
  parseSubArgs(positional, rest) {
    return parseSubArgs(positional, rest);
  },
  async run(args, sub) {
    if (!sub.to) {
      console.error("Usage: anki-xml rollback --to <name>");
      return 2;
    }
    return withFatal(async () => {
      const startMs = Date.now();
      const result = await rollbackCheckpoint(sub.to, {
        ankiConnectUrl: args.url,
      });
      const data = { checkpoint: sub.to, ...result };
      const human = [
        `Checkpoint '${sub.to}':`,
        `  restored: ${result.restored}`,
        `  missing:  ${result.missing}`,
        `  fields:   ${result.fields}`,
        `  tags:     ${result.tags}`,
        `  decks:    ${result.decks}`,
      ].join("\n");
      console.log(formatOutput(data, { args, startMs, command: "rollback" }, human));
      return 0;
    });
  },
};

export default command;