/**
 * `validate` command — parse and structurally validate an XML file without
 * contacting AnkiConnect.
 */

import { runValidate } from "../../validate.ts";
import type { Command } from "../command.ts";
import { formatOutput, withFatal } from "../output.ts";

export interface ValidateSubArgs {
  file: string | null;
  strict: boolean;
}

function parseSubArgs(positional: string[], rest: string[]): ValidateSubArgs {
  return {
    file: positional[0] ?? null,
    strict: rest.includes("--strict"),
  };
}

const command: Command<ValidateSubArgs> = {
  name: "validate",
  description: "Parse and validate an XML file without contacting AnkiConnect.",
  flags: {
    "--strict": "Treat warnings as failures.",
  },
  parseSubArgs(positional, rest) {
    return parseSubArgs(positional, rest);
  },
  async run(args, sub) {
    if (!sub.file) {
      console.error("error: missing <file> argument");
      console.error("Usage: anki-xml validate <file.xml> [--strict] [--json]");
      return 2;
    }
    const file = sub.file;

    return withFatal(async () => {
      const report = await runValidate({ filePath: file, strict: sub.strict });

      if (args.json) {
        console.log(formatOutput(report, { args }, ""));
        return report.valid ? 0 : 1;
      }

      if (report.valid && report.warnings.length === 0) {
        console.log(`Reading ${file} ...`);
        console.log(`Valid: ${report.noteCount} notes, 0 errors, 0 warnings.`);
        return 0;
      }

      console.log(`Reading ${file} ...`);
      console.log(`Valid: ${report.valid ? "yes" : "no"}; ${report.noteCount} notes.`);
      if (report.decks.length > 0) {
        console.log(`Decks: ${report.decks.join(", ")}`);
      }

      if (report.errors.length > 0) {
        console.log("");
        console.log(`Errors (${report.errors.length}):`);
        for (const e of report.errors) {
          const where = e.noteNumber === 0 ? "<anki>" : `Note ${e.noteNumber}`;
          console.log(`  ${where}: ${e.message}`);
        }
      }
      if (report.warnings.length > 0) {
        console.log("");
        console.log(`Warnings (${report.warnings.length}):`);
        for (const w of report.warnings) {
          const where = w.noteNumber === 0 ? "<anki>" : `Note ${w.noteNumber}`;
          console.log(`  ${where}: ${w.message}`);
        }
      }

      return report.valid ? 0 : 1;
    });
  },
};

export default command;
