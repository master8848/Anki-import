/**
 * Idempotency keys (M10).
 *
 * When an agent runs the same `import` or `update` twice, the
 * default behavior is "create duplicates" (which is correct for a
 * human retrier but wrong for an AI agent that's just retrying after
 * a network blip).
 *
 * The idempotency mechanism works as follows:
 *
 *   1. The caller supplies `--idempotency-key <k>` (a UUID or any
 *      stable string).
 *   2. We hash the key + the command name + the action description
 *      into an "operation id" and write it to the audit log BEFORE
 *      doing any work.
 *   3. Before doing the work, we check the audit log: if this
 *      operation id has a `ok` outcome, we return a no-op result.
 *   4. After the work, we record the outcome again (or update the
 *      prior `pending` entry to `ok` / `error`).
 *
 * The persistence layer is the audit log we already maintain. No new
 * state file is needed.
 *
 * This module is intentionally tiny — the wrapper logic lives in
 * `withIdempotency()`, which each write command calls.
 */

import { appendAudit, readAudit } from "./checkpoints.ts";

export interface IdempotencyOptions {
  /** The user-supplied key (any stable string). */
  key: string;
  /** Command name (e.g. "import"). */
  command: string;
  /** Stable description of the operation. */
  description: string;
}

export interface IdempotencyOutcome {
  /** True when this is the first time we've seen the key. */
  fresh: boolean;
  /** True when the prior run succeeded. */
  priorOk: boolean;
}

/**
 * Compute a stable operation id from the (key, command, description)
 * triple. The triple is joined with a NUL byte to prevent collision
 * when keys or descriptions share substrings.
 */
export function operationId(opts: IdempotencyOptions): string {
  const payload = `${opts.command}\u0000${opts.key}\u0000${opts.description}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    h ^= payload.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ("00000000" + (h >>> 0).toString(16)).slice(-8);
}

/**
 * Check whether this operation id has already completed. Returns
 * `fresh=true` when this is the first time, `priorOk=true` when
 * a prior run finished successfully (in which case the caller
 * should short-circuit with a no-op).
 */
export async function checkIdempotency(
  opts: IdempotencyOptions,
): Promise<IdempotencyOutcome> {
  const opId = operationId(opts);
  const entries = await readAudit();
  const matching = entries.filter((e) => e.checkpoint === `op:${opId}`);
  if (matching.length === 0) {
    return { fresh: true, priorOk: false };
  }
  const latest = matching[0]!;
  return { fresh: false, priorOk: latest.outcome === "ok" };
}

/** Record the start of an operation (with the op id in `checkpoint`). */
export async function markPending(opts: IdempotencyOptions, noteIds?: number[]): Promise<string> {
  const opId = operationId(opts);
  await appendAudit({
    ts: new Date().toISOString(),
    command: opts.command,
    outcome: "pending",
    noteIds,
    checkpoint: `op:${opId}`,
    details: opts.description,
  });
  return opId;
}

/** Record the final outcome. */
export async function markOutcome(
  opts: IdempotencyOptions,
  outcome: "ok" | "error",
  noteIds?: number[],
  details?: string,
): Promise<void> {
  const opId = operationId(opts);
  await appendAudit({
    ts: new Date().toISOString(),
    command: opts.command,
    outcome,
    noteIds,
    checkpoint: `op:${opId}`,
    details,
  });
}