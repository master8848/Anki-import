/**
 * Build the top-level `--help` text from the command registry.
 *
 * Keeping `--help` derived from the registry means adding a new command
 * automatically shows it in `anki-xml --help` without a separate edit.
 */

import { COMMANDS } from "./registry.ts";

export const VERSION = "0.0.2";

const COMMON_OPTIONS = `Common options:
  --url <url>               AnkiConnect endpoint (default http://127.0.0.1:8765)
  --json                    Emit machine-readable JSON instead of text
  --json-legacy             Emit legacy JSON shape (raw payload, pre-v1)
  --format <fmt>            Output format: 'default' or 'ndjson' (one record/line)
  --dry-run                 Validate and report; do not contact AnkiConnect
  --quiet                   Summary only (no per-op detail)
  --no-color                Strip ANSI color codes from output
  --profile <name>          Use a named profile from .anki-xmlrc / config.toml
  --batch-id <id>           Wrap the write in a named atomic batch
  --rollback-on-partial     Auto-rollback the batch on any failure
  --idempotency-key <key>   Skip if this key was already completed successfully
  --config <path>           Use a custom config file
  --help, -h                Show this help
  --version, -v             Print the version`;

const EXAMPLES_BLOCK = `Examples:
  anki-xml doctor                                            # verify env
  anki-xml import ./cards.xml                                # create notes
  anki-xml import ./cards.xml --dry-run                      # validate only
  anki-xml plan ./cards.xml --format ndjson                  # NDJSON preflight
  anki-xml validate ./cards.xml --strict                     # gate a PR
  anki-xml decks                                             # list decks
  anki-xml stats --deck "Spanish"                            # one deck
  anki-xml stats --field Front --top 10                      # frequency
  anki-xml search "serendipity" --deck "English"
  anki-xml search --query "deck:Spanish is:review" --limit 5
  anki-xml update --id 1234567890 --field Front="new Q" --field Back="new A"
  anki-xml update --file ./updates.xml --dry-run
  anki-xml update --rename-field Fron=Front --ids 1,2,3      # typo recovery
  anki-xml delete --query "deck:Tmp tag:scratch" --yes
  anki-xml checkpoint create pre-batch --ids 1,2,3
  anki-xml rollback --to pre-batch
  anki-xml audit-log --limit 20 --command import
  anki-xml import ./cards.xml --resume-from pre-batch       # resume
  anki-xml import ./cards.xml --batch-id nightly --rollback-on-partial
  anki-xml sample 5 --seed 42                               # deterministic
  anki-xml schema-validate ./cards.xml                      # drift detector
  anki-xml models                                            # discovery
  anki-xml fields Basic                                       # one model
  anki-xml note-info 1234567890                              # one note
  anki-xml profile add work http://10.0.0.42:8765             # multi-coll
  anki-xml completion bash | source /dev/stdin`;

export function printHelp(): void {
  // Group commands by surface for readability.
  const groups: Record<string, { name: string; description: string }[]> = {
    "Read / Query": [],
    "Write": [],
    "Schema": [],
    "Lifecycle": [],
    "Recovery": [],
    "Shell": [],
  };
  // Hand-grouped to match common workflow order.
  const grouping: Record<string, keyof typeof groups> = {
    "validate": "Read / Query",
    "plan": "Read / Query",
    "decks": "Read / Query",
    "stats": "Read / Query",
    "search": "Read / Query",
    "export": "Read / Query",
    "diff": "Read / Query",
    "preview": "Read / Query",
    "sample": "Read / Query",
    "schema-validate": "Read / Query",
    "doctor": "Read / Query",
    "import": "Write",
    "update": "Write",
    "tag": "Write",
    "untag": "Write",
    "delete": "Write",
    "sync": "Write",
    "migrate": "Write",
    "suspend": "Write",
    "unsuspend": "Write",
    "bury": "Write",
    "rename-deck": "Write",
    "delete-deck": "Write",
    "move-notes": "Write",
    "models": "Schema",
    "fields": "Schema",
    "tags": "Schema",
    "note-info": "Schema",
    "profile": "Lifecycle",
    "migrate": "Lifecycle",
    "checkpoint": "Recovery",
    "rollback": "Recovery",
    "audit-log": "Recovery",
    "completion": "Shell",
  };
  for (const c of COMMANDS) {
    const group = grouping[c.name] ?? "Read / Query";
    groups[group]!.push({ name: c.name, description: c.description });
  }

  const groupLines = Object.entries(groups)
    .filter(([, items]) => items.length > 0)
    .map(([title, items]) => {
      const itemLines = items.map((c) => `  ${c.name.padEnd(16)} ${c.description}`);
      return `${title}:\n${itemLines.join("\n")}`;
    })
    .join("\n\n");

  console.log(`anki-xml v${VERSION}

Import, query, and update Anki flashcards via AnkiConnect.

Usage:
  anki-xml [global options] <command> [subcommand options]

${groupLines}

${COMMON_OPTIONS}

${EXAMPLES_BLOCK}`);
}

/**
 * Build per-command help text. Returns false if the command is unknown.
 *
 * Uses the command's `positional` hint to show usage cleanly. Each
 * command contributes a one-line summary of its purpose, the positional
 * arguments (if any), its flags, the common global flags, and an
 * example.
 */
