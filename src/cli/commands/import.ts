/**
 * `import` command — read an XML file, validate, and send to AnkiConnect.
 */

import { importFromFile } from "../../import.ts";
import type { Command } from "../command.ts";
import { formatOutput, withFatal } from "../output.ts";

export interface ImportSubArgs {
  file: string | null;
  allowDuplicate: boolean;
}

const command: Command<ImportSubArgs> = {
  name: "import",
  description: "Create Anki notes from an XML file (the only write-by-default command).",
  flags: {
    "--auto-create-deck": "Create decks referenced by notes (default: on)",
    "--no-auto-create-deck": "Fail if a referenced deck does not exist",
    "--allow-duplicate": "Allow duplicate notes (default: reject duplicates).",
    "--dry-run": "Validate and report; do not contact AnkiConnect",
  },
  parseSubArgs(positional, rest) {
    return {
      file: positional[0] ?? null,
      allowDuplicate: rest.includes("--allow-duplicate"),
    };
  },
  async run(args, sub) {
    if (!sub.file) {
      console.error("error: missing <file> argument");
      console.error("Run 'anki-xml import --help' for usage.");
      return 2;
    }
    const file = sub.file;

    return withFatal(async () => {
      console.log(`Reading ${file} ...`);

      const outcome = await importFromFile({
        inputPath: file,
        ankiConnectUrl: args.url,
        dryRun: args.dryRun,
        autoCreateDeck: args.autoCreateDeck ?? true,
        allowDuplicate: sub.allowDuplicate,
      });

      if (outcome.validationErrors.length > 0) {
        console.error("");
        console.error("Validation errors:");
        for (const e of outcome.validationErrors) {
          const where = e.noteNumber === 0 ? "<anki>" : `Note ${e.noteNumber}`;
          const loc = e.line !== undefined ? ` (line ${e.line}, col ${e.column})` : "";
          console.error(`  ${where}${loc}: ${e.message}`);
        }
        console.error("");
        console.error("Aborting: no notes were sent to AnkiConnect.");
        return 1;
      }

      if (args.dryRun) {
        console.log("Dry run: validation passed, AnkiConnect was not contacted.");
        console.log(`Would have created ${outcome.validCount} notes.`);
        return 0;
      }

      const { created, failed } = outcome.result;
      console.log("");
      console.log(`Created: ${created}`);
      if (failed.length > 0) {
        console.log(`Failed:  ${failed.length}`);
        for (const f of failed) {
          console.log(`  Note ${f.noteNumber}: ${f.reason}`);
        }
        return 1;
      }
      console.log("All notes created successfully.");
      return 0;
    });
  },
};

export default command;
