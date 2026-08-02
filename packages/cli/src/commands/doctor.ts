import { runDoctor } from "@anki-xml/core";
import type { GlobalFlags } from "../args.ts";
import type { Logger } from "@anki-xml/logger";

export async function runDoctorCommand(flags: GlobalFlags, log: Logger): Promise<number> {
  const result = await runDoctor({ url: flags.url });

  if (flags.json) {
    console.log(JSON.stringify(result));
  } else {
    for (const check of result.checks) {
      const mark = check.ok ? "ok" : "FAIL";
      log.info(`[${mark}] ${check.name}: ${check.detail}`);
    }
    log.info(result.ok ? "Doctor: all checks passed." : "Doctor: one or more checks failed.");
  }

  return result.ok ? 0 : 1;
}
