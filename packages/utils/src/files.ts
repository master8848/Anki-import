/**
 * Filesystem helpers.
 */

import * as fs from "node:fs";

/** Exists check that works on Node and Bun. */
export function fileExistsSync(p: string): boolean {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}
