import { rollback } from "@anki-xml/rollback";
import { AnkiConnectError } from "@anki-xml/anki";
import { flagBool, type GlobalFlags } from "../args.ts";
import { printAnkiConnectError } from "../errors.ts";
import type { Logger } from "@anki-xml/logger";

export async function runRollbackCommand(
  checkpointId: string,
  rest: Record<string, string | boolean>,
  flags: GlobalFlags,
  log: Logger,
): Promise<number> {
  try {
    const result = await rollback({
      checkpointId,
      url: flags.url,
      dryRun: flags.dryRun,
      keepCheckpoint: flagBool(rest, "keep-checkpoint"),
    });

    if (flags.json) {
      console.log(JSON.stringify(result));
    } else if (result.dryRun) {
      log.info(`Dry run: would delete ${result.deleted} notes from ${result.checkpoint.id}`);
    } else {
      log.info(`Rolled back ${result.deleted} notes from ${result.checkpoint.id}`);
    }
    return 0;
  } catch (err) {
    if (err instanceof AnkiConnectError) {
      return printAnkiConnectError(err, flags, log);
    }
    log.error((err as Error).message);
    return 1;
  }
}
