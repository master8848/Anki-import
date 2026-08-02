import { startMcpServer } from "@anki-xml/mcp";

/** MCP runs over stdio — nothing may be written to stdout except JSON-RPC. */
export async function runMcpCommand(): Promise<number> {
  const done = startMcpServer();
  // The server never settles on its own; index.ts defers exit on SIGINT to
  // protect in-flight applies, so this command exits itself on Ctrl+C.
  process.once("SIGINT", () => process.exit(130));
  await done;
  return 0;
}
