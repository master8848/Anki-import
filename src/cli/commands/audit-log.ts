/**
 * `audit-log` command — stream the JSONL audit log.
 */

import { readAudit } from "../../checkpoints.ts";
import type { Command } from "../command.ts";
import { formatOutput, withFatal } from "../output.ts";

export interface AuditLogSubArgs {
  positional: string[];
  limit: number;
  command: string | null;
}

function parseSubArgs(positional: string[], rest: string[]): AuditLogSubArgs {
  const out: AuditLogSubArgs = { positional, limit: 50, command: null };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a === "--limit") {
      const n = Number(rest[i + 1]);
      if (Number.isFinite(n) && n > 0) out.limit = Math.floor(n);
      i++;
    } else if (a === "--command") {
      out.command = rest[i + 1];
      i++;
    }
  }
  return out;
}

const command: Command<AuditLogSubArgs> = {
  name: "audit-log",
  description: "Show recent audit-log entries (every write op).",
  flags: {
    "--limit <N>": "Cap the number of entries (default: 50).",
    "--command <name>": "Filter to one command (e.g. 'delete').",
  },
  parseSubArgs(positional, rest) {
    return parseSubArgs(positional, rest);
  },
  async run(args, sub) {
    return withFatal(async () => {
      const startMs = Date.now();
      let entries = await readAudit(sub.limit);
      if (sub.command) entries = entries.filter((e) => e.command === sub.command);
      const data = { entries };
      const human = entries
        .map((e) => {
          const ids = e.noteIds ? ` [${e.noteIds.length} notes]` : "";
          return `${e.ts}  ${e.command}  ${e.outcome}${ids}  ${e.details ?? ""}`;
        })
        .join("\n") || "(empty)";
      console.log(formatOutput(data, { args, startMs, command: "audit-log" }, human));
      return 0;
    });
  },
};

export default command;