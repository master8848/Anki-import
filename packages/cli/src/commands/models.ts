import { AnkiClient } from "@anki-xml/anki";
import { listModels } from "@anki-xml/models";
import type { GlobalFlags } from "../args.ts";
import type { Logger } from "@anki-xml/logger";

export async function runModelsCommand(flags: GlobalFlags, log: Logger): Promise<number> {
  const client = new AnkiClient({ url: flags.url });
  const models = await listModels(client);

  if (flags.json) {
    console.log(JSON.stringify({ models }));
  } else {
    for (const m of models) {
      log.info(`${m.name}: ${m.fields.join(", ")}`);
    }
  }
  return 0;
}
