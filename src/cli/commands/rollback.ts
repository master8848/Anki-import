import { rollback } from "../../core/rollback/rollback.ts";
import { AnkiConnectError } from "../../anki/ankiconnect.ts";
import { flagBool, type GlobalFlags } from "../args.ts";
import type { Logger } from "../../utils/logger.ts";

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
      log.error(err.message);
      return 2;
    }
    log.error((err as Error).message);
    return 1;
  }
}
