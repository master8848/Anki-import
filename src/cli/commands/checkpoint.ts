/**
 * `checkpoint` command — capture / list / delete named snapshots.
 *
 * Subcommands:
 *   checkpoint create <name> --ids <ids> [--note <text>]
 *   checkpoint list
 *   checkpoint delete <name>
 */

import {
  createCheckpoint,
  listCheckpoints,
  loadCheckpoint,
} from "../../checkpoints.ts";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { checkpointDir } from "../../checkpoints.ts";
import type { Command } from "../command.ts";
import { formatOutput, withFatal } from "../output.ts";

export interface CheckpointSubArgs {
  action: string | null;
  positional: string[];
  ids: number[];
  note?: string;
}

function parseSubArgs(positional: string[], rest: string[]): CheckpointSubArgs {
  const out: CheckpointSubArgs = {
    action: positional[0] ?? null,
    positional: positional.slice(1),
    ids: [],
  };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a === "--ids") {
      const v = rest[i + 1] ?? "";
      out.ids = v
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0);
      i++;
    } else if (a === "--note") {
      out.note = rest[i + 1];
      i++;
    }
  }
  return out;
}

async function deleteCheckpoint(name: string): Promise<void> {
  const file = path.join(checkpointDir(), `${name.replace(/[^a-zA-Z0-9._-]/g, "_")}.json`);
  await fs.rm(file, { force: true });
}

const command: Command<CheckpointSubArgs> = {
  name: "checkpoint",
  description: "Capture / list / delete note snapshots for safe rollback.",
  flags: {
    "--ids <ids>": "Comma-separated note ids to capture (for `create`).",
    "--note <text>": "Free-form description recorded in the audit log.",
  },
  parseSubArgs(positional, rest) {
    return parseSubArgs(positional, rest);
  },
  async run(args, sub) {
    return withFatal(async () => {
      const startMs = Date.now();
      const action = sub.action;
      if (!action) {
        console.error("Usage: anki-xml checkpoint <create|list|delete> [args]");
        return 2;
      }
      if (action === "list") {
        const items = await listCheckpoints();
        const data = { checkpoints: items };
        const human = items
          .map((c) => `${c.createdAt}  ${c.name}  (${c.noteCount} notes)`)
          .join("\n") || "(no checkpoints)";
        console.log(formatOutput(data, { args, startMs, command: "checkpoint" }, human));
        return 0;
      }
      if (action === "create") {
        const name = sub.positional[0];
        if (!name) {
          console.error("Usage: anki-xml checkpoint create <name> --ids <ids>");
          return 2;
        }
        if (sub.ids.length === 0) {
          console.error("--ids is required and must be at least one positive integer");
          return 2;
        }
        const snap = await createCheckpoint(name, sub.ids, {
          ankiConnectUrl: args.url,
          note: sub.note,
        });
        const data = {
          name: snap.name,
          createdAt: snap.createdAt,
          noteCount: Object.keys(snap.notes).length,
        };
        const human = `Checkpoint '${snap.name}' captured ${data.noteCount} note(s).`;
        console.log(formatOutput(data, { args, startMs, command: "checkpoint" }, human));
        return 0;
      }
      if (action === "delete") {
        const name = sub.positional[0];
        if (!name) {
          console.error("Usage: anki-xml checkpoint delete <name>");
          return 2;
        }
        await deleteCheckpoint(name);
        console.log(`Deleted checkpoint '${name}'.`);
        return 0;
      }
      if (action === "show") {
        const name = sub.positional[0];
        if (!name) {
          console.error("Usage: anki-xml checkpoint show <name>");
          return 2;
        }
        const snap = await loadCheckpoint(name);
        const data = snap;
        const human = `Checkpoint '${snap.name}' from ${snap.createdAt}: ${Object.keys(snap.notes).length} note(s).`;
        console.log(formatOutput(data, { args, startMs, command: "checkpoint" }, human));
        return 0;
      }
      console.error(`unknown action '${action}'`);
      return 2;
    });
  },
};

export default command;