import { describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { handleMessage, parseRequest } from "@anki-xml/mcp";
import { TOOLS, McpToolError, toolErrorData, ankiConnectErrorData } from "@anki-xml/mcp";
import { AnkiConnectError } from "@anki-xml/anki";

function jsonResponse(result: unknown, error: string | null = null) {
  return {
    ok: true,
    json: async () => ({ result, error }),
  } as unknown as Response;
}

function mockClient(
  handler: (action: string, params: Record<string, unknown>) => Promise<unknown>,
) {
  const calls: { action: string; params: Record<string, unknown> }[] = [];
  return {
    fetchImpl: async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        action: string;
        params: Record<string, unknown>;
      };
      calls.push({ action: body.action, params: body.params ?? {} });
      return jsonResponse(await handler(body.action, body.params ?? {}));
    },
    calls,
  };
}

const ctx = {
  url: "http://127.0.0.1:8765",
  fetchImpl: async () => jsonResponse([]),
};

describe("mcp protocol", () => {
  it("parses valid requests", () => {
    const req = parseRequest('{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}');
    expect(req).toEqual({ id: 1, method: "tools/list", params: {} });
  });

  it("rejects invalid JSON", () => {
    expect(parseRequest("not json")).toBeNull();
  });

  it("returns undefined for notifications (no id)", () => {
    expect(parseRequest('{"jsonrpc":"2.0","method":"notifications/initialized"}')).toBeUndefined();
  });

  it("parses requests with an explicit null id (JSON-RPC 2.0 allows it)", () => {
    expect(parseRequest('{"jsonrpc":"2.0","id":null,"method":"ping"}')).toEqual({
      id: null,
      method: "ping",
      params: undefined,
    });
  });
});

describe("mcp server", () => {
  const toolsByName = new Map(TOOLS.map((t) => [t.name, t]));

  it("produces NO response for a notification", async () => {
    const resp = await handleMessage(
      '{"jsonrpc":"2.0","method":"notifications/initialized"}',
      toolsByName,
      ctx,
    );
    expect(resp).toBeNull();
  });

  it("produces PARSE_ERROR for invalid JSON", async () => {
    const resp = await handleMessage("not json", toolsByName, ctx);
    expect(resp).toEqual({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "Invalid JSON-RPC request" },
    });
  });

  it("replies to requests that carry an id (ping)", async () => {
    const resp = await handleMessage('{"jsonrpc":"2.0","id":7,"method":"ping"}', toolsByName, ctx);
    expect(resp).toMatchObject({ id: 7, result: {} });
    expect(resp?.error).toBeUndefined();
  });

  it("replies to requests whose id is explicitly null", async () => {
    const resp = await handleMessage('{"jsonrpc":"2.0","id":null,"method":"ping"}', toolsByName, ctx);
    expect(resp).toEqual({ jsonrpc: "2.0", id: null, result: {} });
  });

  it("treats a missing id key as a notification even for ping", async () => {
    const resp = await handleMessage('{"jsonrpc":"2.0","method":"ping"}', toolsByName, ctx);
    expect(resp).toBeNull();
  });
});

