/**
 * CDATA → HTML escape for Anki field embedding.
 * Escapes bare `&`, `<`, `>` without double-escaping existing entities.
 */

export function escapeCdataForHtml(s: string): string {
  return s
    .replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]*|#\d+|#x[0-9a-fA-F]+);)/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** HTML void elements accepted without XML-style `/>` inside Anki fields. */
export const HTML_VOID_TAGS = [
  "br",
  "hr",
  "img",
  "input",
  "meta",
  "link",
  "area",
  "base",
  "col",
  "embed",
  "param",
  "source",
  "track",
  "wbr",
] as const;
