export { XmlParseError, sourceLocation, offsetOfLine, tokenizeXml } from "./tokenize.ts";
export type { XmlToken } from "./tokenize.ts";
export { escapeCdataForHtml, HTML_VOID_TAGS } from "./cdata.ts";
export { parseDocument, parseNotes, extractFieldContent } from "./xml-parser.ts";
export type { ParsedDocument } from "./xml-parser.ts";
export { parseXmlStream, parseXmlFileStream } from "./xml-stream.ts";
export type { StreamParseOptions } from "./xml-stream.ts";
export { parseYaml } from "./yaml-parser.ts";
export { parseJson } from "./json-parser.ts";
export { parseCsv } from "./csv-parser.ts";
export type { CsvParseOptions } from "./csv-parser.ts";
export { parseMarkdown, escapeHtml } from "./markdown-parser.ts";
export type { MarkdownParseOptions } from "./markdown-parser.ts";
export { structuredToNotes } from "./structured.ts";
export type { StructuredDocument, StructuredNote } from "./structured.ts";

/** Alias for parseDocument — unified format entry point. */
export { parseDocument as parseXml } from "./xml-parser.ts";