describe("mcp tools", () => {
  it("lists exactly 5 tools (validate_xml, sync, doctor, diff, list_decks)", () => {
    const names = TOOLS.map((t) => t.name).sort();
    expect(names).toEqual(["diff", "doctor", "list_decks", "sync", "validate_xml"]);
    expect(TOOLS).toHaveLength(5);
    // removed tools are absent
    expect(names).not.toContain("import_xml");
    expect(names).not.toContain("add_note");
    expect(names).not.toContain("add_notes");
    expect(names).not.toContain("plan_import");
    expect(names).not.toContain("open_anki");
    expect(names).not.toContain("list_models");
    expect(names).not.toContain("find_notes");
    expect(names).not.toContain("get_tags");
    expect(names).not.toContain("add_tags");
    expect(names).not.toContain("remove_tags");
    expect(names).not.toContain("store_media");
    expect(names).not.toContain("get_media");
    expect(names).not.toContain("collection_stats");
  });

  it("assigns every tool a P0/P1/P2 tier per the spec (internal) and exposes tier via _meta not top-level", async () => {
    const p0 = TOOLS.filter((t) => t.tier === "P0").map((t) => t.name);
    const p1 = TOOLS.filter((t) => t.tier === "P1").map((t) => t.name);
    const p2 = TOOLS.filter((t) => t.tier === "P2").map((t) => t.name);
    expect(p0.sort()).toEqual(["doctor", "list_decks", "validate_xml"]);
    expect(p1.sort()).toEqual(["diff", "sync"]);
    expect(p2).toEqual([]);
    expect(TOOLS.every((t) => ["P0", "P1", "P2"].includes(t.tier))).toBe(true);

    // wire format: tier moved to _meta, not top-level, and annotations present
    const toolsByName = new Map(TOOLS.map((t) => [t.name, t]));
    const resp = await handleMessage('{"jsonrpc":"2.0","id":1,"method":"tools/list"}', toolsByName, ctx);
    const tools = (resp as unknown as { result: { tools: Record<string, unknown>[] } }).result.tools;
    expect(tools).toHaveLength(5);
    for (const t of tools) {
      expect(t).not.toHaveProperty("tier");
      expect(t).toHaveProperty("_meta");
      expect((t["_meta"] as Record<string, unknown>)).toHaveProperty("tier");
      expect(t).toHaveProperty("annotations");
      const ann = t["annotations"] as Record<string, unknown>;
      expect(ann).toHaveProperty("readOnlyHint");
      expect(ann).toHaveProperty("destructiveHint");
      expect(ann).toHaveProperty("idempotentHint");
      expect(ann).toHaveProperty("openWorldHint");
      expect(t).toHaveProperty("title");
      // inputSchema must have additionalProperties:false
      const schema = t["inputSchema"] as Record<string, unknown>;
      expect(schema["additionalProperties"]).toBe(false);
    }
  });

  it("validate_xml validates a temp file", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-"));
    const file = path.join(dir, "ok.xml");
    await fs.writeFile(
      file,
      `<anki deck="T"><note type="Basic"><front>a</front><back>b</back></note></anki>`,
    );
    const tool = TOOLS.find((t) => t.name === "validate_xml")!;
    const result = await tool.handler({ file }, ctx);
    expect(result).toMatchObject({ ok: true, noteCount: 1 });
  });

  it("list_decks returns deck names via mocked AnkiConnect", async () => {
    const { fetchImpl } = mockClient(async (action) => {
      if (action === "deckNames") return ["Default", "Japanese"];
      throw new Error(`unexpected ${action}`);
    });
    const tool = TOOLS.find((t) => t.name === "list_decks")!;
    const result = await tool.handler({}, { url: "http://x", fetchImpl });
    expect(result).toEqual(["Default", "Japanese"]);
  });

  it("rejects missing required params with McpToolError", async () => {
    const tool = TOOLS.find((t) => t.name === "validate_xml")!;
    await expect(tool.handler({}, ctx)).rejects.toBeInstanceOf(McpToolError);
  });

  it("initialize advertises protocolVersion 2025-06-18", async () => {
    const toolsByName = new Map(TOOLS.map((t) => [t.name, t]));
    const resp = await handleMessage('{"jsonrpc":"2.0","id":1,"method":"initialize"}', toolsByName, ctx);
    expect((resp as unknown as { result: { protocolVersion: string } }).result.protocolVersion).toBe("2025-06-18");
  });

  it("toolErrorData/ankiConnectErrorData exposes hints + cause for AI agents", () => {
    const err = new AnkiConnectError("Failed to reach", {
      reachable: false,
      cause: "refused",
      url: "http://x",
      detail: "d",
      hints: ["Start Anki"],
      suggestion: "anki-import doctor",
    });
    expect(ankiConnectErrorData(err)).toEqual({
      code: "ANKICONNECT_ERROR",
      message: "Failed to reach",
      hints: ["Start Anki"],
      suggestion: "anki-import doctor",
      cause: "refused",
    });
    expect(toolErrorData).toBe(ankiConnectErrorData);
  });
});
