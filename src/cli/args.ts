/**
 * CLI argument parser.
 *
 * Recognizes the global flags (`--help`, `--version`, `--url`, `--dry-run`,
 * `--json`, `--auto-create-deck`, `--no-auto-create-deck`) up front so typos
 * fail fast. Anything that starts with `--` and is *not* in the subcommand-flag
 * whitelist is rejected as unknown.
 *
 * Subcommand-specific flags are passed through to `args.rest` for the
 * individual command to parse.
 */

export interface ParsedArgs {
  command: string | null;
  positional: string[];
  url: string;
  dryRun: boolean;
  json: boolean;
  /**
   * 0 = legacy shape (raw payload), 1 = envelope shape. Default 1.
   * Set to 0 with `--json-legacy` for one release cycle to keep
   * existing `jq` pipelines working.
   */
  jsonVersion: 0 | 1;
  /** null = flag was not passed; true/false = explicit. */
  autoCreateDeck: boolean | null;
  showHelp: boolean;
  showVersion: boolean;
  /** Strip ANSI color codes from output. Defaults to false. */
  noColor: boolean;
  /** Emit summary-only output. Defaults to false. */
  quiet: boolean;
  /** Output format hint: "ndjson" streams one JSON record per line. */
  format: "default" | "ndjson";
  /** Multi-collection profile name. */
  profile: string | null;
  /** Idempotency key (M10). */
  idempotencyKey: string | null;
  /** Batch id (M9). Triggers an auto-checkpoint before the write. */
  batchId: string | null;
  /** Rollback automatically when a partial failure occurs (M9). */
  rollbackOnPartial: boolean;
  /** Explicit config file path (M14). */
  configPath: string | null;
  /** Loose bag of subcommand-specific flags. Parsed by each command. */
  rest: string[];
}

export class CliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliError";
  }
}

/** Flags that can appear after the subcommand, parsed by each command. */
export const SUBCOMMAND_FLAGS = new Set([
  "--deck",
  "--tag",
  "--limit",
  "--query",
  "--id",
  "--ids",
  "--file",
  "--field",
  "--tags",
  "--shell",
  "--strict",
  "--allow-duplicate",
  "--no-preflight",
  "--out",
  "--with-ids",
  "--cards-too",
  "--yes",
]);

/** Flags that take no value (booleans). */
export const BOOLEAN_FLAGS = new Set([
  "--strict",
  "--allow-duplicate",
  "--no-preflight",
  "--with-ids",
  "--cards-too",
  "--yes",
]);

export function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {
    command: null,
    positional: [],
    url: "http://127.0.0.1:8765",
    dryRun: false,
    json: false,
    jsonVersion: 1,
    autoCreateDeck: null,
    showHelp: false,
    showVersion: false,
    noColor: false,
    quiet: false,
    format: "default",
    profile: null,
    idempotencyKey: null,
    batchId: null,
    rollbackOnPartial: false,
    configPath: null,
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
    if (a === "--json-legacy") {
      args.json = true;
      args.jsonVersion = 0;
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
    if (a === "--no-color" || a === "--no-colour") {
      args.noColor = true;
      i++;
      continue;
    }
    if (a === "--quiet") {
      args.quiet = true;
      i++;
      continue;
    }
    if (a === "--format") {
      const next = argv[i + 1];
      if (!next) throw new CliError("--format requires a value");
      if (next !== "ndjson" && next !== "default") {
        throw new CliError(`--format must be 'ndjson' or 'default' (got '${next}')`);
      }
      args.format = next;
      i += 2;
      continue;
    }
    if (a === "--profile") {
      const next = argv[i + 1];
      if (!next) throw new CliError("--profile requires a value");
      args.profile = next;
      i += 2;
      continue;
    }
    if (a === "--idempotency-key") {
      const next = argv[i + 1];
      if (!next) throw new CliError("--idempotency-key requires a value");
      args.idempotencyKey = next;
      i += 2;
      continue;
    }
    if (a === "--batch-id") {
      const next = argv[i + 1];
      if (!next) throw new CliError("--batch-id requires a value");
      args.batchId = next;
      i += 2;
      continue;
    }
    if (a === "--rollback-on-partial") {
      args.rollbackOnPartial = true;
      continue;
    }
    if (a === "--config") {
      const next = argv[i + 1];
      if (!next) throw new CliError("--config requires a value");
      args.configPath = next;
      i += 2;
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
      if (!SUBCOMMAND_FLAGS.has(a)) {
        throw new CliError(`Unknown option: ${a}`);
      }
      args.rest.push(a);
      i++;
      if (BOOLEAN_FLAGS.has(a)) continue;
      // Only consume the next arg as a value if it doesn't look like a flag.
      // This lets `--tag a --tag b` work correctly (the second `--tag` is
      // not swallowed as the value of the first).
      const next = argv[i];
      if (next !== undefined && !next.startsWith("--")) {
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
