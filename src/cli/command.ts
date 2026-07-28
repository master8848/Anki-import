/**
 * Command contract.
 *
 * Each command module exports a `Command<SubArgs>` object that describes
 * its name, what it does, which subcommand flags it accepts, and how to
 * run.
 *
 * `parseSubArgs` is optional; commands that don't take any subcommand
 * flags can omit it. The `SubArgs` type parameter lets the compiler
 * track the shape of the parsed arguments through the call site.
 *
 * Keeping this contract thin and data-driven is what enables the
 * registry to dispatch without a giant switch statement and makes it
 * trivial to surface commands in `--help`, shell completion, and the
 * AI agent's introspection layer.
 */

import type { ParsedArgs } from "./args.ts";

export interface Command<T = unknown> {
  /** The subcommand name, e.g. "import". */
  name: string;
  /** One-line description, shown in `--help` and completion scripts. */
  description: string;
  /** Subcommand-specific flags, shown in `--help` and completion. */
  flags?: Record<string, string>;
  /** Optional sub-argument parser. Throws CliError on bad input. */
  parseSubArgs?(positional: string[], rest: string[]): T;
  /** Main command body. Returns an exit code (0, 1, or 2). */
  run(args: ParsedArgs, subArgs: T): Promise<number>;
}
