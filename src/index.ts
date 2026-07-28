#!/usr/bin/env bun
/**
 * anki-xml CLI entrypoint.
 *
 * Usage:
 *
 *   anki-xml import <file.xml> [options]
 *   anki-xml decks [--json]
 *   anki-xml stats [--deck NAME] [--json]
 *   anki-xml search "phrase" [--deck D] [--tag T] [--limit N] [--query Q] [--json]
 *   anki-xml update (--id N | --ids "1,2,3" | --file f.xml) [options]
 *   anki-xml --version | --help
 *
 * Exit codes:
 *
 *   0  success — every requested operation succeeded
 *   1  partial failure (some notes updated/rejected, some succeeded)
 *   2  fatal — could not read file / parse XML / reach AnkiConnect
 */

import { importFromFile } from "./import.ts";
import { fetchDeckReport, renderDeckTree } from "./decks.ts";
import { fetchStats, renderStats } from "./stats.ts";
import { runSearch, renderSearch } from "./search.ts";
import { loadUpdatesFromXml, runUpdate, renderUpdate, type FieldUpdate, type UpdateEntry } from "./update.ts";

const VERSION = "0.1.0";

function printHelp(): void {
  console.log(`anki-xml v${VERSION}

Import, query, and update Anki flashcards via AnkiConnect.

Usage:
  anki-xml import <file> [options]
  anki-xml decks [--json]
  anki-xml stats [--deck NAME] [--json]
  anki-xml search <phrase> [--deck D] [--tag T] [--limit N] [--query Q] [--json]
  anki-xml update (--id N | --ids "1,2,3" | --file f.xml) [--field Name=value ...] [--dry-run]
  anki-xml --help | --version

Common options:
  --url <url>               AnkiConnect endpoint (default http://127.0.0.1:8765)
  --json                    Emit machine-readable JSON instead of text
  --dry-run                 Validate and report; do not contact AnkiConnect
  --help, -h                Show this help
  --version, -v             Print the version

Examples:
  anki-xml import ./cards.xml
  anki-xml decks
  anki-xml stats --deck "Spanish"
  anki-xml search "serendipity" --deck "English"
  anki-xml update --id 1234567890 --field Front="new Q" --field Back="new A"
  anki-xml update --file ./updates.xml --dry-run`);
}

interface ParsedArgs {
  command: string | null;
  positional: string[];
  url: string;
  dryRun: boolean;
  json: boolean;
  /** null = flag was not passed; true/false = explicit. */
  autoCreateDeck: boolean | null;
  showHelp: boolean;
  showVersion: boolean;
  /** Loose bag of subcommand-specific flags. Parsed by each command. */
  rest: string[];
}

export function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {
    command: null,
    positional: [],
    url: "http://127.0.0.1:8765",
    dryRun: false,
    json: false,
    autoCreateDeck: null,
    showHelp: false,
    showVersion: false,
    rest: [],
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
    if (a === "--json") {
      args.json = true;
      i++;
      continue;
    }
    if (a === "--auto-create-deck") {
      args.autoCreateDeck = true;
      i++;
      continue;
    }
    if (a === "--no-auto-create-deck") {
      args.autoCreateDeck = false;
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
      // Only these flags belong to subcommands; every other unknown
      // option is rejected up front so typos fail fast.
      const subcommandFlags = new Set([
        "--deck", "--tag", "--limit", "--query",
        "--id", "--ids", "--file", "--field",
      ]);
      if (!subcommandFlags.has(a)) {
        throw new CliError(`Unknown option: ${a}`);
      }
      args.rest.push(a);
      i++;
      const next = argv[i + 1];
      if (next !== undefined) {
        args.rest.push(next);
        i += 1;
      }
      continue;
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

// ─── import ────────────────────────────────────────────────────────────

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
      dryRun: args.dryRun,
      autoCreateDeck: args.autoCreateDeck ?? true,
    });
  } catch (err) {
    console.error(`fatal: ${(err as Error).message}`);
    return 2;
  }

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

  if (args.dryRun) {
    console.log("Dry run: validation passed, AnkiConnect was not contacted.");
    console.log(`Would have created ${outcome.validCount} notes.`);
    return 0;
  }

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

// ─── decks ─────────────────────────────────────────────────────────────

