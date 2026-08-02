/**
 * Stable parse error hierarchy.
 *
 * Every parser error carries a stable `code` (branch on `code`, never
 * `message`). CLI `--json` output and MCP expose these codes to agents.
 */

export class ParseError extends Error {
  /** Stable machine-readable code, e.g. "XML_PARSE_ERROR". */
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "ParseError";
    this.code = code;
  }
}

export class XmlParseError extends ParseError {
  line?: number;
  column?: number;

  constructor(message: string, loc?: { line?: number; column?: number }) {
    super(message, "XML_PARSE_ERROR");
    this.name = "XmlParseError";
    if (loc?.line !== undefined) this.line = loc.line;
    if (loc?.column !== undefined) this.column = loc.column;
  }
}

export class JsonParseError extends ParseError {
  constructor(message: string) {
    super(message, "JSON_PARSE_ERROR");
    this.name = "JsonParseError";
  }
}

export class CsvParseError extends ParseError {
  constructor(message: string) {
    super(message, "CSV_PARSE_ERROR");
    this.name = "CsvParseError";
  }
}

export class YamlParseError extends ParseError {
  constructor(message: string) {
    super(message, "YAML_PARSE_ERROR");
    this.name = "YamlParseError";
  }
}

export class MarkdownParseError extends ParseError {
  constructor(message: string) {
    super(message, "MD_PARSE_ERROR");
    this.name = "MarkdownParseError";
  }
}
