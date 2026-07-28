/**
 * `addon` command — list, install, enable, and disable Anki add-ons.
 *
 * Subcommands:
 *   addon list                                # every installed add-on
 *   addon install <code>                      # install by AnkiWeb code
 *   addon enable <code>                       # enable an installed add-on
 *   addon disable <code>                      # disable an installed add-on
 *   addon check                               # run the doctor's add-on checks
 *
 * Add-ons are addressed by their AnkiWeb code (a numeric string like
 * "1610307553" for MathJax). The install path uses AnkiConnect's
 * `installAddon` action, which downloads the add-on from AnkiWeb.
 * After install, Anki typically requires a restart for the add-on to
 * load. `enable` and `disable` use `toggleAddon`.
 *
 * The `addon check` subcommand runs the same checks the `doctor`
 * command runs for add-ons, in isolation. This is the right primitive
 * for an agent that wants to verify prerequisites before generating
 * math-heavy notes.
 */

import { AnkiConnectClient, AnkiConnectError } from "../../anki-connect.ts";
import {
  KNOWN_ADDONS,
  MATHJAX_ADDON_CODE,
  type DoctorCheck,
} from "../../doctor.ts";
import type { Command } from "../command.ts";
import { formatOutput, withFatal } from "../output.ts";

export interface AddonSubArgs {
  action: string | null;
  positional: string[];
}

function parseSubArgs(positional: string[]): AddonSubArgs {
  return { action: positional[0] ?? null, positional: positional.slice(1) };
}

function makeClient(args: { url: string }): AnkiConnectClient {
  return new AnkiConnectClient({ url: args.url });
}

async function listAddons(args: { url: string; json: boolean; quiet: boolean }) {
  const startMs = Date.now();
  return withFatal(async () => {
    const client = makeClient(args);
    let addons: Record<string, boolean>;
    try {
      addons = await client.getAddons();
    } catch (err) {
      const detail = err instanceof AnkiConnectError
        ? err.message
        : (err as Error).message;
      throw new Error(
        `Could not query add-ons (AnkiConnect may be too old): ${detail}`,
      );
    }
    const entries = Object.entries(addons)
      .map(([code, enabled]) => ({ code, enabled }))
      .sort((a, b) => a.code.localeCompare(b.code));
    const data = { count: entries.length, addons: entries };
    const human = entries.length === 0
      ? "No add-ons installed."
      : entries
          .map((e) => {
            const known = Object.values(KNOWN_ADDONS).find(
              (k) => k.code === e.code,
            );
            const tag = known ? ` (${known.description})` : "";
            return `  ${e.enabled ? "✓" : "✗"} ${e.code}${tag}`;
          })
          .join("\n");
    console.log(formatOutput(data, { args, startMs, command: "addon" }, human));
    return 0;
  });
}

async function installAddon(
  args: { url: string; json: boolean; quiet: boolean },
  code: string,
) {
  const startMs = Date.now();
  return withFatal(async () => {
    const client = makeClient(args);
    let installedCode: string;
    try {
      installedCode = await client.installAddon(code);
    } catch (err) {
      const detail = err instanceof AnkiConnectError
        ? err.message
        : (err as Error).message;
      throw new Error(
        `Failed to install add-on ${code}: ${detail}. ` +
          `Confirm Anki is running, has internet access, and that the code is a valid AnkiWeb add-on.`,
      );
    }
    const data = { code: installedCode, status: "installed" };
    const human =
      `Installed add-on ${installedCode}. Restart Anki for it to load.`;
    console.log(formatOutput(data, { args, startMs, command: "addon" }, human));
    return 0;
  });
}

async function toggleAddon(
  args: { url: string; json: boolean; quiet: boolean },
  code: string,
  enable: boolean,
) {
  const startMs = Date.now();
  return withFatal(async () => {
    const client = makeClient(args);
    try {
      await client.toggleAddon(code, enable);
    } catch (err) {
      const detail = err instanceof AnkiConnectError
        ? err.message
        : (err as Error).message;
      throw new Error(
        `Failed to ${enable ? "enable" : "disable"} add-on ${code}: ${detail}.`,
      );
    }
    const data = { code, enabled: enable };
    const human = enable
      ? `Enabled add-on ${code}. Restart Anki for the change to take effect.`
      : `Disabled add-on ${code}. Restart Anki for the change to take effect.`;
    console.log(formatOutput(data, { args, startMs, command: "addon" }, human));
    return 0;
  });
}

