/**
 * `tags` command — list every tag in use with note counts.
 */

import { fetchTagInfo } from "../../schema.ts";
import type { Command } from "../command.ts";
import { formatOutput, withFatal } from "../output.ts";

export interface TagsSubArgs {
  positional: string[];
}

function parseSubArgs(positional: string[]): TagsSubArgs {
  return { positional };
}

const command: Command<TagsSubArgs> = {
  name: "tags",
  description: "List every tag in the collection with note counts.",
  flags: {},
  parseSubArgs(positional) {
    return parseSubArgs(positional);
  },
  async run(args) {
    return withFatal(async () => {
      const startMs = Date.now();
      const tags = await fetchTagInfo({ ankiConnectUrl: args.url });
      const sorted = tags.slice().sort((a, b) => b.count - a.count);
      const data = { tags: sorted };
      const human = sorted
        .map((t) => `${t.count.toString().padStart(5, " ")}  ${t.name}`)
        .join("\n");
      console.log(formatOutput(data, { args, startMs, command: "tags" }, human));
      return 0;
    });
  },
};

export default command;