import { DEFAULT_URL } from "@anki-xml/anki";

export const VERSION = "0.0.4";
export const BIN_NAME = "anki-import";

export function printHelp(): void {
  console.log(`${BIN_NAME} v${VERSION}

Git + Terraform for Anki knowledge. XML-first infrastructure-as-code for Anki.

Usage:
  ${BIN_NAME} <command> [options]

Commands:
  doctor                         Diagnose AnkiConnect with fix steps
  validate <file>                Validate without contacting Anki
  plan <file>                    Preview changes vs collection (dry run)
  diff <file>                    Show per-note field diffs vs collection
  import <file>                  Create notes in Anki (batch)
  sync [<file>]                  Reconcile: create + update (+ checkpoint drift)
  rollback <checkpoint-id>       Delete notes from a checkpoint
  checkpoint list|create         Manage checkpoints
  watch <file>                   Watch, validate, diff, confirm, apply
  tags list|add|remove           Manage tags
  models                         List note types + fields
  stats [--deck <name>]          Collection statistics
  media store|list|retrieve|delete
  benchmark <file>               Measure parse/validate throughput
  mcp                            Run the MCP server (stdio)

Global options:
  --url <url>          AnkiConnect URL (default ${DEFAULT_URL})
  --json               Machine-readable JSON output
  --quiet              Errors only
  --verbose            Debug-level logging
  --debug              Include stack traces on fatal errors
  --help, -h           Show help
  --version, -V        Show version

File options:
  --deck <name>        Fill empty decks with this value
  --model <name>       Fill empty model types with this value
  --stream             Stream-parse large XML files
  --batch-size <n>     Notes per AnkiConnect request (default 500)
  --dry-run            Validate + plan only; do not write
  --allow-duplicate
  --no-auto-create-deck
  --checkpoint <id>    Checkpoint id for this operation
  --yes                Watch: apply without asking

Examples:
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
    doctor: `Usage: ${BIN_NAME} doctor [--url <url>]`,
    validate: `Usage: ${BIN_NAME} validate <file> [--deck NAME] [--model NAME]`,
    plan: `Usage: ${BIN_NAME} plan <file> [--stream] [--deck NAME] [--model NAME]`,
    diff: `Usage: ${BIN_NAME} diff <file> [--stream] [--deck NAME] [--model NAME]`,
    import: `Usage: ${BIN_NAME} import <file> [--dry-run] [--stream] [--batch-size N] [--deck NAME] [--model NAME]`,
    sync: `Usage: ${BIN_NAME} sync [<file>] [--dry-run] [--checkpoint <id>]`,
    checkpoint: `Usage: ${BIN_NAME} checkpoint list
       ${BIN_NAME} checkpoint create <id> --note-ids 1,2,3 [--deck NAME]`,
    rollback: `Usage: ${BIN_NAME} rollback <checkpoint-id> [--dry-run]`,
    watch: `Usage: ${BIN_NAME} watch <file> [--yes] [--stream]`,
    tags: `Usage: ${BIN_NAME} tags list
       ${BIN_NAME} tags add <tag> --note-ids 1,2,3 | --query "deck:X"
       ${BIN_NAME} tags remove <tag> --note-ids 1,2,3 | --query "deck:X"`,
    models: `Usage: ${BIN_NAME} models`,
    stats: `Usage: ${BIN_NAME} stats [--deck <name>]`,
    media: `Usage: ${BIN_NAME} media store <file> [--as <name>]
       ${BIN_NAME} media list
       ${BIN_NAME} media retrieve <name> [--out <path>]
       ${BIN_NAME} media delete <name>`,
    benchmark: `Usage: ${BIN_NAME} benchmark <file> [--stream]`,
    mcp: `Usage: ${BIN_NAME} mcp`,
  };
  const t = texts[command];
  if (!t) return false;
  console.log(t);
  return true;
}
