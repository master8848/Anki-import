/**
 * `preview` command — open Anki's browser on a query.
 *
 * The agent reads back the rendered HTML by walking to the Anki
 * desktop and looking at the note. We don't have a headless renderer
 * (Anki's HTML is reviewer-driven), so `preview` is a thin shim
 * around AnkiConnect.guiBrowse.
 */

import { runSearch } from "./search-wrapper.ts";
import type { Command } from "../command.ts";
import { withFatal } from "../output.ts";

export interface PreviewSubArgs {
  positional: string[];
  deck?: string;
  tag?: string;
  limit: number;
}

function parseSubArgs(positional: string[], rest: string[]): PreviewSubArgs {
  const out: PreviewSubArgs = { positional, limit: 100 };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a === "--deck") {
      out.deck = rest[i + 1];
      i++;
    } else if (a === "--tag") {
      out.tag = rest[i + 1];
      i++;
    } else if (a === "--limit") {
      const v = Number(rest[i + 1]);
      if (Number.isFinite(v) && v > 0) out.limit = Math.floor(v);
      i++;
    }
  }
  return out;
}

const command: Command<PreviewSubArgs> = {
  name: "preview",
  description: "Open Anki's browser on a query (uses guiBrowse).",
  flags: {
    "--deck <name>": "Restrict to a deck (subtree match).",
    "--tag <name>": "Restrict to a tag.",
    "--limit <N>": "Cap the number of notes (default: 100).",
  },
  parseSubArgs(positional, rest) {
    return parseSubArgs(positional, rest);
  },
  async run(args, sub) {
    return withFatal(async () => {
      // Resolve a query that yields note ids matching the filters.
      const queryParts: string[] = [];
      if (sub.deck) queryParts.push(`deck:"${sub.deck}"`);
      if (sub.tag) queryParts.push(`tag:${sub.tag}`);
      const query = queryParts.join(" ");
      const hits = await runSearch({
        ankiConnectUrl: args.url,
        query: query || undefined,
        limit: sub.limit,
      });
      const ids = hits.map((h) => h.noteId);
      if (ids.length === 0) {
        console.log("No matching notes.");
        return 0;
      }
      // guiBrowse takes a single query string. We use nids:1,2,3
      // (note id query syntax).
      const browseQuery = `nid:${ids.join(",")}`;
      const { AnkiConnectClient } = await import("../../anki-connect.ts");
      const client = new AnkiConnectClient({ url: args.url });
      await client.guiBrowse(browseQuery);
      console.log(`Opened Anki browser on ${ids.length} note(s).`);
      return 0;
    });
  },
};

export default command;
