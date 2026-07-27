/**
 * anki-xml CLI entry point.
 *
 * This file is intentionally thin. The command implementations live in
 * `src/cli/commands/`, the argument parser in `src/cli/args.ts`, the
 * output helpers in `src/cli/output.ts`, and the command registry in
 * `src/cli/registry.ts`.
 *
 * `main()` returns an exit code (0, 1, or 2). When this module is the
 * entry point, we call `process.exit()` directly. When imported by
 * tests, `import.meta.main` is false and we skip the exit so the test
 * process survives.
 *
 * The IIFE-style entry avoids top-level await so the same source can
 * be bundled for both Bun (ESM, top-level await) and Node (CJS, no
 * top-level await) targets.
 */

import { main } from "./cli/run.ts";

export { CliError, parseArgs } from "./cli/args.ts";
export type { ParsedArgs } from "./cli/args.ts";

if (import.meta.main) {
  (async () => {
    process.exit(await main());
  })();
}
