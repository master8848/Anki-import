import * as fsp from "node:fs/promises";
import { parseDocument } from "../../parser/xml-parser.ts";
import { parseXmlFileStream } from "../../parser/xml-stream.ts";
import { validateNotes, validateNote } from "../../core/validator/validate.ts";
import { flagBool, type GlobalFlags } from "../args.ts";
import type { Logger } from "../../utils/logger.ts";
import { fileExistsSync } from "../../core/importer/import.ts";

export async function runBenchmarkCommand(
  file: string,
  rest: Record<string, string | boolean>,
  flags: GlobalFlags,
  log: Logger,
): Promise<number> {
  if (!fileExistsSync(file)) {
    log.error(`File not found: ${file}`);
    return 2;
  }

  const stream = flagBool(rest, "stream");
  const start = process.hrtime.bigint();
  const memBefore = process.memoryUsage().heapUsed;
  let cards = 0;

  if (stream) {
    for await (const note of parseXmlFileStream(file)) {
      const { note: valid } = validateNote(note, note.deck);
      if (valid) cards++;
    }
  } else {
    const source = await fsp.readFile(file, "utf8");
    const parsed = parseDocument(source);
    const result = validateNotes(parsed.notes, parsed.defaultDeck, source);
    cards = result.notes.length;
  }

  const elapsedNs = process.hrtime.bigint() - start;
  const elapsedSec = Number(elapsedNs) / 1e9;
  const memAfter = process.memoryUsage().heapUsed;
  const memMb = Math.max(0, Math.round((memAfter - memBefore) / (1024 * 1024)));
  const rate = elapsedSec > 0 ? Math.round(cards / elapsedSec) : cards;

  const report = {
    cards,
    memoryMb: memMb,
    timeSec: Number(elapsedSec.toFixed(2)),
    rate,
    stream,
  };

  if (flags.json) {
    console.log(JSON.stringify(report));
  } else {
    log.info(`Cards: ${report.cards}`);
    log.info(`Memory: ${report.memoryMb} MB`);
    log.info(`Time: ${report.timeSec} seconds`);
    log.info(`Rate: ${report.rate} cards/sec`);
  }

  return 0;
}
