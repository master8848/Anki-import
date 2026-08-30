import { runInit } from "@anki-xml/core";
import type { GlobalFlags } from "../args.ts";
import { flagBool, flagNumber, flagString } from "../args.ts";
import type { Logger } from "@anki-xml/logger";

/**
 * Thin wrapper — business logic lives in core/init.ts
 */
export async function runInitCommand(
  flags: GlobalFlags,
  rest: Record<string, string | boolean>,
  log: Logger,
): Promise<number> {
  const skipAnkiInstall = flagBool(rest, "skip-anki-install") || flagBool(rest, "addon-only");
  const updateAnki = flagBool(rest, "update-anki");
  const force = flagBool(rest, "force");
  const yes = flagBool(rest, "yes");
  const check = flagBool(rest, "check");
  const timeoutRaw = flagString(rest, "timeout");
  let timeout: number | undefined;
  if (timeoutRaw !== undefined) {
    const n = Number(timeoutRaw);
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error("--timeout must be a positive number");
    }
    timeout = n;
  }
  // also support --timeout passed as rest boolean? flagNumber helper
  if (timeout === undefined && typeof rest["timeout"] === "string") {
    timeout = Number(rest["timeout"]);
  }

  // url already in GlobalFlags, but allow --url override via rest? parseArgs handles it
  const url = flags.url;

  // flagNumber for timeout fallback
  if (timeout === undefined) {
    try {
      timeout = flagNumber(rest, "timeout", 60000);
      // flagNumber returns fallback if not present, but we need to distinguish missing vs default
      // if rest has no timeout, it'll return 60000 which is correct default
    } catch (e) {
      throw e;
    }
    // If timeout is default and rest doesn't have timeout, keep 60000
    if (!flagString(rest, "timeout") && timeout === 60000) {
      timeout = 60000;
    }
  }

  return runInit(
    {
      url,
      timeout,
      skipAnkiInstall,
      updateAnki,
      force,
      yes,
      check,
      json: flags.json,
    },
    log,
  );
}
