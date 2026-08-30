/**
 * MCP tool registry — minimal 5-tool surface for AI agents.
 * The CLI remains the main interface; MCP is optional.
 */

import * as v from "valibot";
import { AnkiClient, AnkiConnectError } from "@anki-xml/anki";
import { runDoctor } from "@anki-xml/core";
import { diffFile, syncFile, syncStatus } from "@anki-xml/core";
import { parseDocument } from "@anki-xml/parser";
import { validateNotes } from "@anki-xml/validation";

export interface McpContext {
  url: string;
  fetchImpl?: typeof fetch;
}

/** Feature tiering from the project spec (P0 core, P1 common, P2 advanced). */
export type McpToolTier = "P0" | "P1" | "P2";

export interface McpToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface McpTool {
  name: string;
  tier: McpToolTier;
  title?: string;
  description: string;
  annotations?: McpToolAnnotations;
  inputSchema: Record<string, unknown>;
  handler: (params: Record<string, unknown>, ctx: McpContext) => Promise<unknown>;
}

const str = v.pipe(v.string(), v.minLength(1));
const optBool = v.optional(v.boolean());
const optNum = v.optional(v.pipe(v.number(), v.minValue(1)));
const optStr = v.optional(v.string());

function makeTool(
  name: string,
  tier: McpToolTier,
  description: string,
  properties: Record<string, { type: string; description?: string }>,
  required: string[] | undefined,
  schema: v.GenericSchema,
  handler: (params: Record<string, unknown>, ctx: McpContext) => Promise<unknown>,
  opts: { title?: string; annotations?: McpToolAnnotations } = {},
): McpTool {
  return {
    name,
    tier,
    title: opts.title,
    description,
    annotations: opts.annotations,
    inputSchema: {
      type: "object",
      properties,
      ...(required && required.length > 0 ? { required } : {}),
      additionalProperties: false,
    },
    handler: async (params, ctx) => {
      const parsed = v.safeParse(schema, params ?? {});
      if (!parsed.success) {
        throw new McpToolError(
          `Invalid parameters for ${name}: ${parsed.issues.map((i) => i.message).join("; ")}`,
        );
      }
      return handler(parsed.output as Record<string, unknown>, ctx);
    },
  };
}

export class McpToolError extends Error {}

export const TOOLS: McpTool[] = [
  makeTool(
    "validate_xml",
    "P0",
    "Validate a file without contacting Anki. Returns note count, errors, warnings.",
    { file: { type: "string" } },
    ["file"],
    v.object({ file: str }),
    async (p) => {
      const fsp = await import("node:fs/promises");
      const source = await fsp.readFile(p["file"] as string, "utf8");
      const parsed = parseDocument(source);
      const result = validateNotes(parsed.notes, parsed.defaultDeck, source);
      return { ok: result.errors.length === 0, noteCount: result.notes.length, errors: result.errors, warnings: result.warnings };
    },
    {
      title: "Validate file",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
  ),
  makeTool(
    "doctor",
    "P0",
    "Diagnose AnkiConnect and collection health. Every failing check carries fix steps (hints).",
    {},
    undefined,
    v.object({}),
    (_p, ctx) => runDoctor({ url: ctx.url, fetchImpl: ctx.fetchImpl }),
    {
      title: "Diagnose AnkiConnect",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
  ),
  makeTool(
    "list_decks",
    "P0",
    "List all deck names in the collection (uses deckNames). Use to see which decks/cards exist before syncing.",
    {},
    undefined,
    v.object({}),
    (_p, ctx) => new AnkiClient({ url: ctx.url, fetchImpl: ctx.fetchImpl }).deckNames(),
    {
      title: "List decks",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
  ),
  makeTool(
    "diff",
    "P1",
    "Per-note field diff between a file and the live collection.",
    { file: { type: "string" } },
    ["file"],
    v.object({ file: str }),
    (p, ctx) =>
      diffFile(p["file"] as string, { url: ctx.url, fetchImpl: ctx.fetchImpl }).then((r) => ({
        errors: r.errors,
        notes: r.noteDiffs,
        decks: r.deckDiff,
      })),
    {
      title: "Diff file",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
  ),
  makeTool(
    "sync",
    "P1",
    "Reconcile a file with the collection (create + update). With a file: full import options. Without a file: checkpoint drift report.",
    {
      file: { type: "string", description: "Path to the file to sync (xml/yaml/json/csv/md)" },
      dry_run: { type: "boolean" },
      checkpoint_id: { type: "string" },
      batch_size: { type: "number" },
      allow_duplicate: { type: "boolean" },
      auto_create_deck: { type: "boolean" },
      deck: { type: "string", description: "Fill empty decks with this value" },
      model: { type: "string", description: "Fill empty model types with this value" },
    },
    undefined,
    v.object({
      file: optStr,
      dry_run: optBool,
      checkpoint_id: optStr,
      batch_size: optNum,
      allow_duplicate: optBool,
      auto_create_deck: optBool,
      deck: optStr,
      model: optStr,
    }),
    async (p, ctx) => {
      if (p["file"] === undefined) {
        const status = await syncStatus({
          checkpointId: p["checkpoint_id"] as string | undefined,
          url: ctx.url,
          fetchImpl: ctx.fetchImpl,
        });
        const missing = status.drift.filter((d) => !d.exists);
        return {
          checkpoint: status.checkpoint,
          drift: status.drift,
          missingIds: missing.map((d) => d.id),
          missing: missing.length,
        };
      }
      const result = await syncFile(p["file"] as string, {
        url: ctx.url,
        fetchImpl: ctx.fetchImpl,
        dryRun: p["dry_run"] as boolean | undefined,
        batchSize: p["batch_size"] as number | undefined,
        allowDuplicate: p["allow_duplicate"] as boolean | undefined,
        autoCreateDeck: p["auto_create_deck"] as boolean | undefined,
        checkpointId: p["checkpoint_id"] as string | undefined,
        deck: p["deck"] as string | undefined,
        model: p["model"] as string | undefined,
      });
      return {
        errors: result.errors,
        plan: {
          add: result.plan.add.length,
          update: result.plan.update.length,
          duplicates: result.plan.duplicates.length,
          unchanged: result.plan.unchanged,
        },
        applied: result.applied,
      };
    },
    {
      title: "Sync file",
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
  ),
];

/** Stable error data shared by MCP and the CLI (--json) for AI agents. */
export interface AnkiConnectErrorData {
  code: string;
  message: string;
  hints?: string[];
  suggestion?: string;
  cause?: string;
}

/**
 * Canonical AnkiConnect error envelope: one shape used by MCP error data,
 * the CLI `--json` output, and any other agent-facing surface.
 */
export function ankiConnectErrorData(err: unknown): AnkiConnectErrorData {
  if (err instanceof AnkiConnectError) {
    return {
      code: "ANKICONNECT_ERROR",
      message: err.message,
      hints: err.hints ?? [],
      suggestion: err.suggestion,
      cause: err.cause,
    };
  }
  return { code: "INTERNAL_ERROR", message: err instanceof Error ? err.message : String(err) };
}

/** Alias kept for backwards compatibility. */
export const toolErrorData = ankiConnectErrorData;
