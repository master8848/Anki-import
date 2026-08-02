export {
  ParseError,
  XmlParseError,
  JsonParseError,
  CsvParseError,
  YamlParseError,
  MarkdownParseError,
} from "./errors.ts";
export {
  sourceLocation,
  createLineIndex,
  lineAtOffset,
  tokenizeXml,
} from "./tokenize.ts";
export type { XmlToken } from "./tokenize.ts";
export { escapeCdataForHtml, HTML_VOID_TAGS } from "./cdata.ts";
/** Alias kept for back-compat; same rule as `escapeCdataForHtml`. */
export { escapeCdataForHtml as escapeHtml } from "./cdata.ts";
export { parseDocument, extractFieldContent } from "./xml-parser.ts";
export type { ParsedDocument, ParseDocumentOptions } from "./xml-parser.ts";
export { parseXmlStream, parseXmlFileStream } from "./xml-stream.ts";
export type { StreamParseOptions } from "./xml-stream.ts";
export { parseYaml } from "./yaml-parser.ts";
export { parseJson } from "./json-parser.ts";
export { parseCsv } from "./csv-parser.ts";
export type { CsvParseOptions } from "./csv-parser.ts";
export { parseMarkdown } from "./markdown-parser.ts";
export type { MarkdownParseOptions } from "./markdown-parser.ts";
export { structuredToNotes, DEFAULT_MODEL } from "./structured.ts";
export type { StructuredDocument, StructuredNote } from "./structured.ts";

/** Alias for parseDocument — unified format entry point. */
export { parseDocument as parseXml } from "./xml-parser.ts";
