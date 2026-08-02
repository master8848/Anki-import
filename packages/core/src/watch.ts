/**
 * Watch mode — detect file changes, validate, show a plan, confirm,
 * then apply. The confirm callback lets the CLI decide interactively
 * while agents pass --yes.
 */

import { applyPlan } from "@anki-xml/sync";
import type { Logger } from "@anki-xml/logger";
import { planFile } from "./plan.ts";

export interface WatchSummary {
  add: number;
  update: number;
  duplicates: number;
  unchanged: number;
}

export interface WatchOptions {
  url?: string;
  fetchImpl?: typeof fetch;
  batchSize?: number;
  autoCreateDeck?: boolean;
  allowDuplicate?: boolean;
  checkpointId?: string;
  logger?: Logger;
  /** Return false to skip applying. Default: apply immediately. */
  confirm?: (summary: WatchSummary) => Promise<boolean> | boolean;
}

/** Watch a file and apply changes on change. Returns a stop handle. */
export async function watchFile(
  file: string,
  opts: WatchOptions = {},
): Promise<{ stop: () => Promise<void> }> {
  const { watch } = await import("chokidar");
  const logger = opts.logger;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;

  const onChange = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      logger?.info(`Change detected: ${file}`);
      const planned = await planFile(file, {
        url: opts.url,
        fetchImpl: opts.fetchImpl,
        batchSize: opts.batchSize,
        allowDuplicate: opts.allowDuplicate,
        logger,
      });
      if (planned.errors.length > 0) {
        logger?.error(`Validation failed (${planned.errors.length} errors) — not applying.`);
        for (const e of planned.errors.slice(0, 5)) logger?.error(`  ${e.message}`);
        return;
      }
      const summary: WatchSummary = {
        add: planned.plan.add.length,
        update: planned.plan.update.length,
        duplicates: planned.plan.duplicates.length,
        unchanged: planned.plan.unchanged,
      };
      logger?.info(
        `Plan: ${summary.add} add, ${summary.update} update, ${summary.duplicates} duplicate, ${summary.unchanged} unchanged`,
      );
      const ok = opts.confirm ? await opts.confirm(summary) : true;
      if (!ok) {
        logger?.info("Skipped.");
        return;
      }
      const applied = await applyPlan(planned.plan, {
        url: opts.url,
        fetchImpl: opts.fetchImpl,
        batchSize: opts.batchSize,
        autoCreateDeck: opts.autoCreateDeck,
        allowDuplicate: opts.allowDuplicate,
        checkpointId: opts.checkpointId,
        logger,
      });
      logger?.info(
        `Applied: ${applied.created} created, ${applied.updated} updated, ${applied.failed.length} failed.`,
      );
    } catch (err) {
      logger?.error(`watch error: ${(err as Error).message}`);
    } finally {
      running = false;
    }
  };

  const watcher = watch(file, { ignoreInitial: true });
  watcher.on("change", () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void onChange(), 300);
  });
  watcher.on("error", (err: unknown) => logger?.error(`watch error: ${(err as Error).message}`));

  return {
    stop: async () => {
      if (timer) clearTimeout(timer);
      await watcher.close();
    },
  };
}
