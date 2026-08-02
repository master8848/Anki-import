/**
 * Playground — interactive dev harness for anki-xml.
 * Exercises the programmatic API against your live collection
 * (or a mock fetchImpl). Not published; dev-only.
 *
 * Run: pnpm --filter @anki-xml/playground dev
 */

import { main } from "@anki-xml/cli";
import { planFile, runDoctor } from "@anki-xml/core";
import { createLogger } from "@anki-xml/logger";

const log = createLogger({ verbose: true });

async function demoDoctor(): Promise<void> {
  log.info("=== doctor ===");
  const result = await runDoctor();
  for (const check of result.checks) {
    log.info(`[${check.ok ? "ok" : "FAIL"}] ${check.name}: ${check.detail}`);
  }
}

async function demoPlan(file: string): Promise<void> {
  log.info(`=== plan ${file} ===`);
  const result = await planFile(file, { logger: log });
  log.info(
    `add=${result.plan.add.length} update=${result.plan.update.length} duplicates=${result.plan.duplicates.length} unchanged=${result.plan.unchanged}`,
  );
}

async function demoCli(argv: string[]): Promise<void> {
  log.info(`=== cli ${argv.join(" ")} ===`);
  const code = await main(argv);
  log.info(`exit=${code}`);
}

const args = process.argv.slice(2);
const sub = args[0] ?? "help";

switch (sub) {
  case "doctor":
    void demoDoctor();
    break;
  case "plan":
    void demoPlan(args[1] ?? "examples/cards.yaml");
    break;
  case "cli":
    void demoCli(args.slice(1));
    break;
  default:
    log.info("usage: tsx src/dev.ts <doctor|plan [file]|cli ...>");
}
