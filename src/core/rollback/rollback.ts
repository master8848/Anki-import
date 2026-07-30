/**
 * Rollback — delete notes recorded in a checkpoint.
 */

import { AnkiClient } from "../../anki/ankiconnect.ts";
import { loadCheckpoint, deleteCheckpoint } from "../checkpoint/checkpoint.ts";
import type { Checkpoint } from "../../types/index.ts";

export interface RollbackOptions {
  checkpointId: string;
  url?: string;
  fetchImpl?: typeof fetch;
  dryRun?: boolean;
  /** Keep the checkpoint file after rollback. Default false. */
  keepCheckpoint?: boolean;
}

export interface RollbackResult {
  checkpoint: Checkpoint;
  deleted: number;
  dryRun: boolean;
}

export async function rollback(opts: RollbackOptions): Promise<RollbackResult> {
  const checkpoint = await loadCheckpoint(opts.checkpointId);
  if (opts.dryRun) {
    return { checkpoint, deleted: checkpoint.noteIds.length, dryRun: true };
  }

  const client = new AnkiClient({
    url: opts.url,
    fetchImpl: opts.fetchImpl,
  });

  if (checkpoint.noteIds.length > 0) {
    await client.deleteNotes(checkpoint.noteIds);
  }

  if (!opts.keepCheckpoint) {
    await deleteCheckpoint(opts.checkpointId);
  }

  return {
    checkpoint,
    deleted: checkpoint.noteIds.length,
    dryRun: false,
  };
}
