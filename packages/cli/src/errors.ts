/**
 * CLI-side rendering of AnkiConnect errors — humans get fix steps,
 * AI agents get stable codes + hints in JSON.
 */

import { AnkiConnectError } from "@anki-xml/anki";
import type { Logger } from "@anki-xml/logger";
import type { GlobalFlags } from "./args.ts";

export function printAnkiConnectError(
  err: AnkiConnectError,
  flags: GlobalFlags,
  log: Logger,
): number {
  if (flags.json) {
    console.log(
      JSON.stringify({
        ok: false,
        error: {
          code: "ANKICONNECT_ERROR",
          message: err.message,
          cause: err.cause,
          hints: err.hints ?? [],
          suggestion: err.suggestion,
        },
      }),
    );
  } else {
    log.error(err.message);
    if (err.hints && err.hints.length > 0) {
      log.error("Fix:");
      for (const h of err.hints) log.error(`  ${h}`);
    }
    if (err.suggestion) log.error(`Run: ${err.suggestion}`);
  }
  return 2;
}
