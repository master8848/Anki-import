import * as readline from "node:readline/promises";
import { watchFile } from "@anki-xml/core";
import { flagBool, flagString, flagNumber, type ParsedArgs } from "../args.ts";
import type { Logger } from "@anki-xml/logger";

async function askYesNo(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`${question} [y/N] `);
    return answer.trim().toLowerCase() === "y";
  } finally {
    rl.close();
  }
}

export async function runWatchCommand(
  file: string,
  args: ParsedArgs,
  log: Logger,
): Promise<number> {
  const flags = args.flags;
  const autoApply = flagBool(args.rest, "yes") || flags.json;

  const { stop } = await watchFile(file, {
    url: flags.url,
    batchSize: flagNumber(args.rest, "batch-size", 500),
    allowDuplicate: flagBool(args.rest, "allow-duplicate"),
    autoCreateDeck: !flagBool(args.rest, "no-auto-create-deck"),
    checkpointId: flagString(args.rest, "checkpoint"),
    logger: log,
    confirm: autoApply
      ? undefined
      : async (summary) =>
          askYesNo(
            `Apply ${summary.add} add, ${summary.update} update, ${summary.duplicates} duplicate?`,
          ),
  });

  log.info(`Watching ${file} — Ctrl+C to stop.`);
  if (!autoApply) log.info("Changes will ask for confirmation before applying (use --yes to skip).");

  await new Promise<void>((resolve) => {
    process.once("SIGINT", () => {
      void stop().then(() => resolve());
    });
  });

  return 0;
}
