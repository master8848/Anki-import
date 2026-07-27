/**
 * Top-level CLI dispatcher.
 *
 * `main()` returns an exit code (0, 1, or 2). The CLI entry point in
 * `src/index.ts` is responsible for actually calling `process.exit()`.
 *
 * Errors during CLI parsing are surfaced as exit code 2 with a single
 * `error: <msg>` line. Errors during command execution are handled
 * inside each command (via `withFatal`) so they end up as exit code 2
 * with `fatal: <msg>`.
 */

import { CliError, parseArgs, type ParsedArgs } from "./args.ts";
import { findCommand } from "./registry.ts";
import { printHelp, printCommandHelp, VERSION } from "./help.ts";
import { mergeConfigInto, resolveConfig } from "../config.ts";

export async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  let args: ParsedArgs;
  try {
    args = parseArgs(argv);
  } catch (err) {
    if (err instanceof CliError) {
      console.error(`error: ${err.message}`);
      return 2;
    }
    throw err;
  }

  // Load and merge config (M14). Flags on the command line always
  // override the config; the config only fills in defaults.
  try {
    const { config } = await resolveConfig(args.configPath ?? undefined);
    mergeConfigInto(config, {
      url: args.url,
      profile: args.profile,
      format: args.format,
      dryRun: args.dryRun,
      noColor: args.noColor,
      quiet: args.quiet,
    });
  } catch (err) {
    if (err instanceof CliError) {
      console.error(`error: ${err.message}`);
      return 2;
    }
    throw err;
  }

  if (args.showHelp) {
    // Per-command help: `anki-xml import --help` shows import's flags.
    if (args.command) {
      if (printCommandHelp(args.command)) return 0;
      console.error(`error: unknown command '${args.command}'`);
      return 2;
    }
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

  const cmd = findCommand(args.command);
  if (!cmd) {
    console.error(`error: unknown command '${args.command}'`);
    console.error("Run 'anki-xml --help' for usage.");
    return 2;
  }

  let subArgs: unknown;
  if (cmd.parseSubArgs) {
    try {
      subArgs = cmd.parseSubArgs(args.positional, args.rest);
    } catch (err) {
      if (err instanceof CliError) {
        console.error(`error: ${err.message}`);
        return 2;
      }
      throw err;
    }
  }

  return cmd.run(args, subArgs);
}

// Re-export for tests / external consumers.
export { CliError, parseArgs } from "./args.ts";
export type { ParsedArgs } from "./args.ts";
