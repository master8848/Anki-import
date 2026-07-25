/**
 * `update` command — change field values / tags on existing notes.
 */

import { loadUpdatesFromXml, renderUpdate, runUpdate, type FieldUpdate, type UpdateEntry } from "../../update.ts";
import { CliError } from "../args.ts";
import type { Command } from "../command.ts";
import { withFatal } from "../output.ts";

export interface UpdateSubArgs {
  id?: number;
  ids?: number[];
  file?: string;
  fields: FieldUpdate[];
}

function parseSubArgs(positional: string[], rest: string[]): UpdateSubArgs {
  const out: UpdateSubArgs = { fields: [] };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a === "--id") {
      const v = rest[i + 1];
      if (v === undefined) throw new CliError("--id requires a value");
      const n = Number(v);
      if (!Number.isFinite(n) || !Number.isInteger(n)) {
        throw new CliError(`--id must be an integer (got "${v}")`);
      }
      out.id = n;
      i++;
    } else if (a === "--ids") {
      const v = rest[i + 1];
      if (v === undefined) throw new CliError("--ids requires a value");
      const parts = v.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
      const nums = parts.map((p) => {
        const n = Number(p);
        if (!Number.isFinite(n) || !Number.isInteger(n)) {
          throw new CliError(`--ids contains non-integer value "${p}"`);
        }
        return n;
      });
      out.ids = nums;
      i++;
    } else if (a === "--file") {
      const v = rest[i + 1];
      if (v === undefined) throw new CliError("--file requires a value");
      out.file = v;
      i++;
    } else if (a === "--field") {
      const v = rest[i + 1];
      if (v === undefined) throw new CliError("--field requires a value");
      const eq = v.indexOf("=");
      if (eq < 0) {
        throw new CliError(`--field expects Name=value (got "${v}")`);
      }
      const name = v.slice(0, eq).trim();
      const value = v.slice(eq + 1);
      if (!name) throw new CliError(`--field name cannot be empty (got "${v}")`);
      out.fields.push({ name, value });
      i++;
    }
  }
  if (out.id === undefined && positional.length > 0) {
    const n = Number(positional[0]);
    if (Number.isFinite(n) && Number.isInteger(n)) {
      out.id = n;
    }
  }
  return out;
}

const command: Command<UpdateSubArgs> = {
  name: "update",
  description: "Change field values and/or tags on existing notes.",
  flags: {
    "--id <N>": "Update a single note by id.",
    "--ids <list>": "Update notes by comma-separated ids (requires --file).",
    "--file <path>": "Read updates from an XML file.",
    "--field <Name=value>": "Field to update (repeatable; use Anki display name).",
    "--tags <list>": "Replace tags.",
    "--dry-run": "Validate and report; do not contact AnkiConnect.",
  },
  parseSubArgs(positional, rest) {
    return parseSubArgs(positional, rest);
  },
  async run(args, sub) {
    return withFatal(async () => {
      const entries: UpdateEntry[] = [];

      if (sub.id !== undefined) {
        if (sub.fields.length === 0) {
          console.error("error: --id requires at least one --field Name=value");
          return 2;
        }
        entries.push({ noteId: sub.id, fields: sub.fields });
      }

      if (sub.ids && sub.file) {
        const fileEntries = await loadUpdatesFromXml(sub.file);
        if (fileEntries.length !== sub.ids.length) {
          console.error(
            `error: --ids has ${sub.ids.length} entries but ${sub.file} has ${fileEntries.length} <note> elements`,
          );
          return 2;
        }
        for (let i = 0; i < sub.ids.length; i++) {
          entries.push({
            noteId: sub.ids[i]!,
            fields: fileEntries[i]!.fields,
          });
        }
      } else if (sub.file) {
        const fileEntries = await loadUpdatesFromXml(sub.file);
        for (const e of fileEntries) entries.push(e);
      } else if (sub.ids) {
        console.error("error: --ids requires --file <updates.xml>");
        return 2;
      }

      if (entries.length === 0) {
        console.error("error: update needs --id N, --ids ..., or --file <updates.xml>");
        return 2;
      }

      if (args.dryRun) {
        console.log(`Dry run: would update ${entries.length} note(s).`);
        for (const e of entries) {
          const fields = e.fields.map((f) => f.name).join(", ");
          console.log(`  Note ${e.noteId}: ${fields}`);
        }
        return 0;
      }

      const result = await runUpdate({
        ankiConnectUrl: args.url,
        entries,
        dryRun: false,
      });
      console.log(renderUpdate(result));
      return result.failed.length === 0 ? 0 : 1;
    });
  },
};

export default command;
