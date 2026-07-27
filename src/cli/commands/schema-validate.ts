/**
 * `schema-validate <file>` — static + live schema check.
 */

import { runSchemaValidate } from "../../schema-validate.ts";
import type { Command } from "../command.ts";
import { formatOutput, withFatal } from "../output.ts";

export interface SchemaValidateSubArgs {
  positional: string[];
}

function parseSubArgs(positional: string[]): SchemaValidateSubArgs {
  return { positional };
}

const command: Command<SchemaValidateSubArgs> = {
  name: "schema-validate",
  description: "Validate a file against the LIVE collection's schema.",
  flags: {},
  parseSubArgs(positional) {
    return parseSubArgs(positional);
  },
  async run(args, sub) {
    if (sub.positional.length !== 1) {
      console.error("Usage: anki-xml schema-validate <file>");
      return 2;
    }
    const file = sub.positional[0]!;
    return withFatal(async () => {
      const startMs = Date.now();
      const result = await runSchemaValidate({
        inputPath: file,
        ankiConnectUrl: args.url,
      });
      const data = result;
      const human = [
        `File: ${result.file}`,
        `Notes: ${result.totalNotes}; clean: ${result.cleanNotes}; issues: ${result.issues.length}`,
        ...result.issues.map(
          (i) =>
            `  [note ${i.noteNumber}] ${i.kind}${i.field ? " (" + i.field + ")" : ""}: ${i.message}`,
        ),
      ].join("\n");
      console.log(formatOutput(data, { args, startMs, command: "schema-validate" }, human));
      return 0;
    });
  },
};

export default command;