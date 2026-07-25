/**
 * Multi-collection profiles (P4.10).
 *
 * A profile is a named AnkiConnect URL. Profiles are stored in
 * `~/.config/anki-xml/profiles.json` (or `$XDG_CONFIG_HOME/anki-xml/
 * profiles.json` when set). The --profile flag on the CLI selects
 * which URL to use; without it, the default URL is used.
 *
 * The JSON shape is intentionally minimal:
 *
 *   {
 *     "default": "home",
 *     "profiles": {
 *       "home":    { "url": "http://127.0.0.1:8765" },
 *       "work":    { "url": "http://10.0.0.42:8765" },
 *       "staging": { "url": "http://10.0.0.99:8765" }
 *     }
 *   }
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

export interface Profile {
  name: string;
  url: string;
}

export interface ProfileConfig {
  default: string | null;
  profiles: Record<string, Profile>;
}

const DEFAULT_URL = "http://127.0.0.1:8765";

export function defaultProfilePath(): string {
  const xdg = process.env["XDG_CONFIG_HOME"];
  const base = xdg && xdg.length > 0 ? xdg : path.join(os.homedir(), ".config");
  return path.join(base, "anki-xml", "profiles.json");
}

export async function loadProfiles(filePath?: string): Promise<ProfileConfig> {
  const fp = filePath ?? defaultProfilePath();
  try {
    const text = await fs.readFile(fp, "utf8");
    const parsed = JSON.parse(text) as ProfileConfig;
    return parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { default: null, profiles: {} };
    }
    throw err;
  }
}

export async function saveProfiles(
  config: ProfileConfig,
  filePath?: string,
): Promise<void> {
  const fp = filePath ?? defaultProfilePath();
  await fs.mkdir(path.dirname(fp), { recursive: true });
  await fs.writeFile(fp, JSON.stringify(config, null, 2), "utf8");
}

export async function resolveUrl(
  profileName: string | null,
  filePath?: string,
): Promise<string> {
  if (!profileName) return DEFAULT_URL;
  const config = await loadProfiles(filePath);
  const profile = config.profiles[profileName];
  if (!profile) {
    throw new Error(`unknown profile '${profileName}'. Run 'anki-xml profile list'.`);
  }
  return profile.url;
}

export const DEFAULT_ANKI_CONNECT_URL = DEFAULT_URL;
