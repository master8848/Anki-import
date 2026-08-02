/**
 * Workspace config discovery and loading.
 */

import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parse as parseYamlText } from "yaml";

/** Config keys understood by the toolkit. */
export interface AnkiConfig {
  deck?: string;
  model?: string;
  url?: string;
}

/** Config file names, in precedence order. */
export const CONFIG_FILE_NAMES = [
  "anki.config.json",
  "anki.config.yaml",
  "anki.config.yml",
] as const;

const CONFIG_KEYS = ["deck", "model", "url"] as const;

/** Walk up from startDir to the filesystem root, returning the first config path. */
export async function findConfig(startDir?: string): Promise<string | null> {
  let dir = startDir ?? process.cwd();
  for (;;) {
    for (const name of CONFIG_FILE_NAMES) {
      const candidate = join(dir, name);
      try {
        await access(candidate);
        return candidate;
      } catch {
        // not here — keep looking
      }
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Load config from the nearest anki.config.{json,yaml,yml} file, or {} when absent. */
export async function loadConfig(opts?: { cwd?: string }): Promise<AnkiConfig> {
  const file = await findConfig(opts?.cwd);
  if (file === null) return {};
  const source = await readFile(file, "utf8");
  if (file.endsWith(".json")) {
    try {
      return normalizeConfig(JSON.parse(source) as Record<string, unknown>);
    } catch (err) {
      throw new Error(`Invalid JSON in config file ${file}: ${(err as Error).message}`);
    }
  }
  const doc = parseYamlText(source, { merge: true }) as unknown;
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) return {};
  return normalizeConfig(doc as Record<string, unknown>);
}

function normalizeConfig(raw: Record<string, unknown>): AnkiConfig {
  const out: AnkiConfig = {};
  for (const key of CONFIG_KEYS) {
    const value = raw[key];
    if (typeof value === "string" && value.trim().length > 0) {
      out[key] = value.trim();
    }
  }
  return out;
}
