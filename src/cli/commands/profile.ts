/**
 * `profile` command — manage multi-collection profiles.
 *
 * Subcommands:
 *   profile list
 *   profile add <name> <url>
 *   profile remove <name>
 *   profile default <name>
 *   profile show [<name>]
 */

import {
  defaultProfilePath,
  loadProfiles,
  saveProfiles,
} from "../../profile.ts";
import type { Command } from "../command.ts";
import { formatOutput, withFatal } from "../output.ts";

export interface ProfileSubArgs {
  action: string | null;
  positional: string[];
}

function parseSubArgs(positional: string[]): ProfileSubArgs {
  return { action: positional[0] ?? null, positional: positional.slice(1) };
}

const command: Command<ProfileSubArgs> = {
  name: "profile",
  description: "Manage named AnkiConnect URL profiles (multi-collection).",
  flags: {},
  parseSubArgs(positional) {
    return parseSubArgs(positional);
  },
  async run(args, sub) {
    return withFatal(async () => {
      const startMs = Date.now();
      const action = sub.action;
      if (!action) {
        console.error("Usage: anki-xml profile <list|add|remove|default|show> [args]");
        return 2;
      }
      if (action === "list") {
        const cfg = await loadProfiles();
        const data = { default: cfg.default, profiles: cfg.profiles, path: defaultProfilePath() };
        const human = JSON.stringify(data, null, 2);
        console.log(formatOutput(data, { args, startMs, command: "profile" }, human));
        return 0;
      }
      if (action === "add") {
        const [name, url] = sub.positional;
        if (!name || !url) {
          console.error("Usage: anki-xml profile add <name> <url>");
          return 2;
        }
        const cfg = await loadProfiles();
        cfg.profiles[name] = { name, url };
        if (!cfg.default) cfg.default = name;
        await saveProfiles(cfg);
        console.log(`Added profile '${name}' -> ${url}.`);
        return 0;
      }
      if (action === "remove") {
        const [name] = sub.positional;
        if (!name) {
          console.error("Usage: anki-xml profile remove <name>");
          return 2;
        }
        const cfg = await loadProfiles();
        delete cfg.profiles[name];
        if (cfg.default === name) cfg.default = null;
        await saveProfiles(cfg);
        console.log(`Removed profile '${name}'.`);
        return 0;
      }
      if (action === "default") {
        const [name] = sub.positional;
        if (!name) {
          console.error("Usage: anki-xml profile default <name>");
          return 2;
        }
        const cfg = await loadProfiles();
        if (!cfg.profiles[name]) {
          console.error(`unknown profile '${name}'`);
          return 2;
        }
        cfg.default = name;
        await saveProfiles(cfg);
        console.log(`Default profile set to '${name}'.`);
        return 0;
      }
      if (action === "show") {
        const [name] = sub.positional;
        const cfg = await loadProfiles();
        const target = name ?? cfg.default;
        if (!target) {
          console.error("no default profile set");
          return 2;
        }
        const profile = cfg.profiles[target];
        if (!profile) {
          console.error(`unknown profile '${target}'`);
          return 2;
        }
        const data = profile;
        const human = `${profile.name}: ${profile.url}`;
        console.log(formatOutput(data, { args, startMs, command: "profile" }, human));
        return 0;
      }
      console.error(`unknown action '${action}'`);
      return 2;
    });
  },
};

export default command;
