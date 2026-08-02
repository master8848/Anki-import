/**
 * Sync pipeline — plan a file against the collection, apply the plan,
 * and track state with checkpoints. `sync` is the reconcile command:
 * it both creates and updates notes (import only creates).
 */

import { applyPlan, driftFromCheckpoint, emptySyncApplyResult, type DriftEntry, type SyncApplyOptions, type SyncApplyResult } from "@anki-xml/sync";
import { listCheckpoints, loadCheckpoint, type Checkpoint } from "@anki-xml/checkpoint";
import { planFile, type PlanFileOptions, type PlanFileResult } from "./plan.ts";

export interface SyncFileOptions extends PlanFileOptions, SyncApplyOptions {
  /** Plan only; never write to the collection. */
  dryRun?: boolean;
}

export interface SyncFileResult {
  plan: PlanFileResult["plan"];
  applied: SyncApplyResult;
  errors: PlanFileResult["errors"];
  warnings: PlanFileResult["warnings"];
}

/** Plan + apply a file (create and update notes). */
export async function syncFile(file: string, opts: SyncFileOptions = {}): Promise<SyncFileResult> {
  const planned = await planFile(file, opts);
  if (opts.dryRun) {
    return {
      plan: planned.plan,
      applied: emptySyncApplyResult(),
      errors: planned.errors,
      warnings: planned.warnings,
    };
  }
  if (planned.errors.length > 0 || planned.plan.add.length + planned.plan.update.length === 0) {
    return {
      plan: planned.plan,
      applied: emptySyncApplyResult(),
      errors: planned.errors,
      warnings: planned.warnings,
    };
  }
  const applied = await applyPlan(planned.plan, {
    url: opts.url,
    fetchImpl: opts.fetchImpl,
    batchSize: opts.batchSize,
    autoCreateDeck: opts.autoCreateDeck,
    allowDuplicate: opts.allowDuplicate,
    checkpointId: opts.checkpointId,
    logger: opts.logger,
  });
  return { plan: planned.plan, applied, errors: planned.errors, warnings: planned.warnings };
}

export interface SyncStatusResult {
  checkpoint: Checkpoint | null;
  drift: DriftEntry[];
}

/** Compare the collection against the most recent checkpoint (drift report). */
export async function syncStatus(opts: {
  checkpointId?: string;
  url?: string;
  fetchImpl?: typeof fetch;
} = {}): Promise<SyncStatusResult> {
  let checkpoint: Checkpoint | null = null;
  if (opts.checkpointId) {
    checkpoint = await loadCheckpoint(opts.checkpointId);
  } else {
    const all = await listCheckpoints();
    checkpoint = all.length > 0 ? all[all.length - 1]! : null;
  }
  if (!checkpoint) return { checkpoint: null, drift: [] };
  const drift = await driftFromCheckpoint(checkpoint.id, {
    url: opts.url,
    fetchImpl: opts.fetchImpl,
  });
  return { checkpoint, drift };
}
