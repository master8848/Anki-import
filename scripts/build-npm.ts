#!/usr/bin/env bun
/**
 * Build the npm distribution.
 *
 * Outputs:
 *   dist/cli.js     - Node-compatible bundle, single file, ~180 KB
 *                     (includes fast-xml-parser), with a shebang
 *                     pointing at node.
 *
 * Usage:
 *   bun run build:npm           # build ./dist/cli.js
 *
 * To publish:
 *   1. Verify:   bun run publish:check
 *   2. Login:    npm login
 *   3. Publish:  npm publish --access public
 *   4. Verify:   npx anki-xml --version
 */

import { $ } from "bun";
import * as fs from "node:fs/promises";

const OUT = "dist/cli.js";
const SHEBANG = "#!/usr/bin/env node";

console.log("1. Bundling for Node...");
await $`bun build --target=node --format=cjs src/index.ts --bundle --minify --outfile ${OUT}`.quiet();

console.log("2. Adding shebang...");
const content = await fs.readFile(OUT, "utf8");
if (!content.startsWith(SHEBANG)) {
  await fs.writeFile(OUT, SHEBANG + "\n" + content);
}

console.log("3. Marking executable...");
await fs.chmod(OUT, 0o755);

const sizeKb = Math.round((await Bun.file(OUT).stat()).size / 1024);
console.log(`   Built ${OUT} (${sizeKb} KB)`);

console.log("\nTo publish:");
console.log("  bun run publish:check");
console.log("  npm publish --access public");
console.log("  npx anki-xml --version");
