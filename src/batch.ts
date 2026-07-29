/**
 * Atomic batch wrapper (M9).
 *
 * Wraps a write operation so the agent can opt into all-or-nothing
 * semantics:
 *
 *   anki-xml import ./cards.xml --batch-id abc --rollback-on-partial
 *
 * When the flag is set:
 *   1. We capture a checkpoint of every note id the operation is
 *      about to affect (best-effort: for create-only batches the
 *      checkpoint captures zero notes and serves as a marker; for
 *      update/delete batches it captures the existing note state).
 *   2. We run the operation normally.
 *   3. If the operation reports any failure, we call rollback against
 *      the captured checkpoint, restoring the collection to its
 *      pre-operation state.
 *
 * The wrapper is intentionally generic so every write command can
 * adopt it with one-line integration. The flag itself is global so
 * the agent only types it once per invocation.
 */

import { createCheckpoint, rollbackCheckpoint } from "./checkpoints.ts";
import { AnkiConnectClient } from "./anki-connect.ts";

export interface BatchOptions {
  batchId: string;
  rollbackOnPartial: boolean;
  ankiConnectUrl?: string;
  fetchImpl?: typeof fetch;
  /** Notes to capture before the work begins (may be empty for create-only batches). */
  preSnapshotIds: number[];
}

export interface BatchResult<T> {
  /** Whether the inner operation completed without failures. */
  ok: boolean;
  /** Result from the inner operation. */
  result: T;
  /** True when the wrapper rolled back the batch due to partial failure. */
  rolledBack: boolean;
  /** Name of the checkpoint created for this batch. */
  checkpointName: string;
}

const checkpointPrefix = "batch";

export async function withBatch<T>(
  opts: BatchOptions,
  inner: (client: AnkiConnectClient) => Promise<{ result: T; failureCount: number }>,
): Promise<BatchResult<T>> {
  const client = new AnkiConnectClient({
    url: opts.ankiConnectUrl ?? "http://127.0.0.1:8765",
    fetchImpl: opts.fetchImpl,
  });
  const checkpointName = `${checkpointPrefix}-${sanitize(opts.batchId)}`;

  // Capture a pre-batch snapshot of the notes we'll touch. For
  // create-only batches (preSnapshotIds=[]), createCheckpoint saves an
  // empty snapshot marker so the audit trail is complete and rollback operates consistently.
  await createCheckpoint(checkpointName, opts.preSnapshotIds, {
    ankiConnectUrl: opts.ankiConnectUrl,
    fetchImpl: opts.fetchImpl,
    note: `auto: batch '${opts.batchId}' (rollbackOnPartial=${opts.rollbackOnPartial})`,
  });

  const innerResult = await inner(client);
  const ok = innerResult.failureCount === 0;

  if (!ok && opts.rollbackOnPartial) {
    await rollbackCheckpoint(checkpointName, {
      ankiConnectUrl: opts.ankiConnectUrl,
      fetchImpl: opts.fetchImpl,
    });
    return {
      ok: false,
      result: innerResult.result,
      rolledBack: true,
      checkpointName,
    };
  }

  return {
    ok,
    result: innerResult.result,
    rolledBack: false,
    checkpointName,
  };
}

function sanitize(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
}