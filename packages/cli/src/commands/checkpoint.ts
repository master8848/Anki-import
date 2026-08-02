import { createCheckpoint, listCheckpoints } from "@anki-xml/checkpoint";
import { flagString, parseNoteIds, type GlobalFlags } from "../args.ts";
import type { Logger } from "@anki-xml/logger";
import { CliError } from "../args.ts";

export async function runCheckpointCommand(
  sub: string | undefined,
  positional: string[],
  rest: Record<string, string | boolean>,
  flags: GlobalFlags,
  log: Logger,
): Promise<number> {
  if (!sub || sub === "list") {
    const list = await listCheckpoints();
    if (flags.json) {
      console.log(JSON.stringify({ checkpoints: list }));
    } else if (list.length === 0) {
      log.info("No checkpoints.");
    } else {
      for (const c of list) {
        log.info(`${c.id}  deck=${c.deck || "-"}  created=${c.created}  notes=${c.noteIds.length}`);
      }
    }
    return 0;
  }

  if (sub === "create") {
    const id = positional[0];
    if (!id) throw new CliError("checkpoint create requires an id");
    const idsRaw = flagString(rest, "note-ids");
    if (!idsRaw) throw new CliError("checkpoint create requires --note-ids 1,2,3");
    const noteIds = parseNoteIds(idsRaw);
    const deck = flagString(rest, "deck") ?? "";
    const snap = await createCheckpoint({ id, deck, noteIds });
    if (flags.json) console.log(JSON.stringify(snap));
    else log.info(`Checkpoint created: ${snap.id} (${snap.noteIds.length} notes)`);
    return 0;
  }

  throw new CliError(`Unknown checkpoint subcommand: ${sub}`);
}
