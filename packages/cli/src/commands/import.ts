import { importFromFile } from "@anki-xml/core";
import { AnkiConnectError } from "@anki-xml/anki";
import { XmlParseError } from "@anki-xml/parser";
import { fileExistsSync } from "@anki-xml/utils";
import { formatValidationError } from "@anki-xml/validation";
import {
  flagBool,
  flagNumber,
  flagString,
  type ParsedArgs,
} from "../args.ts";
import type { Logger } from "@anki-xml/logger";

export async function runImportCommand(
  file: string,
  args: ParsedArgs,
  log: Logger,
): Promise<number> {
  if (!fileExistsSync(file)) {
    log.error(`File not found: ${file}`);
    return 2;
  }

  const flags = args.flags;
  try {
    const outcome = await importFromFile({
      inputPath: file,
      url: flags.url,
      dryRun: flags.dryRun,
      stream: flagBool(args.rest, "stream"),
      batchSize: flagNumber(args.rest, "batch-size", 500),
      autoCreateDeck: !flagBool(args.rest, "no-auto-create-deck"),
      allowDuplicate: flagBool(args.rest, "allow-duplicate"),
      checkpointId: flagString(args.rest, "checkpoint"),
      logger: log,
    });

    if (outcome.validationErrors.length > 0) {
      if (flags.json) {
        console.log(
          JSON.stringify({
            ok: false,
            error: { code: "VALIDATION_ERROR", errors: outcome.validationErrors },
            warnings: outcome.warnings,
          }),
        );
      } else {
        for (const e of outcome.validationErrors) log.error(formatValidationError(e));
      }
      return 1;
    }

    if (flags.json) {
      console.log(
        JSON.stringify({
          ok: true,
          dryRun: flags.dryRun,
          validCount: outcome.validCount,
          created: outcome.result.created,
          failed: outcome.result.failed,
          noteIds: outcome.result.noteIds,
          checkpointId: outcome.checkpointId,
          warnings: outcome.warnings,
        }),
      );
    } else if (flags.dryRun) {
      log.info(`Dry run: ${outcome.validCount} notes would be imported.`);
    } else if (outcome.result.failed.length > 0) {
      for (const f of outcome.result.failed) {
        log.warn(`Note ${f.noteNumber}: ${f.reason}`);
      }
      log.info(`Imported ${outcome.result.created} notes (${outcome.result.failed.length} failed).`);
    }

    return outcome.result.failed.length > 0 ? 1 : 0;
  } catch (err) {
    if (err instanceof XmlParseError) {
      if (flags.json) {
        console.log(
          JSON.stringify({
            ok: false,
            error: { code: "XML_PARSE_ERROR", message: err.message, line: err.line },
          }),
        );
      } else {
        log.error(`XML parse error: ${err.message}`);
      }
      return 1;
    }
    if (err instanceof AnkiConnectError) {
      if (flags.json) {
        console.log(
          JSON.stringify({ ok: false, error: { code: "ANKICONNECT_ERROR", message: err.message } }),
        );
      } else {
        log.error(err.message);
      }
      return 2;
    }
    throw err;
  }
}
