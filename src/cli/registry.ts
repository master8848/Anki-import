/**
 * Command registry — the single source of truth for which CLI subcommands
 * exist and how to dispatch them.
 *
 * This replaces the `switch (args.command)` block that used to live in
 * `main()`. The registry is data-driven so:
 *
 *   1. `--help` and the shell completion scripts enumerate commands
 *      automatically.
 *   2. New commands are added by dropping a file into `commands/` and
 *      importing it here.
 *   3. The AI agent introspection layer can iterate `COMMANDS` to
 *      discover capabilities.
 */

import type { Command } from "./command.ts";
import importCmd from "./commands/import.ts";
import validateCmd from "./commands/validate.ts";
import planCmd from "./commands/plan.ts";
import decksCmd from "./commands/decks.ts";
import statsCmd from "./commands/stats.ts";
import searchCmd from "./commands/search.ts";
import updateCmd from "./commands/update.ts";
import tagCmd from "./commands/tag.ts";
import untagCmd from "./commands/untag.ts";
import exportCmd from "./commands/export.ts";
import deleteCmd from "./commands/delete.ts";
import { renameCmd, deleteDeckCmd, moveNotesCmd } from "./commands/deck-ops.ts";
import { suspendCmd, unsuspendCmd, buryCmd } from "./commands/scheduling.ts";
import completionCmd from "./commands/completion.ts";

export const COMMANDS: Command[] = [
  importCmd,
  validateCmd,
  planCmd,
  decksCmd,
  statsCmd,
  searchCmd,
  updateCmd,
  tagCmd,
  untagCmd,
  exportCmd,
  deleteCmd,
  renameCmd,
  deleteDeckCmd,
  moveNotesCmd,
  suspendCmd,
  unsuspendCmd,
  buryCmd,
  completionCmd,
];

export function findCommand(name: string): Command | undefined {
  return COMMANDS.find((c) => c.name === name);
}

/**
 * The list of command names, in the order they appear in `COMMANDS`.
 * Useful for completion scripts and `--help` output.
 */
export const COMMAND_NAMES: string[] = COMMANDS.map((c) => c.name);
