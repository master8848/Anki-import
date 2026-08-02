export class CliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliError";
  }
}

export interface GlobalFlags {
  url: string;
  json: boolean;
  quiet: boolean;
  verbose: boolean;
  debug: boolean;
  dryRun: boolean;
  help: boolean;
  version: boolean;
}

export interface ParsedArgs {
  command: string | null;
  positional: string[];
  flags: GlobalFlags;
  rest: Record<string, string | boolean>;
}

const GLOBAL_BOOL = new Set([
  "json",
  "quiet",
  "verbose",
  "debug",
  "dry-run",
  "help",
  "version",
  "stream",
  "allow-duplicate",
  "no-auto-create-deck",
  "keep-checkpoint",
  "yes",
]);

const GLOBAL_VALUE = new Set([
  "url",
  "batch-size",
  "checkpoint",
  "note-ids",
  "deck",
  "model",
  "query",
  "as",
  "out",
]);

export function parseArgs(argv: string[]): ParsedArgs {
  const flags: GlobalFlags = {
    url: "http://127.0.0.1:8765",
    json: false,
    quiet: false,
    verbose: false,
    debug: false,
    dryRun: false,
    help: false,
    version: false,
  };
  const rest: Record<string, string | boolean> = {};
  const positional: string[] = [];
  let command: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;

    if (arg === "-h" || arg === "--help") {
      flags.help = true;
      continue;
    }
    if (arg === "-V" || arg === "--version") {
      flags.version = true;
      continue;
    }

    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      let key: string;
      let val: string | undefined;
      if (eq !== -1) {
        key = arg.slice(2, eq);
        val = arg.slice(eq + 1);
      } else {
        key = arg.slice(2);
      }

      if (key === "dry-run") {
        flags.dryRun = true;
        continue;
      }
      if (GLOBAL_BOOL.has(key) && val === undefined) {
        if (key === "json") flags.json = true;
        else if (key === "quiet") flags.quiet = true;
        else if (key === "verbose") flags.verbose = true;
        else if (key === "debug") flags.debug = true;
        else rest[key] = true;
        continue;
      }

      if (val === undefined) {
        const next = argv[i + 1];
        if (!next || next.startsWith("-")) {
          throw new CliError(`Flag --${key} requires a value`);
        }
        val = next;
        i++;
      }

      if (key === "url") flags.url = val;
      else if (GLOBAL_VALUE.has(key) || GLOBAL_BOOL.has(key)) rest[key] = val;
      else throw new CliError(`Unknown flag --${key}`);
      continue;
    }

    if (command === null) {
      command = arg;
    } else {
      positional.push(arg);
    }
  }

  return { command, positional, flags, rest };
}

export function flagString(rest: Record<string, string | boolean>, key: string): string | undefined {
  const v = rest[key];
  return typeof v === "string" ? v : undefined;
}

export function flagBool(rest: Record<string, string | boolean>, key: string): boolean {
  return rest[key] === true || rest[key] === "true";
}

export function flagNumber(
  rest: Record<string, string | boolean>,
  key: string,
  fallback: number,
): number {
  const v = rest[key];
  if (typeof v !== "string") return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) throw new CliError(`--${key} must be a positive number`);
  return n;
}
