/**
 * `plan` command — preflight check for an import.
 *
 * Validates the file and asks AnkiConnect which notes would be
 * duplicates. The agent reads the plan, decides whether to proceed,
 * and only then runs `import`.
 */

import { runPlan } from "../../plan.ts";
import type { Command } from "../command.ts";
import { formatOutput, withFatal } from "../output.ts";

export interface PlanSubArgs {
  file: string | null;
  noPreflight: boolean;
}

function parseSubArgs(positional: string[], rest: string[]): PlanSubArgs {
  return {
    file: positional[0] ?? null,
    noPreflight: rest.includes("--no-preflight"),
  };
}

const command: Command<PlanSubArgs> = {
  name: "plan",
  description: "Validate a file and predict what `import` would do (no mutation).",
  flags: {
    "--no-preflight": "Skip the AnkiConnect dedup check (offline plan only).",
  },
  parseSubArgs(positional, rest) {
    return parseSubArgs(positional, rest);
  },
  async run(args, sub) {
    if (!sub.file) {
      console.error("error: missing <file> argument");
      console.error("Usage: anki-xml plan <file.xml> [--no-preflight] [--json]");
      return 2;
    }
    const file = sub.file;

    return withFatal(async () => {
      const startMs = Date.now();
      const report = await runPlan({
        inputPath: file,
        ankiConnectUrl: args.url,
        preflight: !sub.noPreflight,
        autoCreateDeck: args.autoCreateDeck,
      });

      if (args.json) {
        console.log(formatOutput(report, { args, startMs, command: "plan" }, ""));
        return report.valid ? 0 : 1;
      }

      // Human-readable output.
      const lines: string[] = [];
      lines.push(`File: ${report.file}`);
      lines.push(`Valid: ${report.valid ? "yes" : "no"} (${report.validCount}/${report.noteCount} notes)`);
      if (report.decks.length > 0) {
        const newDecks = report.decks.filter((d) => d.wouldCreate).map((d) => d.name);
        const existingDecks = report.decks.filter((d) => !d.wouldCreate).map((d) => d.name);
        if (newDecks.length > 0) {
          lines.push(`Decks to create: ${newDecks.join(", ")}`);
        }
        if (existingDecks.length > 0) {
          lines.push(`Decks already present: ${existingDecks.join(", ")}`);
        }
      }
      if (report.canAddSummary.wouldAdd > 0) {
        lines.push(`Would add: ${report.canAddSummary.wouldAdd}`);
      }
      if (report.canAddSummary.wouldDuplicate > 0) {
        lines.push(`Would duplicate: ${report.canAddSummary.wouldDuplicate} (notes: ${report.duplicates.join(", ")})`);
      }
      if (report.canAddSummary.unknown > 0) {
        lines.push(`Unknown: ${report.canAddSummary.unknown} (AnkiConnect unreachable?)`);
      }
      if (report.warnings.length > 0) {
        lines.push("");
        lines.push(`Warnings: ${report.warnings.length}`);
      }
      console.log(lines.join("\n"));
      return report.valid ? 0 : 1;
    });
  },
};

export default command;
