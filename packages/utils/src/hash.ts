/**
 * Hashing and id helpers (node:crypto, no external deps).
 */

import { createHash, randomUUID } from "node:crypto";

/** Stable content hash — used for note fingerprinting and diffs. */
export function sha1Hex(input: string): string {
  return createHash("sha1").update(input).digest("hex");
}

/** Short unique id, e.g. "a1b2c3d4" — used for checkpoint ids. */
export function shortId(prefix = "id"): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}
