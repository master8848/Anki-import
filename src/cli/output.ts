/**
 * Output formatting helpers.
 *
 * `formatOutput` chooses between JSON and human rendering based on the
 * CLI flags. When `--json` is set, the data is wrapped in the v1
 * JSON envelope (P2.8) unless `--json-legacy` is passed.
 *
 * `withFatal` wraps a command's main body so that any uncaught error
 * is converted to a `fatal: <message>` line and exit code 2.
 *
 * Both helpers are pure: no shared mutable state, no globals beyond the
 * process streams they're allowed to write to.
 */

import type { NoteValidationError, ParsedArgs } from "./args.ts";
import { envelope, errorEnvelope, ErrorCode, type ErrorCodeValue } from "./envelope.ts";

export interface OutputContext {
  args: ParsedArgs;
  /** When the command started, for `meta.duration_ms`. */
  startMs: number;
  /** What `--command` value to put in the envelope. */
  command: string;
}

/**
 * Render either machine-readable JSON or the human-readable string the
 * caller built. The JSON shape is the canonical contract for AI agents;
 * the human string is for humans.
 */
export function formatOutput<T>(
  data: T,
  ctx: OutputContext,
  human: string,
  options?: { warnings?: NoteValidationError[] },
): string {
  if (!ctx.args.json) return human;
  if (ctx.args.jsonVersion === 0) {
    return JSON.stringify(data, null, 2);
  }
  return JSON.stringify(
    envelope(ctx.command, ctx.args, ctx.startMs, data, options?.warnings),
    null,
    2,
  );
}

/**
 * Build a JSON error envelope string. Used by commands that have to
 * emit a failure shape (e.g. validate with errors, or commands that
 * catch before formatOutput).
 */
export function formatError(
  ctx: OutputContext,
  code: ErrorCodeValue,
  message: string,
  details?: unknown,
): string {
  if (!ctx.args.json) return `error: ${message}`;
  if (ctx.args.jsonVersion === 0) {
    return JSON.stringify({ error: { code, message, details } }, null, 2);
  }
  return JSON.stringify(errorEnvelope(ctx.command, ctx.args, ctx.startMs, code, message, details), null, 2);
}

/**
 * Write a string to stdout without a trailing newline. Useful for emitting
 * scripts that callers may want to pipe (`anki-xml completion bash | source`).
 */
export function writeStdout(text: string): void {
  process.stdout.write(text);
}

/**
 * Write a fatal error line and return exit code 2.
 */
export function fatal(message: string): number {
  console.error(`fatal: ${message}`);
  return 2;
}

/**
 * Wrap an async command body so any uncaught error is surfaced as a
 * fatal line and exit code 2. This replaces the repeated
 * `try { ... } catch (err) { console.error("fatal: ..."); return 2; }`
 * pattern that every command used to have.
 */
export async function withFatal(fn: () => Promise<number>): Promise<number> {
  try {
    return await fn();
  } catch (err) {
    return fatal((err as Error).message);
  }
}

export { ErrorCode };
