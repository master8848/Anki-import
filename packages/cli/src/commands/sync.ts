import { syncFile, syncStatus } from "@anki-xml/core";
import { formatValidationError } from "@anki-xml/validation";
import { flagBool, flagNumber, flagString, type ParsedArgs } from "../args.ts";
import type { Logger } from "@anki-xml/logger";

export async function runSyncCommand(
  file: string | undefined,
  args: ParsedArgs,
  log: Logger,
): Promise<number> {
  const flags = args.flags;

  if (!file) {
    const status = await syncStatus({
      checkpointId: flagString(args.rest, "checkpoint"),
      url: flags.url,
    });
    if (!status.checkpoint) {
      if (flags.json) console.log(JSON.stringify({ ok: true, checkpoint: null, drift: [] }));
      else log.info("No checkpoint found. Import something first, then run 'sync' to reconcile.");
      return 0;
    }
    if (flags.json) {
      console.log(
        JSON.stringify({
          ok: true,
          checkpoint: status.checkpoint,
          drift: status.drift,
          missing: status.drift.filter((d) => !d.exists).length,
        }),
      );
    } else {
      const missing = status.drift.filter((d) => !d.exists);
      log.info(
        `Checkpoint ${status.checkpoint.id}: ${status.drift.length} notes tracked, ${missing.length} missing from collection`,
      );
      if (missing.length > 0) {
        log.info(`Missing note ids: ${missing.map((d) => d.id).join(", ")}`);
        log.info(`Re-import or 'sync <file>' to restore them.`);
      }
    }
    return 0;
  }

  const result = await syncFile(file, {
    url: flags.url,
    dryRun: flags.dryRun,
    stream: flagBool(args.rest, "stream"),
    batchSize: flagNumber(args.rest, "batch-size", 500),
    autoCreateDeck: !flagBool(args.rest, "no-auto-create-deck"),
    allowDuplicate: flagBool(args.rest, "allow-duplicate"),
    checkpointId: flagString(args.rest, "checkpoint"),
    deck: flagString(args.rest, "deck"),
    model: flagString(args.rest, "model"),
    logger: log,
  });

  if (result.errors.length > 0) {
    if (flags.json) {
      console.log(
        JSON.stringify({
          ok: false,
          error: { code: "VALIDATION_ERROR", errors: result.errors },
          warnings: result.warnings,
        }),
      );
    } else {
      for (const e of result.errors) log.error(formatValidationError(e));
    }
    return 1;
  }

  if (flags.json) {
    console.log(
      JSON.stringify({
        ok: true,
        dryRun: flags.dryRun,
        plan: {
          add: result.plan.add.length,
          update: result.plan.update.length,
          duplicates: result.plan.duplicates.length,
          unchanged: result.plan.unchanged,
        },
        applied: flags.dryRun ? undefined : result.applied,
      }),
    );
  } else if (flags.dryRun) {
    log.info(
      `Dry run: ${result.plan.add.length} to add, ${result.plan.update.length} to update, ${result.plan.duplicates.length} duplicate, ${result.plan.unchanged} unchanged`,
    );
  } else {
    log.info(
      `Synced: ${result.applied.created} created, ${result.applied.updated} updated, ${result.applied.failed.length} failed.`,
    );
  }

  return 0;
}
