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
  it("lists P0 tools including import_xml and doctor", () => {
    const names = TOOLS.map((t) => t.name);
    expect(names).toContain("import_xml");
    expect(names).toContain("validate_xml");
    expect(names).toContain("doctor");
    expect(names).toContain("list_decks");
    expect(names).toContain("list_models");
    expect(names).toContain("open_anki");
    expect(names).toContain("plan_import");
    expect(names).toContain("sync");
    expect(names).toContain("collection_stats");
  });

  it("assigns every tool a P0/P1/P2 tier per the spec", () => {
    const p0 = TOOLS.filter((t) => t.tier === "P0").map((t) => t.name);
    const p1 = TOOLS.filter((t) => t.tier === "P1").map((t) => t.name);
    const p2 = TOOLS.filter((t) => t.tier === "P2").map((t) => t.name);
    expect(p0.sort()).toEqual(["doctor", "import_xml", "list_decks", "list_models", "validate_xml"]);
    expect(p1.sort()).toEqual([
      "add_note",
      "add_notes",
      "add_tags",
      "diff",
      "find_notes",
      "get_tags",
      "open_anki",
      "plan_import",
      "remove_tags",
      "sync",
    ]);
    expect(p2.sort()).toEqual(["collection_stats", "get_media", "store_media"]);
    expect(TOOLS.every((t) => ["P0", "P1", "P2"].includes(t.tier))).toBe(true);
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

  it("plan_import dry-runs against mocked collection", async () => {
    const { fetchImpl } = mockClient(async (action) => {
      if (action === "canAddNotes") return [true, true];
      if (action === "notesInfo") return [];
      throw new Error(`unexpected ${action}`);
    });
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mcp-"));
    const file = path.join(dir, "cards.yaml");
    await fs.writeFile(
      file,
      `deck: Japanese
notes:
  - front: こんにちは
    back: Hello
  - front: さようなら
    back: Goodbye
`,
    );
    const tool = TOOLS.find((t) => t.name === "plan_import")!;
    const result = await tool.handler({ file }, { url: "http://x", fetchImpl });
    const r = result as { add: unknown[] };
    expect(r.add).toHaveLength(2);
  });

  it("add_note validates params and forwards payload", async () => {
    const { fetchImpl, calls } = mockClient(async () => [123]);
    const tool = TOOLS.find((t) => t.name === "add_note")!;
    const result = await tool.handler(
      { deck: "D", model: "Basic", fields: { Front: "a" }, tags: "x y" },
      { url: "http://x", fetchImpl },
    );
    expect(result).toEqual({ id: 123 });
    expect(calls[0]!.action).toBe("addNotes");
    expect(calls[0]!.params["notes"]).toMatchObject([
      { deckName: "D", modelName: "Basic", fields: { Front: "a" }, tags: ["x", "y"] },
    ]);
  });

  it("rejects missing required params with McpToolError", async () => {
    const tool = TOOLS.find((t) => t.name === "add_note")!;
    await expect(tool.handler({}, ctx)).rejects.toBeInstanceOf(McpToolError);
  });

  it("store_media/get_media round-trip base64", async () => {
    const { fetchImpl } = mockClient(async (action, params) => {
      if (action === "storeMedia") return "ok";
      if (action === "retrieveMedia") return params["filename"] === "a.bin" ? Buffer.from("data").toString("base64") : "";
      throw new Error(`unexpected ${action}`);
    });
    const store = TOOLS.find((t) => t.name === "store_media")!;
    await store.handler({ filename: "a.bin", data_base64: Buffer.from("data").toString("base64") }, { url: "http://x", fetchImpl });
    const get = TOOLS.find((t) => t.name === "get_media")!;
    const result = await get.handler({ filename: "a.bin" }, { url: "http://x", fetchImpl });
    expect(result).toMatchObject({ filename: "a.bin", bytes: 4 });
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
