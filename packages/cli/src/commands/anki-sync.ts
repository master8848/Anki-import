import { runAnkiSync } from "@anki-xml/core";
import { flagBool, type ParsedArgs } from "../args.ts";
import type { GlobalFlags } from "../args.ts";
import type { Logger } from "@anki-xml/logger";

export async function runAnkiSyncCommand(
  args: ParsedArgs,
  flags: GlobalFlags,
  log: Logger,
): Promise<number> {
  const checkOnly = flagBool(args.rest, "check");

  const result = await runAnkiSync({ url: flags.url, checkOnly });

  if (flags.json) {
    console.log(
      JSON.stringify({
        ok: result.ok,
        reachable: result.reachable,
        authenticated: result.authenticated,
        synced: result.synced,
        url: result.url,
        cause: result.cause,
        detail: result.detail,
        hints: result.hints,
        suggestion: result.suggestion,
      }),
    );
    return result.ok ? 0 : 1;
  }

  if (!result.reachable) {
    log.error(result.detail);
    for (const h of result.hints) log.info(`  ${h}`);
    if (result.suggestion) log.info(`Suggestion: ${result.suggestion}`);
    return 1;
  }

  if (!result.authenticated) {
    log.error("Not authenticated — Anki is not logged into AnkiWeb.");
    log.info(result.detail);
    for (const h of result.hints) log.info(`  ${h}`);
    if (result.suggestion) log.info(`Suggestion: ${result.suggestion}`);
    return 1;
  }

  if (!result.synced) {
    log.error(result.detail);
    for (const h of result.hints) log.info(`  ${h}`);
    return 1;
  }

  log.info(result.detail);
  if (checkOnly) {
    log.info("Check passed — run without --check to trigger AnkiWeb sync.");
  } else {
    log.info("Tip: open Anki on your phone and press Sync to pull the cards.");
  }
  return 0;
}
