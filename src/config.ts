/**
 * Config file support (M14).
 *
 * `anki-xml` looks for config in two places:
 *
 *   1. The path given by --config <path> (highest priority).
 *   2. `./.anki-xmlrc` in the current directory.
 *   3. `$XDG_CONFIG_HOME/anki-xml/config.toml` (lowest priority).
 *
 * Format: TOML (small, human-editable, no comments required). We
 * support a small subset:
 *
 *   # .anki-xmlrc
 *   url     = "http://10.0.0.42:8765"
 *   profile = "work"
 *   format  = "ndjson"
 *   dry_run = true
 *
 * Unknown keys are ignored (forward compat). The config file is
 * read at startup; flags on the command line always override the
 * config (so `anki-xml --json import ...` works regardless of
 * what's in the file).
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import TOML from "@iarna/toml";

export interface Config {
  url?: string;
  profile?: string;
  format?: "default" | "ndjson";
  dryRun?: boolean;
  noColor?: boolean;
  quiet?: boolean;
}

export function defaultConfigPath(): string {
  const xdg = process.env["XDG_CONFIG_HOME"];
  const base = xdg && xdg.length > 0 ? xdg : path.join(os.homedir(), ".config");
  return path.join(base, "anki-xml", "config.toml");
}

export function projectConfigPath(): string {
  return path.join(process.cwd(), ".anki-xmlrc");
}

const FORMAT_VALUES = new Set(["default", "ndjson"]);

/**
 * Parse TOML configuration file using @iarna/toml parser.
 * Throws on malformed input; missing file is not an error (returns {}).
 */
export async function loadConfig(filePath: string): Promise<Config> {
  let text: string;
  try {
    text = await fs.readFile(filePath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
  const parsed = TOML.parse(text) as Record<string, unknown>;
  const cfg: Config = {};
  if (typeof parsed.url === "string") cfg.url = parsed.url;
  if (typeof parsed.profile === "string") cfg.profile = parsed.profile;
  if (typeof parsed.format === "string" && FORMAT_VALUES.has(parsed.format)) {
    cfg.format = parsed.format as "default" | "ndjson";
  }
  if (typeof parsed.dry_run === "boolean") cfg.dryRun = parsed.dry_run;
  if (typeof parsed.dryRun === "boolean") cfg.dryRun = parsed.dryRun;
  if (typeof parsed.no_color === "boolean") cfg.noColor = parsed.no_color;
  if (typeof parsed.noColor === "boolean") cfg.noColor = parsed.noColor;
  if (typeof parsed.quiet === "boolean") cfg.quiet = parsed.quiet;
  return cfg;
}

/**
 * Resolve the active config by checking --config <path>, then
 * the project-local file, then the user-global file.
 */
export async function resolveConfig(explicitPath?: string): Promise<{
  config: Config;
  source: string | null;
}> {
  if (explicitPath) {
    return { config: await loadConfig(explicitPath), source: explicitPath };
  }
  const projectPath = projectConfigPath();
  const project = await loadConfig(projectPath);
  if (Object.keys(project).length > 0) {
    return { config: project, source: projectPath };
  }
  const globalPath = defaultConfigPath();
  const global = await loadConfig(globalPath);
  if (Object.keys(global).length > 0) {
    return { config: global, source: globalPath };
  }
  return { config: {}, source: null };
}

/** Merge a Config into a ParsedArgs, leaving already-set flags alone. */
export function mergeConfigInto(
  cfg: Config,
  args: {
    url: string;
    profile: string | null;
    format: "default" | "ndjson";
    dryRun: boolean;
    noColor: boolean;
    quiet: boolean;
  },
): void {
  if (cfg.url) args.url = cfg.url;
  if (cfg.profile && !args.profile) args.profile = cfg.profile;
  if (cfg.format && args.format === "default") args.format = cfg.format;
  if (cfg.dryRun !== undefined && !args.dryRun) args.dryRun = cfg.dryRun;
  if (cfg.noColor !== undefined && !args.noColor) args.noColor = cfg.noColor;
  if (cfg.quiet !== undefined && !args.quiet) args.quiet = cfg.quiet;
}