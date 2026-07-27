/**
 * `note-info <id>` command — full info on one note by id.
 */

import { fetchNoteInfo } from "../../schema.ts";
import type { Command } from "../command.ts";
import { formatOutput, withFatal } from "../output.ts";

export interface NoteInfoSubArgs {
  positional: string[];
}

function parseSubArgs(positional: string[]): NoteInfoSubArgs {
  return { positional };
}

const command: Command<NoteInfoSubArgs> = {
  name: "note-info",
  description: "Show full info on one note by id (fields, tags, deck, cards).",
  flags: {},
  parseSubArgs(positional) {
    return parseSubArgs(positional);
  },
  async run(args, sub) {
    if (sub.positional.length !== 1) {
      console.error("Usage: anki-xml note-info <id>");
      return 2;
    }
    const idText = sub.positional[0]!;
    const id = Number(idText);
    if (!Number.isInteger(id) || id <= 0) {
      console.error(`error: '${idText}' is not a valid note id`);
      return 2;
    }
    return withFatal(async () => {
      const startMs = Date.now();
      const info = await fetchNoteInfo(id, { ankiConnectUrl: args.url });
      if (!info) {
        console.error(`error: note ${id} not found`);
        return 1;
      }
      const data = info;
      const human = [
        `Note ${info.noteId}`,
        `  model: ${info.modelName}`,
        `  deck:  ${info.deckName}`,
        `  guid:  ${info.guid}`,
        `  tags:  ${info.tags.join(" ") || "(none)"}`,
        `  cards: ${info.cards.join(", ") || "(none)"}`,
        `  fields:`,
        ...Object.entries(info.fields).map(
          ([name, f]) => `    ${name}: ${f.value.replace(/\n/g, "\n            ")}`,
        ),
      ].join("\n");
      console.log(formatOutput(data, { args, startMs, command: "note-info" }, human));
      return 0;
    });
  },
};

export default command;