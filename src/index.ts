#!/usr/bin/env bun
/**
 * anki-xml CLI entry point.
 *
 * This file is intentionally thin. The command implementations live in
 * `src/cli/commands/`, the argument parser in `src/cli/args.ts`, the
 * output helpers in `src/cli/output.ts`, and the command registry in
 * `src/cli/registry.ts`.
 *
 * `main()` returns an exit code (0, 1, or 2). `await main()` does not
 * propagate the exit code on Bun (the process exits 0 regardless), so
 * we use an explicit `process.exit()` when this module is the entry
 * point. When imported by tests, `import.meta.main` is false and we
 * skip the exit so the test process survives.
 */

import { main } from "./cli/run.ts";

export { CliError, parseArgs } from "./cli/args.ts";
export type { ParsedArgs } from "./cli/args.ts";

if (import.meta.main) {
  process.exit(await main());
}
