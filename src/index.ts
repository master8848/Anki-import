#!/usr/bin/env bun
/**
 * anki-xml CLI entrypoint.
 *
 * Usage:
 *
 *   anki-xml import <file.xml> [--url http://127.0.0.1:8765] [--dry-run]
 *   anki-xml --version | --help
 *
 * Exit codes:
 *
 *   0  success — every valid note was created
 *   1  validation or import errors (one or more notes failed)
 *   2  fatal — could not read file / parse XML / reach AnkiConnect
 */

import { importFromFile } from "./import.ts";

const VERSION = "0.1.0";

function printHelp(): void {
  console.log(`anki-xml v${VERSION}

Import AI-authored XML flashcards into Anki via AnkiConnect.

Usage:
  anki-xml import <file> [options]
  anki-xml --help
  anki-xml --version

Options:
  --url <url>    AnkiConnect endpoint (default http://127.0.0.1:8765)
  --dry-run      Validate and report; do not contact AnkiConnect
  --help, -h     Show this help
  --version, -v  Print the version

Examples:
  anki-xml import ./cards.xml
  anki-xml import ./cards.xml --url http://localhost:8765
  anki-xml import ./cards.xml --dry-run`);
}

interface ParsedArgs {
  command: string | null;
  positional: string[];
  url: string;
  dryRun: boolean;
  showHelp: boolean;
  showVersion: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {
    command: null,
    positional: [],
    url: "http://127.0.0.1:8765",
    dryRun: false,
    showHelp: false,
    showVersion: false,
  };

  let i = 0;
  while (i < argv.length) {
    const a = argv[i]!;
    if (a === "--help" || a === "-h") {
      args.showHelp = true;
      i++;
      continue;
    }
    if (a === "--version" || a === "-v") {
      args.showVersion = true;
      i++;
      continue;
    }
    if (a === "--dry-run") {
      args.dryRun = true;
      i++;
      continue;
    }
    if (a === "--url") {
      const next = argv[i + 1];
      if (!next) throw new CliError("--url requires a value");
      args.url = next;
      i += 2;
      continue;
    }
    if (a.startsWith("--")) {
      throw new CliError(`Unknown option: ${a}`);
    }
    if (args.command === null) {
      args.command = a;
    } else {
      args.positional.push(a);
    }
    i++;
  }
  return args;
}

export class CliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliError";
  }
}

async function runImport(args: ParsedArgs): Promise<number> {
  const file = args.positional[0];
  if (!file) {
    console.error("error: missing <file> argument");
    console.error("Run 'anki-xml import --help' for usage.");
    return 2;
  }

  console.log(`Reading ${file} ...`);

  let outcome;
  try {
    outcome = await importFromFile({
      inputPath: file,
      ankiConnectUrl: args.url,
    });
  } catch (err) {
    if (err instanceof CliError) {
      console.error(`error: ${err.message}`);
      return 2;
    }
    console.error(`fatal: ${(err as Error).message}`);
    return 2;
  }

  // Validation errors first — these are problems the user must fix.
  if (outcome.validationErrors.length > 0) {
    console.error("");
    console.error("Validation errors:");
    for (const e of outcome.validationErrors) {
      const where = e.noteNumber === 0 ? "<anki>" : `Note ${e.noteNumber}`;
      console.error(`  ${where}: ${e.message}`);
    }
    console.error("");
    console.error("Aborting: no notes were sent to AnkiConnect.");
    return 1;
  }

  // Dry-run stops after validation.
  if (args.dryRun) {
    console.log("Dry run: validation passed, AnkiConnect was not contacted.");
    console.log(`Would have created ${outcome.result.created} notes.`);
    return 0;
  }

  // Successful path.
  const { created, failed } = outcome.result;
  console.log("");
  console.log(`Created: ${created}`);
  if (failed.length > 0) {
    console.log(`Failed:  ${failed.length}`);
    for (const f of failed) {
      console.log(`  Note ${f.noteNumber}: ${f.reason}`);
    }
    return 1;
  }
  console.log("All notes created successfully.");
  return 0;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  let args: ParsedArgs;
  try {
    args = parseArgs(argv);
  } catch (err) {
    console.error(`error: ${(err as Error).message}`);
    return 2;
  }

  if (args.showHelp) {
    printHelp();
    return 0;
  }
  if (args.showVersion) {
    console.log(`anki-xml v${VERSION}`);
    return 0;
  }
  if (args.command === null) {
    printHelp();
    return 0;
  }
  if (args.command !== "import") {
    console.error(`error: unknown command '${args.command}'`);
    console.error("Run 'anki-xml --help' for usage.");
    return 2;
  }

  return await runImport(args);
}

await main();