async function runDecks(args: ParsedArgs): Promise<number> {
  try {
    const report = await fetchDeckReport({ ankiConnectUrl: args.url });
    if (args.json) {
      console.log(JSON.stringify(report.flat, null, 2));
    } else {
      const totalDecks = report.flat.length;
      const totalCards = report.flat.reduce((s, d) => s + d.totalCards, 0);
      console.log(`${totalDecks} deck${totalDecks === 1 ? "" : "s"}, ${totalCards} total card${totalCards === 1 ? "" : "s"}`);
      console.log("");
      console.log(renderDeckTree(report.tree));
    }
    return 0;
  } catch (err) {
    console.error(`fatal: ${(err as Error).message}`);
    return 2;
  }
}

// ─── stats ─────────────────────────────────────────────────────────────

interface StatsSubArgs {
  deck?: string;
}

function parseStatsSubArgs(rest: string[]): StatsSubArgs {
  const out: StatsSubArgs = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a === "--deck") {
      const v = rest[i + 1];
      if (v === undefined) throw new CliError("--deck requires a value");
      out.deck = v;
      i++;
    }
  }
  return out;
}

async function runStats(args: ParsedArgs): Promise<number> {
  let sub: StatsSubArgs;
  try {
    sub = parseStatsSubArgs(args.rest);
  } catch (err) {
    console.error(`error: ${(err as Error).message}`);
    return 2;
  }
  try {
    const stats = await fetchStats({ ankiConnectUrl: args.url, deck: sub.deck });
    if (args.json) {
      console.log(JSON.stringify(stats, null, 2));
    } else {
      console.log(renderStats(stats));
    }
    return 0;
  } catch (err) {
    console.error(`fatal: ${(err as Error).message}`);
    return 2;
  }
}

// ─── search ────────────────────────────────────────────────────────────

interface SearchSubArgs {
  query?: string;
  phrase: string;
  deck?: string;
  tags: string[];
  limit: number;
}

function parseSearchSubArgs(positional: string[], rest: string[]): SearchSubArgs {
  const out: SearchSubArgs = {
    phrase: positional.join(" ").trim(),
    tags: [],
    limit: 100,
  };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a === "--query") {
      const v = rest[i + 1];
      if (v === undefined) throw new CliError("--query requires a value");
      out.query = v;
      i++;
    } else if (a === "--deck") {
      const v = rest[i + 1];
      if (v === undefined) throw new CliError("--deck requires a value");
      out.deck = v;
      i++;
    } else if (a === "--tag") {
      const v = rest[i + 1];
      if (v === undefined) throw new CliError("--tag requires a value");
      out.tags.push(v);
      i++;
    } else if (a === "--limit") {
      const v = rest[i + 1];
      if (v === undefined) throw new CliError("--limit requires a value");
      const n = Number(v);
      if (!Number.isFinite(n) || n < 1) throw new CliError("--limit must be a positive integer");
      out.limit = Math.floor(n);
      i++;
    }
  }
  return out;
}

async function runSearch(args: ParsedArgs): Promise<number> {
  let sub: SearchSubArgs;
  try {
    sub = parseSearchSubArgs(args.positional, args.rest);
  } catch (err) {
    console.error(`error: ${(err as Error).message}`);
    return 2;
  }
  if (!sub.phrase && !sub.query) {
    console.error("error: search requires a phrase or --query");
    return 2;
  }
  try {
    const hits = await runSearch({
      ankiConnectUrl: args.url,
      phrase: sub.phrase || undefined,
      query: sub.query,
      deck: sub.deck,
      tags: sub.tags,
      limit: sub.limit,
    });
    if (args.json) {
      console.log(JSON.stringify(hits, null, 2));
    } else {
      console.log(renderSearch(hits));
    }
    return 0;
  } catch (err) {
    console.error(`fatal: ${(err as Error).message}`);
    return 2;
  }
}

// ─── update ────────────────────────────────────────────────────────────

interface UpdateSubArgs {
  id?: number;
  ids?: number[];
  file?: string;
  fields: FieldUpdate[];
}

