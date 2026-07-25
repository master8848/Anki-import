/**
 * `migrate` command — apply idempotent schema transforms.
 */

import { runMigrate } from "../../migrate.ts";
import type { Command } from "../command.ts";
import { formatOutput, withFatal } from "../output.ts";

export interface MigrateSubArgs {
  transform: string | null;
  positional: string[];
}

function parseSubArgs(positional: string[]): MigrateSubArgs {
  return {
    transform: positional[0] ?? null,
    positional: positional.slice(1),
  };
}

const command: Command<MigrateSubArgs> = {
  name: "migrate",
  description: "Apply a schema migration transform (assign-guids, v1-to-v2).",
  flags: {},
  parseSubArgs(positional) {
    return parseSubArgs(positional);
  },
  async run(args, sub) {
    if (!sub.transform) {
      console.error("Usage: anki-xml migrate <transform> <in> <out>");
      console.error("Transforms: assign-guids, v1-to-v2");
      return 2;
    }
    if (sub.transform !== "assign-guids" && sub.transform !== "v1-to-v2") {
      console.error(`error: unknown transform '${sub.transform}'`);
      return 2;
    }
    if (sub.positional.length !== 2) {
      console.error("Usage: anki-xml migrate <transform> <in> <out>");
      return 2;
    }
    const inputPath = sub.positional[0]!;
    const outputPath = sub.positional[1]!;
    return withFatal(async () => {
      const startMs = Date.now();
      const result = await runMigrate({
        inputPath,
        outputPath,
        transform: sub.transform as "assign-guids" | "v1-to-v2",
      });
      const data = result;
      const human = `Applied ${result.transform} to ${result.notesProcessed} note(s); wrote ${outputPath}.`;
      console.log(formatOutput(data, { args, startMs, command: "migrate" }, human));
      return 0;
    });
  },
};

export default command;
