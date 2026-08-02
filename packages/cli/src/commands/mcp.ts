import { startMcpServer } from "@anki-xml/mcp";

/** MCP runs over stdio — nothing may be written to stdout except JSON-RPC. */
export async function runMcpCommand(): Promise<number> {
  await startMcpServer();
  return 0;
}
