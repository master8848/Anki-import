import type { Readable } from "node:stream";
import { parseXmlStream } from "@anki-xml/parser";
import type { ImportPlugin } from "./types.ts";
import type { ParsedNote } from "@anki-xml/utils";

export class XmlImportPlugin implements ImportPlugin {
  readonly name = "xml";

  supports(ext: string): boolean {
    const e = ext.toLowerCase();
    return e === ".xml" || e === "xml";
  }

  async *parse(input: Readable): AsyncIterable<ParsedNote> {
    yield* parseXmlStream(input);
  }
}
