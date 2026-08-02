/**
 * MCP server over stdio — JSON-RPC 2.0, tools/list + tools/call.
 * Optional surface; the CLI remains the main interface.
 */

import * as readline from "node:readline";
import {
  failure,
  INTERNAL_ERROR,
  INVALID_PARAMS,
  METHOD_NOT_FOUND,
  parseRequest,
  PARSE_ERROR,
  success,
  type JsonRpcResponse,
} from "./protocol.ts";
import { McpToolError, TOOLS, toolErrorData } from "./tools.ts";
import { MCP_VERSION } from "./version.ts";

export interface McpServerOptions {
  url?: string;
  fetchImpl?: typeof fetch;
}

export async function startMcpServer(opts: McpServerOptions = {}): Promise<void> {
  const ctx = { url: opts.url ?? "http://127.0.0.1:8765", fetchImpl: opts.fetchImpl };
  const toolsByName = new Map(TOOLS.map((t) => [t.name, t]));

  const rl = readline.createInterface({ input: process.stdin });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const response = await handleMessage(line, toolsByName, ctx);
    if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
  }
}

async function handleMessage(
  line: string,
  toolsByName: Map<string, (typeof TOOLS)[number]>,
  ctx: { url: string; fetchImpl?: typeof fetch },
): Promise<JsonRpcResponse | null> {
  const req = parseRequest(line);
  if (!req) return failure(null, PARSE_ERROR, "Invalid JSON-RPC request");

  if (req.method === "initialize") {
    return success(req.id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "anki-xml", version: MCP_VERSION },
    });
  }
  if (req.method === "notifications/initialized" || req.method === "ping") {
    return success(req.id, {});
  }
  if (req.method === "tools/list") {
    return success(req.id, {
      tools: [...toolsByName.values()].map((t) => ({
        name: t.name,
        tier: t.tier,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    });
  }
  if (req.method === "tools/call") {
    const params = (req.params ?? {}) as Record<string, unknown>;
    const name = params["name"];
    const tool = typeof name === "string" ? toolsByName.get(name) : undefined;
    if (!tool) {
      return failure(req.id, METHOD_NOT_FOUND, `Unknown tool: ${String(name)}`);
    }
    const toolParams = (params["arguments"] ?? {}) as Record<string, unknown>;
    try {
      const result = await tool.handler(toolParams, ctx);
      return success(req.id, {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        isError: false,
      });
    } catch (err) {
      if (err instanceof McpToolError) {
        return failure(req.id, INVALID_PARAMS, err.message);
      }
      return failure(req.id, INTERNAL_ERROR, (err as Error).message, toolErrorData(err));
    }
  }

  return failure(req.id, METHOD_NOT_FOUND, `Method not found: ${req.method}`);
}
