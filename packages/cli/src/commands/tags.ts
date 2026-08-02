import { AnkiClient } from "@anki-xml/anki";
import { addTags, listTags, removeTags } from "@anki-xml/tags";
import { flagString, type GlobalFlags } from "../args.ts";
import type { Logger } from "@anki-xml/logger";
import { CliError } from "../args.ts";

function parseNoteIds(raw: string | undefined): number[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

async function selectNoteIds(
  client: AnkiClient,
  rest: Record<string, string | boolean>,
): Promise<number[]> {
  const ids = parseNoteIds(flagString(rest, "note-ids"));
  if (ids.length > 0) return ids;
  const query = flagString(rest, "query");
  if (!query) return [];
  return client.findNotes(query);
}

export async function runTagsCommand(
  sub: string | undefined,
  positional: string[],
  rest: Record<string, string | boolean>,
  flags: GlobalFlags,
  log: Logger,
): Promise<number> {
  const client = new AnkiClient({ url: flags.url });

  if (!sub || sub === "list") {
    const tags = await listTags(client);
    if (flags.json) console.log(JSON.stringify({ tags }));
    else if (tags.length === 0) log.info("No tags.");
    else log.info(tags.join(" "));
    return 0;
  }

  if (sub === "add" || sub === "remove") {
    const tag = positional[0];
    if (!tag) throw new CliError(`tags ${sub} requires a tag name`);
    const noteIds = await selectNoteIds(client, rest);
    if (noteIds.length === 0) {
      log.error("No notes selected: pass --note-ids 1,2,3 or --query \"deck:Name\"");
      return 1;
    }
    if (sub === "add") await addTags(client, noteIds, [tag]);
    else await removeTags(client, noteIds, [tag]);
    if (flags.json) console.log(JSON.stringify({ ok: true, tag, noteIds: noteIds.length }));
    else log.info(`Tag "${tag}" ${sub === "add" ? "added to" : "removed from"} ${noteIds.length} note(s).`);
    return 0;
  }

  throw new CliError(`Unknown tags subcommand: ${sub}`);
}
