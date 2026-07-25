/**
 * Build the top-level `--help` text from the command registry.
 *
 * Keeping `--help` derived from the registry means adding a new command
 * automatically shows it in `anki-xml --help` without a separate edit.
 */

import { COMMAND_NAMES, COMMANDS } from "./registry.ts";

export const VERSION = "0.1.0";

export function printHelp(): void {
  const lines = COMMANDS.map((c) => `  ${c.name.padEnd(11)} ${c.description}`);
  const subcommandHelp = lines.join("\n");

  console.log(`anki-xml v${VERSION}

Import, query, and update Anki flashcards via AnkiConnect.

Usage:
  anki-xml <command> [options]

Commands:
${subcommandHelp}

Common options:
  --url <url>               AnkiConnect endpoint (default http://127.0.0.1:8765)
  --json                    Emit machine-readable JSON instead of text
  --dry-run                 Validate and report; do not contact AnkiConnect
  --help, -h                Show this help
  --version, -v             Print the version

Examples:
  anki-xml import ./cards.xml
  anki-xml validate ./cards.xml --strict
  anki-xml decks
  anki-xml stats --deck "Spanish"
  anki-xml search "serendipity" --deck "English"
  anki-xml update --id 1234567890 --field Front="new Q" --field Back="new A"
  anki-xml update --file ./updates.xml --dry-run
  anki-xml completion bash | source /dev/stdin`);
}

/**
 * Build per-command help text. Returns null if the command is unknown.
 */
export function printCommandHelp(commandName: string): boolean {
  const cmd = COMMANDS.find((c) => c.name === commandName);
  if (!cmd) return false;

  const flagLines = Object.entries(cmd.flags ?? {})
    .map(([flag, desc]) => `  ${flag.padEnd(26)} ${desc}`)
    .join("\n");

  console.log(`anki-xml ${cmd.name} — ${cmd.description}

Usage:
  anki-xml ${cmd.name} ${cmd.flags ? "[options]" : ""}${cmd.name === "completion" ? " <shell>" : cmd.name === "decks" || cmd.name === "stats" || cmd.name === "validate" || cmd.name === "import" ? (cmd.name === "import" || cmd.name === "validate" ? " <file>" : "") : ""}

${flagLines ? `Options:\n${flagLines}\n` : ""}Common options:
  --url <url>               AnkiConnect endpoint (default http://127.0.0.1:8765)
  --json                    Emit machine-readable JSON instead of text
  --dry-run                 Validate and report; do not contact AnkiConnect`);
  return true;
}

export { COMMAND_NAMES };
