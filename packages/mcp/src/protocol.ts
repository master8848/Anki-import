/**
 * Minimal JSON-RPC 2.0 framing for the MCP stdio transport.
 * No SDK dependency — the protocol surface here is small and stable.
 */

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export const PARSE_ERROR = -32700;
export const INVALID_REQUEST = -32600;
export const METHOD_NOT_FOUND = -32601;
export const INVALID_PARAMS = -32602;
export const INTERNAL_ERROR = -32603;

export function success(id: number | string | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

export function failure(
  id: number | string | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  const resp: JsonRpcResponse = { jsonrpc: "2.0", id, error: { code, message } };
  if (data !== undefined) resp.error!.data = data;
  return resp;
}

/** Parse one message from a line. Returns null for notifications/batches. */
export function parseRequest(raw: string): {
  id: number | string | null;
  method: string;
  params: unknown;
} | null {
  let msg: unknown;
  try {
    msg = JSON.parse(raw);
  } catch {
    return null;
  }
  if (msg === null || typeof msg !== "object") return null;
  const m = msg as Record<string, unknown>;
  if (m["jsonrpc"] !== "2.0" || typeof m["method"] !== "string") return null;
  const id = m["id"] ?? null;
  if (id === null) return null; // notification — no response needed
  if (typeof id !== "number" && typeof id !== "string") return null;
  return { id, method: m["method"], params: m["params"] };
}
