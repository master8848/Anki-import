/**
 * CLI-side rendering of AnkiConnect errors — humans get fix steps,
 * AI agents get stable codes + hints in JSON.
 */

import { ankiConnectErrorData } from "@anki-xml/mcp";
import { AnkiConnectError } from "@anki-xml/anki";
import type { Logger } from "@anki-xml/logger";
import type { GlobalFlags } from "./args.ts";

export function printAnkiConnectError(
  err: AnkiConnectError,
  flags: GlobalFlags,
  log: Logger,
): number {
  if (flags.json) {
    console.log(JSON.stringify({ ok: false, error: ankiConnectErrorData(err) }));
  } else {
    log.error(err.message);
    if (err.hints && err.hints.length > 0) {
      log.error("Try this:");
      for (const h of err.hints) log.error(`  • ${h}`);
    }
    if (err.suggestion) log.error(`Next: ${err.suggestion}`);
  }
  return 2;
}