const POSITIONAL: Record<string, string> = {
  "import": "<file>",
  "validate": "<file>",
  "plan": "<file>",
  "schema-validate": "<file>",
  "sample": "<N>",
  "note-info": "<id>",
  "stats": "",
  "fields": "<model>",
  "search": "[<phrase>]",
  "delete": "",
  "update": "",
  "export": "<file>",
  "completion": "<shell>",
  "migrate": "<subcommand> <file>",
  "preview": "",
  "rollback": "",
  "rename-deck": "<old> <new>",
  "delete-deck": "<name>",
  "move-notes": "<deck>",
  "suspend": "",
  "unsuspend": "",
  "bury": "",
  "tag": "<tag>",
  "untag": "<tag>",
  "audit-log": "",
};

const EXAMPLES: Record<string, string> = {
  "import": "  anki-xml import ./cards.xml\n  anki-xml import ./cards.xml --dry-run --no-auto-create-deck",
  "validate": "  anki-xml validate ./cards.xml --strict",
  "plan": "  anki-xml plan ./cards.xml --format ndjson",
  "decks": "  anki-xml decks --json",
  "stats": "  anki-xml stats --deck \"Spanish\"\n  anki-xml stats --field Front --top 10",
  "search": "  anki-xml search \"hola\" --deck \"Spanish\" --limit 5\n  anki-xml search --query \"deck:Spanish is:review\"",
  "update": "  anki-xml update --id 1234567890 --field Front=\"new Q\" --field Back=\"new A\"\n  anki-xml update --file ./updates.xml\n  anki-xml update --rename-field Fron=Front --ids 1,2,3",
  "tag": "  anki-xml tag --ids 1,2,3 reading\n  anki-xml tag --query \"deck:Spanish\" spanish",
  "untag": "  anki-xml untag --ids 1,2,3 scratch",
  "delete": "  anki-xml delete --query \"deck:Tmp tag:scratch\" --yes\n  anki-xml delete --ids 1,2,3 --cards-too",
  "export": "  anki-xml export \"deck:Spanish\" spanish-deck.xml",
  "completion": "  anki-xml completion bash | source /dev/stdin",
  "doctor": "  anki-xml doctor",
  "migrate": "  anki-xml migrate assign-guids ./cards.xml",
  "diff": "  anki-xml diff ./cards.xml",
  "sync": "  anki-xml sync ./cards.xml",
  "preview": "  anki-xml preview --query \"deck:Spanish\"",
  "rollback": "  anki-xml rollback --to pre-batch",
  "rename-deck": "  anki-xml rename-deck \"Old Name\" \"New Name\"",
  "delete-deck": "  anki-xml delete-deck \"Tmp\" --yes",
  "move-notes": "  anki-xml move-notes \"Target\" --ids 1,2,3",
  "suspend": "  anki-xml suspend --ids 1,2,3",
  "unsuspend": "  anki-xml unsuspend --ids 1,2,3",
  "bury": "  anki-xml bury --ids 1,2,3",
  "note-info": "  anki-xml note-info 1234567890",
  "fields": "  anki-xml fields Basic",
  "models": "  anki-xml models",
  "tags": "  anki-xml tags",
  "sample": "  anki-xml sample 5 --seed 42\n  anki-xml sample 5 --query \"deck:Spanish\"",
  "schema-validate": "  anki-xml schema-validate ./cards.xml",
  "audit-log": "  anki-xml audit-log --limit 20 --command import",
  "checkpoint": "  anki-xml checkpoint create pre-batch --ids 1,2,3\n  anki-xml checkpoint list",
  "profile": "  anki-xml profile add work http://10.0.0.42:8765\n  anki-xml profile list",
};

export function printCommandHelp(commandName: string): boolean {
  const cmd = COMMANDS.find((c) => c.name === commandName);
  if (!cmd) return false;

  const positional = POSITIONAL[cmd.name] ?? "";
  const usage = positional ? positional : "";

  const flagLines = Object.entries(cmd.flags ?? {})
    .map(([flag, desc]) => `  ${flag.padEnd(26)} ${desc}`)
    .join("\n");

  const example = EXAMPLES[cmd.name];

  console.log(`anki-xml ${cmd.name} — ${cmd.description}

Usage:
  anki-xml ${cmd.name} ${usage} [options]

${flagLines ? `Options:\n${flagLines}\n` : ""}Global options:
  --url <url>               AnkiConnect endpoint (default http://127.0.0.1:8765)
  --json                    Emit JSON
  --format <fmt>            Output format: 'default' or 'ndjson'
  --batch-id <id>           Wrap the write in a named atomic batch
  --rollback-on-partial     Auto-rollback the batch on any failure
  --idempotency-key <key>   Skip if this key was already completed successfully
  --profile <name>          Named profile (see 'anki-xml profile')
  --config <path>           Custom config file
  --quiet                   Summary only
  --no-color                Strip ANSI color

${example ? `Example(s):\n${example}\n` : ""}Run \`anki-xml ${cmd.name} --help\` to see these options again.
`);
  return true;
}