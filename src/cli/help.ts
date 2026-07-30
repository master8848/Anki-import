export const VERSION = "0.0.3";
export const BIN_NAME = "anki-import";

export function printHelp(): void {
  console.log(`${BIN_NAME} v${VERSION}

XML-first CLI for importing Anki flashcards via AnkiConnect.

Usage:
  ${BIN_NAME} <command> [options]

Commands:
  doctor                         Check AnkiConnect and collection health
  validate <file.xml>            Validate XML without contacting Anki
  import <file.xml>              Import notes into Anki
  checkpoint list                List saved checkpoints
  checkpoint create <id>         Create a checkpoint (requires --note-ids)
  rollback <checkpoint-id>       Delete notes from a checkpoint
  benchmark <file.xml>           Measure parse/validate throughput

Global options:
  --url <url>          AnkiConnect URL (default http://127.0.0.1:8765)
  --json               Machine-readable JSON output
  --quiet              Errors only
  --verbose            Debug-level logging
  --debug              Include stack traces on fatal errors
  --help, -h           Show help
  --version, -V        Show version

Import options:
  --dry-run            Validate only; do not write
  --stream             Stream-parse for large files
  --batch-size <n>     Notes per AnkiConnect request (default 500)
  --no-auto-create-deck
  --allow-duplicate
  --checkpoint <id>    Checkpoint id for this import

Examples:
  ${BIN_NAME} doctor
  ${BIN_NAME} validate cards.xml
  ${BIN_NAME} import cards.xml --dry-run
  ${BIN_NAME} import cards.xml --stream --batch-size 500
  ${BIN_NAME} rollback import-2026-07-30
`);
}

export function printCommandHelp(command: string): boolean {
  const texts: Record<string, string> = {
    doctor: `Usage: ${BIN_NAME} doctor [--url <url>]`,
    validate: `Usage: ${BIN_NAME} validate <file.xml>`,
    import: `Usage: ${BIN_NAME} import <file.xml> [--dry-run] [--stream] [--batch-size N]`,
    checkpoint: `Usage: ${BIN_NAME} checkpoint list
       ${BIN_NAME} checkpoint create <id> --note-ids 1,2,3 [--deck NAME]`,
    rollback: `Usage: ${BIN_NAME} rollback <checkpoint-id> [--dry-run]`,
    benchmark: `Usage: ${BIN_NAME} benchmark <file.xml> [--stream]`,
  };
  const t = texts[command];
  if (!t) return false;
  console.log(t);
  return true;
}
