import * as fsp from "node:fs/promises";
import { parseDocument, XmlParseError } from "@anki-xml/parser";
import { validateNotes, formatValidationError } from "@anki-xml/validation";
import { flagString, type ParsedArgs } from "../args.ts";
import type { Logger } from "@anki-xml/logger";

export async function runValidate(
  file: string,
  args: ParsedArgs,
  log: Logger,
): Promise<number> {
  const flags = args.flags;
  let source: string;
  try {
    source = await fsp.readFile(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      log.error(`File not found: ${file}`);
      return 2;
    }
    throw err;
  }

  let parsed;
  try {
    parsed = parseDocument(source);
  } catch (err) {
    if (err instanceof XmlParseError) {
      const loc =
        err.line !== undefined ? ` (line ${err.line}${err.column !== undefined ? `, column ${err.column}` : ""})` : "";
      if (flags.json) {
        console.log(
          JSON.stringify({
            ok: false,
            error: { code: "XML_PARSE_ERROR", message: err.message, line: err.line, column: err.column },
          }),
        );
      } else {
        log.error(`XML parse error${loc}: ${err.message}`);
      }
      return 1;
    }
    throw err;
  }

  const deckOverride = flagString(args.rest, "deck");
  if (deckOverride) {
    for (const n of parsed.notes) if (!n.deck) n.deck = deckOverride;
  }
  const modelOverride = flagString(args.rest, "model");
  if (modelOverride) {
    for (const n of parsed.notes) if (!n.type) n.type = modelOverride;
  }

  const result = validateNotes(parsed.notes, parsed.defaultDeck, source);

  if (flags.json) {
    console.log(
      JSON.stringify({
        ok: result.errors.length === 0,
        noteCount: result.notes.length,
        errors: result.errors,
        warnings: result.warnings,
      }),
    );
  } else if (result.errors.length === 0) {
    log.info(`Validated ${result.notes.length} notes.`);
    for (const w of result.warnings) log.warn(formatValidationError(w));
  } else {
    for (const e of result.errors) log.error(formatValidationError(e));
    log.error(`Validation failed: ${result.errors.length} error(s).`);
  }

  return result.errors.length === 0 ? 0 : 1;
}
