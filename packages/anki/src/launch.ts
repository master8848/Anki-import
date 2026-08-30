/**
 * Launching the Anki desktop app from the CLI.
 *
 * AnkiConnect is served from inside Anki, so Anki must be running as a
 * desktop app. This module gives humans and AI agents the exact command
 * to launch it per platform, and can spawn it directly (`anki-import
 * open`, MCP `open_anki`).
 *
 * Platform support: macOS (`open`), Windows (`start` / anki.exe),
 * Linux (`anki`).
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

/** A runnable launch command plus alternatives for the same platform. */
export interface AnkiLaunchCommand {
  /** Primary command a human or agent can run by hand. */
  command: string;
  /** Fallbacks in case the primary command is not installed. */
  alternatives: string[];
}

/** The launch command for a platform — pure, no side effects. */
export function ankiLaunchCommand(platform = process.platform): AnkiLaunchCommand {
  switch (platform) {
    case "darwin":
      return { command: "open -a Anki", alternatives: ["open /Applications/Anki.app"] };
    case "win32":
      return { command: 'start "" "Anki"', alternatives: ['"C:\\Program Files\\Anki\\anki.exe"'] };
    case "linux":
      return { command: "anki", alternatives: ["anki-desktop", "flatpak run net.ankiweb.Anki"] };
    default:
      return { command: "Launch the Anki desktop app manually", alternatives: [] };
  }
}

export interface AnkiLaunchResult {
  /** Whether the spawn call succeeded (the app may still be starting). */
  ok: boolean;
  /** The command that was (or should be) run. */
  command: string;
  /** Human-readable detail for logs and hints. */
  detail: string;
}

const WIN32_EXE_CANDIDATES = [
  "C:\\Program Files\\Anki\\anki.exe",
  "C:\\Program Files (x86)\\Anki\\anki.exe",
  process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Anki\\anki.exe` : "",
].filter((p): p is string => p.length > 0);

function spawnDetached(cmd: string, args: string[]): Promise<{ ok: boolean; detail: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.on("error", (err) => {
      resolve({ ok: false, detail: err.message });
    });
    child.once("spawn", () => {
      child.unref();
      resolve({ ok: true, detail: `${cmd} ${args.join(" ")}` });
    });
  });
}

/**
 * Launch Anki for the current platform. Detached, non-blocking — the
 * process is unref'd so the CLI can exit while Anki starts up.
 */
export async function launchAnki(platform = process.platform): Promise<AnkiLaunchResult> {
  const hint = ankiLaunchCommand(platform);

  if (platform === "darwin") {
    const bundle = "/Applications/Anki.app";
    const args = existsSync(bundle) ? [bundle] : ["-a", "Anki"];
    const r = await spawnDetached("open", args);
    return { ok: r.ok, command: hint.command, detail: r.detail };
  }

  if (platform === "win32") {
    for (const exe of WIN32_EXE_CANDIDATES) {
      if (existsSync(exe)) {
        const r = await spawnDetached(exe, []);
        return { ok: r.ok, command: exe, detail: r.detail };
      }
    }
    const r = await spawnDetached("cmd", ["/c", "start", "", "Anki"]);
    return { ok: r.ok, command: hint.command, detail: r.detail };
  }

  const r = await spawnDetached(hint.command, []);
  return { ok: r.ok, command: hint.command, detail: r.detail };
}
