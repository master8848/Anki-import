import { diffFile } from "@anki-xml/core";
import { formatValidationError } from "@anki-xml/validation";
import { flagBool, flagNumber, flagString, type ParsedArgs } from "../args.ts";
import type { Logger } from "@anki-xml/logger";

export async function runDiffCommand(
  file: string,
  args: ParsedArgs,
  log: Logger,
): Promise<number> {
  const flags = args.flags;
  const result = await diffFile(file, {
    url: flags.url,
    stream: flagBool(args.rest, "stream"),
    batchSize: flagNumber(args.rest, "batch-size", 500),
    allowDuplicate: flagBool(args.rest, "allow-duplicate"),
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
    console.log(JSON.stringify({ ok: true, notes: result.noteDiffs, decks: result.deckDiff }));
  } else {
    for (const d of result.noteDiffs) {
      if (d.kind === "added") {
        log.info(`+ note ${d.noteNumber}: added`);
        continue;
      }
      if (d.kind === "removed") {
        log.info(`- note ${d.id ?? d.noteNumber}: removed`);
        continue;
      }
      if (d.kind === "unchanged") {
        log.info(`= note ${d.id ?? d.noteNumber}: unchanged`);
        continue;
      }
      log.info(`~ note ${d.id ?? d.noteNumber}:`);
      for (const c of d.changes) {
        log.info(`    ${c.field}: ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`);
      }
      if (d.deckChanged) {
        log.info(`    deck: ${JSON.stringify(d.deckChanged.from)} → ${JSON.stringify(d.deckChanged.to)}`);
      }
      if (d.modelChanged) {
        log.info(`    model: ${JSON.stringify(d.modelChanged.from)} → ${JSON.stringify(d.modelChanged.to)}`);
      }
      if (d.tagsChanged && (d.tagsChanged.added.length > 0 || d.tagsChanged.removed.length > 0)) {
        log.info(
          `    tags: +${d.tagsChanged.added.join(",")} -${d.tagsChanged.removed.join(",")}`,
        );
      }
    }
    for (const m of result.deckDiff.missing) log.info(`deck missing in collection: ${m}`);
    for (const e of result.deckDiff.extra) log.info(`deck extra in collection: ${e}`);
    log.info(`Diff: ${result.noteDiffs.filter((d) => d.kind !== "unchanged").length} changed`);
  }

  return 0;
}
