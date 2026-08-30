import { ankiLaunchCommand, launchAnki } from "@anki-xml/anki";
import type { GlobalFlags } from "../args.ts";
import type { Logger } from "@anki-xml/logger";

/**
 * `open` — launch the Anki desktop app from the CLI.
 *
 * AnkiConnect runs inside Anki, so Anki must be running first. This
 * command spawns it (macOS: `open -a Anki`, Windows: anki.exe /
 * `start`, Linux: `anki`) so humans and AI agents have one command
 * that works on every platform.
 */
export async function runOpenCommand(flags: GlobalFlags, log: Logger): Promise<number> {
  const result = await launchAnki();

  if (flags.json) {
    console.log(
      JSON.stringify({
        ok: result.ok,
        command: result.command,
        detail: result.detail,
      }),
    );
    return result.ok ? 0 : 1;
  }

  if (result.ok) {
    log.info(`Launched Anki (${result.command}).`);
    log.info(`Wait a moment for Anki to start, then run 'anki-import doctor'.`);
  } else {
    log.error(`Could not launch Anki automatically: ${result.detail}`);
    log.info(`Launch it manually: ${ankiLaunchCommand().command}`);
    log.info(`After Anki is running, run 'anki-import doctor'.`);
  }
  return result.ok ? 0 : 1;
}
