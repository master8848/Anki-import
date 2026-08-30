import { DEFAULT_URL } from "@anki-xml/anki";

export const VERSION = "0.0.4";
export const BIN_NAME = "anki-import";

export function printHelp(): void {
  console.log(`${BIN_NAME} v${VERSION}

Manage Anki cards as files. Simple, safe, scriptable.

Usage:
  ${BIN_NAME} <command> [options]

Commands:
  open                           Open Anki app
  doctor                         Check if Anki is reachable
  validate <file>                Check file for errors (no Anki needed)
  plan <file>                    Preview what will change
  diff <file>                    Show changes per card
  import <file>                  Add new cards to Anki
  sync [<file>]                  Add + update cards (or show missing if no file)
  rollback <checkpoint-id>       Undo an import
  checkpoint list|create         See or save checkpoints
  watch <file>                   Watch file and auto-update
  tags list|add|remove           Manage tags
  models                         List card types
  stats [--deck <name>]          Show counts
  media store|list|retrieve|delete  Manage files
  benchmark <file>               Check speed
  mcp                            Start MCP server for AI agents

Options:
  --url <url>          Anki address (default ${DEFAULT_URL})
  --json               JSON output (for scripts)
  --quiet              Only show errors
  --verbose            Show more logs
  --debug              Show error details
  --help, -h           Show this help
  --version, -V        Show version

File options:
  --deck <name>        Use this deck if card has no deck
  --model <name>       Use this card type if missing
  --stream             For very large files
  --batch-size <n>     Cards per request (default 500)
  --dry-run            Preview only, don't save
  --allow-duplicate    Allow duplicate cards
  --no-auto-create-deck  Don't create new decks
  --checkpoint <id>    Checkpoint to use
  --yes                Skip confirmation (for watch)

Examples:
  ${BIN_NAME} open
  ${BIN_NAME} doctor
  ${BIN_NAME} validate cards.xml
  ${BIN_NAME} plan cards.yaml
  ${BIN_NAME} import cards.xml --stream
  ${BIN_NAME} sync cards.xml --dry-run
  ${BIN_NAME} watch cards.xml --yes
  ${BIN_NAME} rollback import-2026-07-30
`);
}

export function printCommandHelp(command: string): boolean {
  const texts: Record<string, string> = {
    doctor: `Usage: ${BIN_NAME} doctor [--url <url>]
Check if Anki is reachable. Shows what to fix if not.`,
    open: `Usage: ${BIN_NAME} open
Open the Anki app so AnkiConnect can work.
  macOS: open -a Anki  |  Windows: start "" "Anki"  |  Linux: anki`,
    validate: `Usage: ${BIN_NAME} validate <file> [--deck NAME] [--model NAME]
Check your file for errors. No Anki needed.`,
    plan: `Usage: ${BIN_NAME} plan <file> [--stream] [--deck NAME] [--model NAME]
Preview what will be added or changed.`,
    diff: `Usage: ${BIN_NAME} diff <file> [--stream] [--deck NAME] [--model NAME]
Show what changed for each card.`,
    import: `Usage: ${BIN_NAME} import <file> [--dry-run] [--stream] [--batch-size N] [--deck NAME] [--model NAME]
Add new cards to Anki. Use sync to update existing ones.`,
    sync: `Usage: ${BIN_NAME} sync [<file>] [--dry-run] [--checkpoint <id>]
Add + update cards. Without a file, shows what's missing.`,
    checkpoint: `Usage: ${BIN_NAME} checkpoint list
       ${BIN_NAME} checkpoint create <id> --note-ids 1,2,3 [--deck NAME]
Checkpoints let you undo an import.`,
    rollback: `Usage: ${BIN_NAME} rollback <checkpoint-id> [--dry-run]
Undo the cards from an import.`,
    watch: `Usage: ${BIN_NAME} watch <file> [--yes] [--stream]
Watch a file and auto-update Anki when it changes.`,
    tags: `Usage: ${BIN_NAME} tags list
       ${BIN_NAME} tags add <tag> --note-ids 1,2,3 | --query "deck:X"
       ${BIN_NAME} tags remove <tag> --note-ids 1,2,3 | --query "deck:X"`,
    models: `Usage: ${BIN_NAME} models
List card types and their fields.`,
    stats: `Usage: ${BIN_NAME} stats [--deck <name>]
Show how many cards you have.`,
    media: `Usage: ${BIN_NAME} media store <file> [--as <name>]
       ${BIN_NAME} media list
       ${BIN_NAME} media retrieve <name> [--out <path>]
       ${BIN_NAME} media delete <name>`,
    benchmark: `Usage: ${BIN_NAME} benchmark <file> [--stream]
Check how fast your file parses.`,
    mcp: `Usage: ${BIN_NAME} mcp
Start the MCP server for AI agents.`,
  };
  const t = texts[command];
  if (!t) return false;
  console.log(t);
  return true;
}
