/**
 * `export` command — read notes from Anki and emit XML.
 */

import { runExport } from "../../export.ts";
import type { Command } from "../command.ts";
import { withFatal, writeStdout } from "../output.ts";

export interface ExportSubArgs {
  deck?: string;
  query?: string;
  limit?: number;
  withIds: boolean;
  outFile: string | null;
}

function parseSubArgs(positional: string[], rest: string[]): ExportSubArgs {
  const out: ExportSubArgs = { withIds: false, outFile: null };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a === "--deck") {
      const v = rest[i + 1];
      if (v === undefined) throw new Error("--deck requires a value");
      out.deck = v;
      i++;
    } else if (a === "--query") {
      const v = rest[i + 1];
      if (v === undefined) throw new Error("--query requires a value");
      out.query = v;
      i++;
    } else if (a === "--limit") {
      const v = rest[i + 1];
      if (v === undefined) throw new Error("--limit requires a value");
      const n = Number(v);
      if (!Number.isFinite(n) || n < 1) throw new Error("--limit must be a positive integer");
      out.limit = Math.floor(n);
      i++;
    } else if (a === "--with-ids") {
      out.withIds = true;
    } else if (a === "--out") {
      const v = rest[i + 1];
      if (v === undefined) throw new Error("--out requires a value");
      out.outFile = v;
      i++;
    }
  }
  // Allow positional: first non-flag arg is the output file.
  if (out.outFile === null && positional.length > 0) {
    out.outFile = positional[0]!;
  }
  return out;
}

const command: Command<ExportSubArgs> = {
  name: "export",
  description: "Read notes from Anki and emit round-trippable XML.",
  flags: {
    "--deck <name>": "Restrict to a deck (subtree match).",
    "--query <s>": "Anki search query (overrides --deck).",
    "--limit <N>": "Cap the number of notes exported.",
    "--with-ids": "Include id=\"...\" on each <note> (so re-import targets the same notes).",
    "--out <path>": "Write to a file instead of stdout.",
  },
  parseSubArgs(positional, rest) {
    return parseSubArgs(positional, rest);
  },
  async run(args, sub) {
    return withFatal(async () => {
      const result = await runExport({
        ankiConnectUrl: args.url,
        deck: sub.deck,
        query: sub.query,
        limit: sub.limit,
        withIds: sub.withIds,
      });
      if (sub.outFile) {
        await Bun.write(sub.outFile, result.xml);
        console.log(`Wrote ${result.noteCount} notes to ${sub.outFile}.`);
      } else {
        writeStdout(result.xml);
      }
      return 0;
    });
  },
};

export default command;
