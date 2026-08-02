/**
 * Tag parsing helpers — shared by validation and the tags package.
 */

/** Split a whitespace-separated tag string into trimmed, non-empty tags. */
export function parseTagList(raw: string): string[] {
  return raw
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}
