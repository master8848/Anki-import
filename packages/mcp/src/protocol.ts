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
  const error: NonNullable<JsonRpcResponse["error"]> = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: "2.0", id, error };
}

/**
 * Parse one message from a line.
 * Returns `undefined` for notifications (no reply is allowed — an
 * ABSENT `id` key, per JSON-RPC 2.0; `"id": null` on a request is valid
 * and must be answered), `null` for invalid JSON / malformed requests
 * (PARSE_ERROR), and the parsed request otherwise.
 */
export function parseRequest(raw: string): {
  id: number | string | null;
  method: string;
  params: unknown;
} | null | undefined {
  let msg: unknown;
  try {
    msg = JSON.parse(raw);
  } catch {
    return null;
  }
  if (msg === null || typeof msg !== "object") return null;
  const m = msg as Record<string, unknown>;
  if (m["jsonrpc"] !== "2.0" || typeof m["method"] !== "string") return null;
  if (!("id" in m)) return undefined; // notification — no response needed
  const id = m["id"] ?? null;
  if (id !== null && typeof id !== "number" && typeof id !== "string") return null;
  return { id, method: m["method"], params: m["params"] };
}
