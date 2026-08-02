import * as path from "node:path";
import { AnkiClient } from "@anki-xml/anki";
import { deleteMedia, listMedia, retrieveMediaToFile, storeMediaFile } from "@anki-xml/media";
import { flagString, type GlobalFlags } from "../args.ts";
import type { Logger } from "@anki-xml/logger";
import { CliError } from "../args.ts";

export async function runMediaCommand(
  sub: string | undefined,
  positional: string[],
  rest: Record<string, string | boolean>,
  flags: GlobalFlags,
  log: Logger,
): Promise<number> {
  const client = new AnkiClient({ url: flags.url });

  if (!sub || sub === "list") {
    const files = await listMedia(client);
    if (flags.json) console.log(JSON.stringify({ media: files }));
    else if (files.length === 0) log.info("No media files.");
    else log.info(files.join("\n"));
    return 0;
  }

  if (sub === "store") {
    const file = positional[0];
    if (!file) throw new CliError("media store requires a file path");
    const name = flagString(rest, "as") ?? path.basename(file);
    await storeMediaFile(client, file, name);
    if (flags.json) console.log(JSON.stringify({ ok: true, filename: name }));
    else log.info(`Stored ${name}`);
    return 0;
  }

  if (sub === "retrieve") {
    const name = positional[0];
    if (!name) throw new CliError("media retrieve requires a filename");
    const out = flagString(rest, "out") ?? name;
    await retrieveMediaToFile(client, name, out);
    if (flags.json) console.log(JSON.stringify({ ok: true, filename: name, out }));
    else log.info(`Retrieved ${name} → ${out}`);
    return 0;
  }

  if (sub === "delete") {
    const name = positional[0];
    if (!name) throw new CliError("media delete requires a filename");
    await deleteMedia(client, name);
    if (flags.json) console.log(JSON.stringify({ ok: true, filename: name }));
    else log.info(`Deleted ${name}`);
    return 0;
  }

  throw new CliError(`Unknown media subcommand: ${sub}`);
}
