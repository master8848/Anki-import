import type { Readable } from "node:stream";
import { parseXmlStream } from "../parser/xml-stream.ts";
import type { ImportPlugin } from "./types.ts";
import type { ParsedNote } from "../types/index.ts";

export class XmlImportPlugin implements ImportPlugin {
  supports(ext: string): boolean {
    return ext.toLowerCase() === ".xml" || ext.toLowerCase() === "xml";
  }

  async *parse(input: Readable): AsyncIterable<ParsedNote> {
    yield* parseXmlStream(input);
  }
}
