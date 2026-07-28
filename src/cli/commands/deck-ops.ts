/**
 * Deck operations: rename-deck, delete-deck, move-notes.
 */

import { runDeleteDeck, runMoveNotes, runRenameDeck } from "../../decks-cmd.ts";
import type { Command } from "../command.ts";
import { formatOutput, withFatal } from "../output.ts";

interface RenameSubArgs {
  positional: string[];
}

const renameCmd: Command<RenameSubArgs> = {
  name: "rename-deck",
  description: "Rename a deck (no-op for child decks).",
  flags: {},
  parseSubArgs(positional) {
    return { positional };
  },
  async run(args, sub) {
    return withFatal(async () => {
      const startMs = Date.now();
      if (sub.positional.length !== 2) {
        console.error("Usage: anki-xml rename-deck <old> <new>");
        return 2;
      }
      const [oldName, newName] = sub.positional;
      const result = await runRenameDeck({
        ankiConnectUrl: args.url,
        oldName: oldName!,
        newName: newName!,
        dryRun: args.dryRun,
      });
      const data = result;
      const human = args.dryRun
        ? `Would rename ${oldName} to ${newName}.`
        : `Renamed ${oldName} to ${newName}.`;
      console.log(formatOutput(data, { args, startMs, command: "rename-deck" }, human));
      return 0;
    });
  },
};

interface DeleteDeckSubArgs {
  positional: string[];
  cardsToo: boolean;
}

const deleteDeckCmd: Command<DeleteDeckSubArgs> = {
  name: "delete-deck",
  description: "Delete a deck and (optionally) its cards.",
  flags: {
    "--cards-too": "Also delete the cards in the deck (required by AnkiConnect).",
  },
  parseSubArgs(positional, rest) {
    return { positional, cardsToo: rest.includes("--cards-too") };
  },
  async run(args, sub) {
    return withFatal(async () => {
      const startMs = Date.now();
      if (sub.positional.length !== 1) {
        console.error("Usage: anki-xml delete-deck <name> [--cards-too]");
        return 2;
      }
      const name = sub.positional[0]!;
      const result = await runDeleteDeck({
        ankiConnectUrl: args.url,
        name,
        cardsToo: sub.cardsToo,
        dryRun: args.dryRun,
      });
      const data = result;
      const human = args.dryRun
        ? `Would delete deck ${name}.`
        : `Deleted deck ${name}.`;
      console.log(formatOutput(data, { args, startMs, command: "delete-deck" }, human));
      return 0;
    });
  },
};

interface MoveNotesSubArgs {
  query: string;
  deck: string;
}

const moveNotesCmd: Command<MoveNotesSubArgs> = {
  name: "move-notes",
  description: "Move all notes matching a query to a target deck.",
  flags: {
    "--query <s>": "Anki search query (required).",
    "--deck <name>": "Target deck (required).",
    "--dry-run": "Report what would change without contacting AnkiConnect.",
  },
  parseSubArgs(_positional, rest) {
    const out: { query?: string; deck?: string } = {};
    for (let i = 0; i < rest.length; i++) {
      const a = rest[i]!;
      if (a === "--query") {
        out.query = rest[i + 1];
        i++;
      } else if (a === "--deck") {
        out.deck = rest[i + 1];
        i++;
      }
    }
    if (!out.query || !out.deck) {
      throw new Error("move-notes requires --query and --deck");
    }
    return out as MoveNotesSubArgs;
  },
  async run(args, sub) {
    return withFatal(async () => {
      const startMs = Date.now();
      const result = await runMoveNotes({
        ankiConnectUrl: args.url,
        query: sub.query,
        deck: sub.deck,
        dryRun: args.dryRun,
      });
      const data = { moved: result.moved, noteIds: result.noteIds };
      const human = args.dryRun
        ? `Would move ${result.moved} note(s) to ${sub.deck}.`
        : `Moved ${result.moved} note(s) to ${sub.deck}.`;
      console.log(formatOutput(data, { args, startMs, command: "move-notes" }, human));
      return 0;
    });
  },
};

export { renameCmd, deleteDeckCmd, moveNotesCmd };
