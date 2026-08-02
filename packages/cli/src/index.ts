/**
 * anki-import CLI entry point.
 * Business logic lives in core/; this file only boots the CLI.
 */

import { pathToFileURL } from "node:url";
import { abortAnkiConnect } from "@anki-xml/anki";
import { main } from "./run.ts";

export { main };
export { parseArgs, parseNoteIds, CliError } from "./args.ts";

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    const entryUrl = pathToFileURL(entry).href;
    return import.meta.url === entryUrl || import.meta.url.endsWith(entry.replace(/\\/g, "/"));
  } catch {
    return false;
  }
}

const metaMain = (import.meta as { main?: boolean }).main;
const shouldRun = typeof metaMain === "boolean" ? metaMain : isMainModule();

if (shouldRun) {
  let interrupted = false;
  let hardExit: ReturnType<typeof setTimeout> | undefined;
  process.on("SIGINT", () => {
    if (interrupted) {
      // Second Ctrl+C — leave immediately.
      process.exit(130);
    }
    interrupted = true;
    // Abort any in-flight AnkiConnect request so a hung Anki can't make
    // the command run out every retry and timeout.
    abortAnkiConnect();
    // Safety net for stuck non-HTTP work: force exit shortly after the
    // first SIGINT if the command has not settled by then.
    hardExit = setTimeout(() => process.exit(130), 2500);
  });
  main().then(
    (code) => {
      if (hardExit) clearTimeout(hardExit);
      process.exit(interrupted ? 130 : code);
    },
    (err) => {
      if (hardExit) clearTimeout(hardExit);
      if (!interrupted) console.error(err);
      process.exit(interrupted ? 130 : 2);
    },
  );
}
