export interface ImportPlugin {
  supports(ext: string): boolean;
  parse(input: import("node:stream").Readable): AsyncIterable<import("@anki-xml/utils").ParsedNote>;
}
