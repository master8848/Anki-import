/**
 * `models` command — list every note model with fields and templates.
 */

import { fetchModelInfo } from "../../schema.ts";
import type { Command } from "../command.ts";
import { formatOutput, withFatal } from "../output.ts";

export interface ModelsSubArgs {
  positional: string[];
}

function parseSubArgs(positional: string[]): ModelsSubArgs {
  return { positional };
}

const command: Command<ModelsSubArgs> = {
  name: "models",
  description: "List every note model with field names and card templates.",
  flags: {},
  parseSubArgs(positional) {
    return parseSubArgs(positional);
  },
  async run(args) {
    return withFatal(async () => {
      const startMs = Date.now();
      const models = await fetchModelInfo({ ankiConnectUrl: args.url });
      const data = {
        models: models.map((m) => ({
          name: m.name,
          id: m.id,
          fields: m.fields,
          templates: m.templates.map((t) => t.name),
        })),
      };
      const human = models
        .map(
          (m) =>
            `${m.name} (id=${m.id})\n  fields: ${m.fields.join(", ")}\n  templates: ${m.templates.map((t) => t.name).join(", ")}`,
        )
        .join("\n\n");
      console.log(formatOutput(data, { args, startMs, command: "models" }, human));
      return 0;
    });
  },
};

export default command;