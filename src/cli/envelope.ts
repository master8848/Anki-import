/**
 * JSON envelope for AI agents.
 *
 * Every command's `--json` output is wrapped in a stable envelope so an
 * agent can switch on `command`, distinguish `ok` from `error`, and
 * read `warnings` and `meta` without parsing command-specific output.
 *
 * The legacy shape (raw command payload, no envelope) is preserved
 * behind `--json-legacy` for the first release cycle that ships the
 * envelope. After that, `--json-legacy` is removed.
 *
 * Envelope (v1):
 *
 *   {
 *     "version": 1,
 *     "command": "import",
 *     "ok": true,
 *     "args": { "file": "foo.xml" },
 *     "data": { ...command-specific payload... },
 *     "warnings": [...],
 *     "error": null,
 *     "meta": {
 *       "duration_ms": 142,
 *       "timestamp": "2024-...Z",
 *       "version": "0.0.1"
 *     }
 *   }
 *
 * On failure:
 *
 *   {
 *     "version": 1,
 *     "command": "import",
 *     "ok": false,
 *     "args": { "file": "foo.xml" },
 *     "error": {
 *       "code": "VALIDATION_ERROR",
 *       "message": "No <note> elements found inside <anki>",
 *       "details": { "errors": [...] }
 *     },
 *     "meta": { ... }
 *   }
 */

import type { NoteValidationError, ParsedArgs } from "./args.ts";

/** Versions are integers; bump on breaking shape changes. */
export type EnvelopeVersion = 1;

export interface EnvelopeMeta {
  /** Wall-clock duration of the command in milliseconds. */
  duration_ms: number;
  /** ISO-8601 timestamp at the moment the envelope was emitted. */
  timestamp: string;
  /** anki-xml version that produced this envelope. */
  version: string;
}

export interface JsonError {
  /** Stable error code (e.g. "VALIDATION_ERROR", "FILE_NOT_FOUND", "ANKICONNECT_ERROR"). */
  code: string;
  /** Human-readable message. */
  message: string;
  /** Optional command-specific payload. */
  details?: unknown;
}

export interface JsonEnvelope<T> {
  version: EnvelopeVersion;
  command: string;
  ok: boolean;
  /** Argument snapshot for debugging. Sensitive values are redacted. */
  args?: Record<string, unknown>;
  /** Command-specific payload. Absent on failure. */
  data?: T;
  /** Non-fatal warnings collected during the command. */
  warnings?: NoteValidationError[];
  /** Present (and only set) when ok=false. */
  error?: JsonError;
  meta: EnvelopeMeta;
}

export const ENVELOPE_VERSION: EnvelopeVersion = 1;

/**
 * Stable, machine-readable error codes. Agents should switch on these
 * rather than parsing `message`. Codes are uppercased and snake-cased
 * for easy pattern matching.
 */
export const ErrorCode = {
  ARG_MISSING: "ARG_MISSING",
  ARG_INVALID: "ARG_INVALID",
  FILE_NOT_FOUND: "FILE_NOT_FOUND",
  FILE_READ_ERROR: "FILE_READ_ERROR",
  XML_PARSE_ERROR: "XML_PARSE_ERROR",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  ANKICONNECT_ERROR: "ANKICONNECT_ERROR",
  NETWORK_ERROR: "NETWORK_ERROR",
  UNKNOWN_COMMAND: "UNKNOWN_COMMAND",
  UNKNOWN_SHELL: "UNKNOWN_SHELL",
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Wrap a command payload in the v1 envelope.
 */
export function envelope<T>(
  command: string,
  args: ParsedArgs,
  startMs: number,
  data: T,
  warnings?: NoteValidationError[],
): JsonEnvelope<T> {
  return {
    version: ENVELOPE_VERSION,
    command,
    ok: true,
    args: redactArgs(args),
    data,
    warnings,
    meta: meta(startMs),
  };
}

/**
 * Wrap an error in a failure envelope.
 */
export function errorEnvelope(
  command: string,
  args: ParsedArgs,
  startMs: number,
  code: ErrorCodeValue,
  message: string,
  details?: unknown,
): JsonEnvelope<null> {
  return {
    version: ENVELOPE_VERSION,
    command,
    ok: false,
    args: redactArgs(args),
    error: { code, message, details },
    meta: meta(startMs),
  };
}

function meta(startMs: number): EnvelopeMeta {
  return {
    duration_ms: Date.now() - startMs,
    timestamp: new Date().toISOString(),
    version: "0.0.1",
  };
}

/**
 * Strip values that an AI agent wouldn't need to echo back. The keys
 * are kept so the agent knows *which* options were used.
 */
function redactArgs(args: ParsedArgs): Record<string, unknown> {
  return {
    url: args.url,
    dryRun: args.dryRun,
    json: args.json,
    autoCreateDeck: args.autoCreateDeck,
    positional: args.positional,
  };
}