async function checkAddons(args: { url: string; json: boolean; quiet: boolean }) {
  const startMs = Date.now();
  return withFatal(async () => {
    const client = makeClient(args);
    const checks: DoctorCheck[] = [];

    let addons: Record<string, boolean> | null = null;
    try {
      addons = await client.getAddons();
    } catch (err) {
      checks.push({
        name: "addons-queryable",
        ok: false,
        detail: `AnkiConnect does not support add-on queries: ${(err as Error).message}`,
      });
      const data = { checks };
      const human = checks
        .map((c) => `  ${c.ok ? "✓" : "✗"} ${c.name}: ${c.detail}`)
        .join("\n");
      console.log(formatOutput(data, { args, startMs, command: "addon" }, human));
      return 1;
    }

    const knownCodes = new Set(
      Object.values(KNOWN_ADDONS).map((k) => k.code),
    );
    const knownInstalled = Object.entries(addons)
      .filter(([code]) => knownCodes.has(code))
      .map(([code, enabled]) => ({ code, enabled }));

    for (const [name, meta] of Object.entries(KNOWN_ADDONS)) {
      const enabled = addons[meta.code] === true;
      const present = Object.prototype.hasOwnProperty.call(addons, meta.code);
      if (enabled) {
        checks.push({
          name: `${name}-addon-installed`,
          ok: true,
          detail: `${meta.code} (${meta.description}): installed and enabled`,
        });
      } else if (present) {
        checks.push({
          name: `${name}-addon-installed`,
          ok: false,
          detail: `${meta.code} (${meta.description}): installed but disabled`,
        });
      } else {
        checks.push({
          name: `${name}-addon-installed`,
          ok: false,
          detail: `${meta.code} (${meta.description}): not installed`,
        });
      }
    }

    const data = {
      knownInstalled,
      checks,
      ok: checks.every((c) => c.ok),
    };
    const human = checks
      .map((c) => `  ${c.ok ? "✓" : "✗"} ${c.name}: ${c.detail}`)
      .join("\n");
    console.log(formatOutput(data, { args, startMs, command: "addon" }, human));
    return data.ok ? 0 : 1;
  });
}

const command: Command<AddonSubArgs> = {
  name: "addon",
  description:
    "List, install, enable, and disable Anki add-ons (uses AnkiConnect's getAddons/installAddon/toggleAddon).",
  flags: {},
  parseSubArgs(positional) {
    return parseSubArgs(positional);
  },
  async run(args, sub) {
    const action = sub.action;
    if (!action) {
      console.error(
        "Usage: anki-xml addon <list|install|enable|disable|check> [code]\n" +
          `Known add-ons: ${
            Object.entries(KNOWN_ADDONS)
              .map(([n, m]) => `${n}=${m.code}`)
              .join(", ")
          }`,
      );
      return 2;
    }
    if (action === "list") {
      return await listAddons(args);
    }
    if (action === "install") {
      const [code] = sub.positional;
      if (!code) {
        console.error(
          `Usage: anki-xml addon install <code>\nExample: anki-xml addon install ${MATHJAX_ADDON_CODE}  # MathJax`,
        );
        return 2;
      }
      return await installAddon(args, code);
    }
    if (action === "enable") {
      const [code] = sub.positional;
      if (!code) {
        console.error("Usage: anki-xml addon enable <code>");
        return 2;
      }
      return await toggleAddon(args, code, true);
    }
    if (action === "disable") {
      const [code] = sub.positional;
      if (!code) {
        console.error("Usage: anki-xml addon disable <code>");
        return 2;
      }
      return await toggleAddon(args, code, false);
    }
    if (action === "check") {
      return await checkAddons(args);
    }
    console.error(
      `unknown action '${action}'; expected list|install|enable|disable|check`,
    );
    return 2;
  },
};

export default command;
