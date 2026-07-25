/**
 * `search` command — keyword + structured query over notes.
 */

import { renderSearch, runSearch } from "../../search.ts";
import { CliError } from "../args.ts";
import type { Command } from "../command.ts";
import { formatOutput, withFatal } from "../output.ts";

export interface SearchSubArgs {
  phrase: string;
  query?: string;
  deck?: string;
  tags: string[];
  limit: number;
}

function parseSubArgs(positional: string[], rest: string[]): SearchSubArgs {
  const out: SearchSubArgs = {
    phrase: positional.join(" ").trim(),
    tags: [],
    limit: 100,
  };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a === "--query") {
      const v = rest[i + 1];
      if (v === undefined) throw new CliError("--query requires a value");
      out.query = v;
      i++;
    } else if (a === "--deck") {
      const v = rest[i + 1];
      if (v === undefined) throw new CliError("--deck requires a value");
      out.deck = v;
      i++;
    } else if (a === "--tag") {
      const v = rest[i + 1];
      if (v === undefined) throw new CliError("--tag requires a value");
      out.tags.push(v);
      i++;
    } else if (a === "--limit") {
      const v = rest[i + 1];
      if (v === undefined) throw new CliError("--limit requires a value");
      const n = Number(v);
      if (!Number.isFinite(n) || n < 1) throw new CliError("--limit must be a positive integer");
      out.limit = Math.floor(n);
      i++;
    }
  }
  return out;
}

const command: Command<SearchSubArgs> = {
  name: "search",
  description: "Search notes by phrase, deck, tag, and/or structured query.",
  flags: {
    "--deck <name>": "Restrict to a deck (subtree match).",
    "--tag <name>": "Require this tag (repeatable).",
    "--limit <N>": "Max notes to return (default: 100).",
    "--query <s>": "Raw Anki search query (overrides phrase).",
  },
  parseSubArgs(positional, rest) {
    return parseSubArgs(positional, rest);
  },
  async run(args, sub) {
    if (!sub.phrase && !sub.query) {
      console.error("error: search requires a phrase or --query");
      return 2;
    }
    return withFatal(async () => {
      const startMs = Date.now();
      const hits = await runSearch({
        ankiConnectUrl: args.url,
        phrase: sub.phrase || undefined,
        query: sub.query,
        deck: sub.deck,
        tags: sub.tags,
        limit: sub.limit,
      });
      console.log(formatOutput(hits, { args, startMs, command: "search" }, renderSearch(hits)));
      return 0;
    });
  },
};

export default command;
