/**
 * anki-import CLI entry point.
 * Business logic lives in core/; this file only boots the CLI.
 */

import { pathToFileURL } from "node:url";
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
  process.on("SIGINT", () => {
    interrupted = true;
  });
  main().then(
    (code) => process.exit(interrupted ? 130 : code),
    (err) => {
      console.error(err);
      process.exit(2);
    },
  );
}
