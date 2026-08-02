import { planFile } from "@anki-xml/core";
import { formatValidationError } from "@anki-xml/validation";
import { flagBool, flagNumber, flagString, type ParsedArgs } from "../args.ts";
import type { Logger } from "@anki-xml/logger";

export async function runPlanCommand(
  file: string,
  args: ParsedArgs,
  log: Logger,
): Promise<number> {
  const flags = args.flags;
  const planned = await planFile(file, {
    url: flags.url,
    stream: flagBool(args.rest, "stream"),
    batchSize: flagNumber(args.rest, "batch-size", 500),
    allowDuplicate: flagBool(args.rest, "allow-duplicate"),
    deck: flagString(args.rest, "deck"),
    model: flagString(args.rest, "model"),
    logger: log,
  });

  if (planned.errors.length > 0) {
    if (flags.json) {
      console.log(
        JSON.stringify({
          ok: false,
          error: { code: "VALIDATION_ERROR", errors: planned.errors },
          warnings: planned.warnings,
        }),
      );
    } else {
      for (const e of planned.errors) log.error(formatValidationError(e));
    }
    return 1;
  }

  const plan = planned.plan;
  if (flags.json) {
    console.log(
      JSON.stringify({
        ok: true,
        add: plan.add.map((n) => ({ number: n.number, deck: n.deckName, model: n.modelName, fields: n.fields })),
        update: plan.update.map((u) => ({
          id: u.id,
          number: u.note.number,
          changedFields: u.changedFields,
        })),
        remove: plan.remove,
        duplicates: plan.duplicates.map((n) => ({ number: n.number, deck: n.deckName })),
        unchanged: plan.unchanged,
      }),
    );
  } else {
    for (const n of plan.add) {
      log.info(`+ add note ${n.number} (${n.deckName} / ${n.modelName})`);
    }
    for (const u of plan.update) {
      const fields = u.changedFields.length > 0 ? `: ${u.changedFields.join(", ")}` : "";
      log.info(`~ update note ${u.id}${fields}`);
    }
    for (const d of plan.duplicates) {
      log.info(`= duplicate note ${d.number} (${d.deckName})`);
    }
    log.info(
      `Plan: ${plan.add.length} add, ${plan.update.length} update, ${plan.duplicates.length} duplicate, ${plan.unchanged} unchanged`,
    );
  }

  return 0;
}