function parseUpdateSubArgs(positional: string[], rest: string[]): UpdateSubArgs {
  const out: UpdateSubArgs = { fields: [] };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a === "--id") {
      const v = rest[i + 1];
      if (v === undefined) throw new CliError("--id requires a value");
      const n = Number(v);
      if (!Number.isFinite(n) || !Number.isInteger(n)) {
        throw new CliError(`--id must be an integer (got "${v}")`);
      }
      out.id = n;
      i++;
    } else if (a === "--ids") {
      const v = rest[i + 1];
      if (v === undefined) throw new CliError("--ids requires a value");
      const parts = v.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
      const nums = parts.map((p) => {
        const n = Number(p);
        if (!Number.isFinite(n) || !Number.isInteger(n)) {
          throw new CliError(`--ids contains non-integer value "${p}"`);
        }
        return n;
      });
      out.ids = nums;
      i++;
    } else if (a === "--file") {
      const v = rest[i + 1];
      if (v === undefined) throw new CliError("--file requires a value");
      out.file = v;
      i++;
    } else if (a === "--field") {
      const v = rest[i + 1];
      if (v === undefined) throw new CliError("--field requires a value");
      const eq = v.indexOf("=");
      if (eq < 0) {
        throw new CliError(`--field expects Name=value (got "${v}")`);
      }
      const name = v.slice(0, eq).trim();
      const value = v.slice(eq + 1);
      if (!name) throw new CliError(`--field name cannot be empty (got "${v}")`);
      out.fields.push({ name, value });
      i++;
    }
  }
  // Positional: a lone integer is treated as --id.
  if (out.id === undefined && positional.length > 0) {
    const n = Number(positional[0]);
    if (Number.isFinite(n) && Number.isInteger(n)) {
      out.id = n;
    }
  }
  return out;
}

async function runUpdateCmd(args: ParsedArgs): Promise<number> {
  let sub: UpdateSubArgs;
  try {
    sub = parseUpdateSubArgs(args.positional, args.rest);
  } catch (err) {
    console.error(`error: ${(err as Error).message}`);
    return 2;
  }

  const entries: UpdateEntry[] = [];

  // Case 1: --id N + --field flags
  if (sub.id !== undefined) {
    if (sub.fields.length === 0) {
      console.error("error: --id requires at least one --field Name=value");
      return 2;
    }
    entries.push({ noteId: sub.id, fields: sub.fields });
  }

  // Case 2: --ids "1,2,3" + --file updates.xml  (positional mapping)
  if (sub.ids && sub.file) {
    const fileEntries = await loadUpdatesFromXml(sub.file);
    if (fileEntries.length !== sub.ids.length) {
      console.error(
        `error: --ids has ${sub.ids.length} entries but ${sub.file} has ${fileEntries.length} <note> elements`,
      );
      return 2;
    }
    for (let i = 0; i < sub.ids.length; i++) {
      entries.push({
        noteId: sub.ids[i]!,
        fields: fileEntries[i]!.fields,
      });
    }
  } else if (sub.file) {
    // Case 3: --file updates.xml  (each <note> carries its own id="...")
    const fileEntries = await loadUpdatesFromXml(sub.file);
    for (const e of fileEntries) entries.push(e);
  } else if (sub.ids) {
    console.error("error: --ids requires --file <updates.xml>");
    return 2;
  }

  if (entries.length === 0) {
    console.error("error: update needs --id N, --ids ..., or --file <updates.xml>");
    return 2;
  }

  if (args.dryRun) {
    console.log(`Dry run: would update ${entries.length} note(s).`);
    for (const e of entries) {
      const fields = e.fields.map((f) => f.name).join(", ");
      console.log(`  Note ${e.noteId}: ${fields}`);
    }
    return 0;
  }

  try {
    const result = await runUpdate({
      ankiConnectUrl: args.url,
      entries,
      dryRun: false,
    });
    console.log(renderUpdate(result));
    return result.failed.length === 0 ? 0 : 1;
  } catch (err) {
    console.error(`fatal: ${(err as Error).message}`);
    return 2;
  }
}

// ─── main ──────────────────────────────────────────────────────────────

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

  switch (args.command) {
    case "import":
      return await runImport(args);
    case "decks":
      return await runDecks(args);
    case "stats":
      return await runStats(args);
    case "search":
      return await runSearch(args);
    case "update":
      return await runUpdateCmd(args);
    default:
      console.error(`error: unknown command '${args.command}'`);
      console.error("Run 'anki-xml --help' for usage.");
      return 2;
  }
}

// `await main()` at top level does NOT propagate the returned exit
// code on Bun (process exits with 0 regardless). Explicit
// `process.exit()` is required, but only when this module is the
// CLI entry point — not when it's imported by tests.
if (import.meta.main) {
  process.exit(await main());
}
