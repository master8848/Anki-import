/**
 * Smoke-test the MCP server: initialize → tools/list → validate_xml.
 * Usage: node scripts/smoke-mcp.mjs [file]
 */

import { spawn } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const file = process.argv[2] ?? path.join(root, "examples", "basic.xml");
const cli = path.join(root, "dist", "cli.js");

const child = spawn("node", [cli, "mcp"], { stdio: ["pipe", "pipe", "inherit"] });

const requests = [
  { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
  { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
  { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "validate_xml", arguments: { file } } },
];

let out = "";
child.stdout.on("data", (d) => {
  out += d.toString();
  while (true) {
    const nl = out.indexOf("\n");
    if (nl === -1) return;
    const line = out.slice(0, nl).trim();
    out = out.slice(nl + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    if (msg.id === 1) console.log(`ok  initialize: ${msg.result.serverInfo.name} ${msg.result.protocolVersion}`);
    else if (msg.id === 2) console.log(`ok  tools/list: ${msg.result.tools.length} tools`);
    else if (msg.id === 3) {
      const text = msg.result?.content?.[0]?.text ?? JSON.stringify(msg.error);
      console.log(`ok  validate_xml: ${text.slice(0, 60)}`);
      child.kill();
      process.exit(0);
    }
  }
});

child.stdin.on("error", () => undefined);
requests.forEach((r) => child.stdin.write(JSON.stringify(r) + "\n"));

setTimeout(() => {
  console.error("FAIL: MCP smoke test timed out");
  child.kill();
  process.exit(1);
}, 10_000);
