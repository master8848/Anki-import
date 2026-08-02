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

export async function readTextFile(p: string): Promise<string> {
  return fs.promises.readFile(p, "utf8");
}

export async function writeTextFile(p: string, content: string): Promise<void> {
  await fs.promises.writeFile(p, content, "utf8");
}
