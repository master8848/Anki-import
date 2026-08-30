/**
 * MCP tool registry — P0/P1/P2 tool surface for AI agents.
 * The CLI remains the main interface; MCP is optional.
 */

import * as v from "valibot";
import { AnkiClient, AnkiConnectError, ankiLaunchCommand, launchAnki } from "@anki-xml/anki";
import { runDoctor } from "@anki-xml/core";
import { diffFile, importFromFile, planFile, syncFile, syncStatus } from "@anki-xml/core";
import { listModels } from "@anki-xml/models";
import { addTags, listTags, parseTagList, removeTags } from "@anki-xml/tags";
import { collectionStats } from "@anki-xml/stats";
import { retrieveMedia, storeMedia } from "@anki-xml/media";
import { parseDocument } from "@anki-xml/parser";
import { validateNotes } from "@anki-xml/validation";

export interface McpContext {
  url: string;
  fetchImpl?: typeof fetch;
}

/** Feature tiering from the project spec (P0 core, P1 common, P2 advanced). */
export type McpToolTier = "P0" | "P1" | "P2";

export interface McpTool {
  name: string;
  tier: McpToolTier;
  description: string;
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
): McpTool {
  return {
    name,
    tier,
    description,
    inputSchema: {
      type: "object",
      properties,
      ...(required && required.length > 0 ? { required } : {}),
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

export function clientFor(ctx: McpContext): AnkiClient {
  return new AnkiClient({ url: ctx.url, fetchImpl: ctx.fetchImpl });
}

export const TOOLS: McpTool[] = [
  makeTool(
    "import_xml",
    "P0",
    "Import a file (xml/yaml/json/csv/md) into Anki. Creates notes; rejects update targets (use sync).",
    {
      file: { type: "string", description: "Path to the file to import" },
      dry_run: { type: "boolean" },
      batch_size: { type: "number" },
      allow_duplicate: { type: "boolean" },
      auto_create_deck: { type: "boolean" },
      deck: { type: "string", description: "Fill empty decks with this value" },
      model: { type: "string", description: "Fill empty model types with this value" },
    },
    ["file"],
    v.object({
      file: str,
      dry_run: optBool,
      batch_size: optNum,
      allow_duplicate: optBool,
      auto_create_deck: optBool,
      deck: optStr,
      model: optStr,
    }),
    (p, ctx) =>
      importFromFile({
        inputPath: p["file"] as string,
        url: ctx.url,
        fetchImpl: ctx.fetchImpl,
        dryRun: p["dry_run"] as boolean | undefined,
        batchSize: p["batch_size"] as number | undefined,
        allowDuplicate: p["allow_duplicate"] as boolean | undefined,
        autoCreateDeck: p["auto_create_deck"] as boolean | undefined,
        deck: p["deck"] as string | undefined,
        model: p["model"] as string | undefined,
      }),
  ),
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
  ),
  makeTool(
    "doctor",
    "P0",
    "Diagnose AnkiConnect and collection health. Every failing check carries fix steps (hints).",
    {},
    undefined,
    v.object({}),
    (_p, ctx) => runDoctor({ url: ctx.url, fetchImpl: ctx.fetchImpl }),
  ),
  makeTool(
    "open_anki",
    "P1",
    "Launch the Anki desktop app from here (macOS/Windows/Linux). Run this first when AnkiConnect is unreachable, then call doctor.",
    {},
    undefined,
    v.object({}),
    async () => {
      const result = await launchAnki();
      const hint = ankiLaunchCommand();
      return {
        ok: result.ok,
        command: result.command,
        fallback_commands: [hint.command, ...hint.alternatives],
        detail: result.detail,
      };
    },
  ),
  makeTool(
    "list_decks",
    "P0",
    "List all deck names in the collection.",
    {},
    undefined,
    v.object({}),
    (_p, ctx) => clientFor(ctx).deckNames(),
  ),
  makeTool(
    "list_models",
    "P0",
    "List all note types in the collection with their fields.",
    {},
    undefined,
    v.object({}),
    (_p, ctx) => listModels(clientFor(ctx)),
  ),
  makeTool(
    "plan_import",
    "P1",
    "Dry-run preview: how a file would change the collection (add/update/remove/duplicates/unchanged).",
    {
      file: { type: "string" },
      allow_duplicate: { type: "boolean" },
      batch_size: { type: "number" },
      deck: { type: "string" },
      model: { type: "string" },
    },
    ["file"],
    v.object({ file: str, allow_duplicate: optBool, batch_size: optNum, deck: optStr, model: optStr }),
    (p, ctx) =>
      planFile(p["file"] as string, {
        url: ctx.url,
        fetchImpl: ctx.fetchImpl,
        allowDuplicate: p["allow_duplicate"] as boolean | undefined,
        batchSize: p["batch_size"] as number | undefined,
        deck: p["deck"] as string | undefined,
        model: p["model"] as string | undefined,
      }).then((r) => ({
        errors: r.errors,
        warnings: r.warnings,
        add: r.plan.add.map((n) => ({ number: n.number, deck: n.deckName, model: n.modelName })),
        update: r.plan.update.map((u) => ({ id: u.id, changedFields: u.changedFields })),
        remove: r.plan.remove,
        duplicates: r.plan.duplicates.map((n) => ({ number: n.number })),
        unchanged: r.plan.unchanged,
      })),
  ),
  makeTool(
    "add_note",
    "P1",
    "Add a single note.",
    {
      deck: { type: "string" },
      model: { type: "string" },
      fields: { type: "object", description: "Field name → HTML content" },
      tags: { type: "string", description: "Whitespace-separated tags" },
      allow_duplicate: { type: "boolean" },
    },
    ["deck", "model", "fields"],
    v.object({
      deck: str,
      model: str,
      fields: v.record(v.string(), str),
      tags: optStr,
      allow_duplicate: optBool,
    }),
    async (p, ctx) => {
      const client = clientFor(ctx);
      const ids = await client.addNotes([
        {
          deckName: p["deck"] as string,
          modelName: p["model"] as string,
          fields: p["fields"] as Record<string, string>,
          tags: parseTagList((p["tags"] as string | undefined) ?? ""),
          options: { allowDuplicate: (p["allow_duplicate"] as boolean | undefined) ?? false },
        },
      ]);
      return { id: ids[0] ?? null };
    },
  ),
  makeTool(
    "add_notes",
    "P1",
    "Add many notes in one request (batch).",
    {
      notes: {
        type: "array",
        description: "Array of {deck, model, fields, tags?}",
      },
    },
    ["notes"],
    v.object({
      notes: v.array(
        v.object({
          deck: str,
          model: str,
          fields: v.record(v.string(), str),
          tags: v.optional(v.string()),
        }),
      ),
    }),
    async (p, ctx) => {
      const client = clientFor(ctx);
      const ids = await client.addNotes(
        (p["notes"] as { deck: string; model: string; fields: Record<string, string>; tags?: string }[]).map(
          (n) => ({
            deckName: n.deck,
            modelName: n.model,
            fields: n.fields,
            tags: parseTagList(n.tags ?? ""),
            options: { allowDuplicate: false },
          }),
        ),
      );
      return { ids, failed: ids.filter((i) => i === null).length };
    },
  ),
  makeTool(
    "find_notes",
    "P1",
    "Find note ids by Anki search query (e.g. 'deck:Japanese').",
    { query: { type: "string" } },
    ["query"],
    v.object({ query: str }),
    (p, ctx) => clientFor(ctx).findNotes(p["query"] as string),
  ),
  makeTool(
    "get_tags",
    "P1",
    "List all tags in the collection.",
    {},
    undefined,
    v.object({}),
    (_p, ctx) => listTags(clientFor(ctx)),
  ),
  makeTool(
    "add_tags",
    "P1",
    "Add tags to notes.",
    { note_ids: { type: "array", description: "Anki note ids" }, tags: { type: "string" } },
    ["note_ids", "tags"],
    v.object({ note_ids: v.array(v.number()), tags: str }),
    (p, ctx) =>
      addTags(clientFor(ctx), p["note_ids"] as number[], [(p["tags"] as string).trim()]),
  ),
  makeTool(
    "remove_tags",
    "P1",
    "Remove tags from notes.",
    { note_ids: { type: "array" }, tags: { type: "string" } },
    ["note_ids", "tags"],
    v.object({ note_ids: v.array(v.number()), tags: str }),
    (p, ctx) =>
      removeTags(clientFor(ctx), p["note_ids"] as number[], [(p["tags"] as string).trim()]),
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
  ),
  makeTool(
    "store_media",
    "P2",
    "Store a media file (image/audio) in the Anki media folder. Pass base64-encoded bytes.",
    { filename: { type: "string" }, data_base64: { type: "string" } },
    ["filename", "data_base64"],
    v.object({ filename: str, data_base64: str }),
    (p, ctx) =>
      storeMedia(clientFor(ctx), p["filename"] as string, Buffer.from(p["data_base64"] as string, "base64")),
  ),
  makeTool(
    "get_media",
    "P2",
    "Retrieve a media file as base64.",
    { filename: { type: "string" } },
    ["filename"],
    v.object({ filename: str }),
    async (p, ctx) => {
      const buf = await retrieveMedia(clientFor(ctx), p["filename"] as string);
      return { filename: p["filename"], data_base64: buf.toString("base64"), bytes: buf.length };
    },
  ),
  makeTool(
    "collection_stats",
    "P2",
    "Collection-level statistics (decks, models, notes, cards, per-deck counts).",
    {},
    undefined,
    v.object({}),
    (_p, ctx) => collectionStats(clientFor(ctx)),
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
