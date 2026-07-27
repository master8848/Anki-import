/**
 * `fields <model>` command — list field names for one model.
 */

import { fetchFields } from "../../schema.ts";
import type { Command } from "../command.ts";
import { formatOutput, withFatal } from "../output.ts";

export interface FieldsSubArgs {
  positional: string[];
}

function parseSubArgs(positional: string[]): FieldsSubArgs {
  return { positional };
}

const command: Command<FieldsSubArgs> = {
  name: "fields",
  description: "List field names for a model (e.g. 'fields Basic').",
  flags: {},
  parseSubArgs(positional) {
    return parseSubArgs(positional);
  },
  async run(args, sub) {
    if (sub.positional.length !== 1) {
      console.error("Usage: anki-xml fields <model>");
      return 2;
    }
    const modelName = sub.positional[0]!;
    return withFatal(async () => {
      const startMs = Date.now();
      const fields = await fetchFields(modelName, { ankiConnectUrl: args.url });
      const data = { model: modelName, fields };
      const human = `${modelName}: ${fields.join(", ")}`;
      console.log(formatOutput(data, { args, startMs, command: "fields" }, human));
      return 0;
    });
  },
};

export default command;