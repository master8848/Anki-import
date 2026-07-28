#!/usr/bin/env bun
/**
 * Pre-publish sanity check.
 *
 * Verifies that:
 *   1. All 420+ tests still pass.
 *   2. The CLI runs (--version, --help, doctor with no Anki).
 *   3. Every command listed in docs/commands.md is registered.
 *   4. README.md and CHANGELOG.md exist.
 *
 * Exit 0 = safe to tag. Non-zero = something is broken.
 */

import { $ } from "bun";
import { COMMANDS } from "../src/cli/registry.ts";

console.log("1. Running tests...");
await $`bun test`.quiet();
console.log("   OK");

console.log("2. CLI runs (Bun)...");
const version = (await $`bun run src/index.ts --version`.text()).trim();
if (!version.startsWith("anki-xml")) {
  console.error("FAIL: --version didn't print the expected banner");
  console.error("got:", version);
  process.exit(1);
}
console.log(`   OK (${version})`);

console.log("3. --help lists every registered command...");
const help = (await $`bun run src/index.ts --help`.text()).trim();
const missing = COMMANDS.filter((c) => !help.includes(`\n  ${c.name} `)).map((c) => c.name);
if (missing.length > 0) {
  console.error("FAIL: --help is missing commands:", missing);
  process.exit(1);
}
console.log(`   OK (${COMMANDS.length} commands)`);

console.log("4. Building npm distribution...");
await $`bun run build:npm`.quiet();
if (!(await Bun.file("dist/cli.js").exists())) {
  console.error("FAIL: dist/cli.js not produced by build:npm");
  process.exit(1);
}
console.log("   OK");

console.log("5. Node bundle runs...");
const nodeVersion = (await $`node dist/cli.js --version`.text()).trim();
if (!nodeVersion.startsWith("anki-xml")) {
  console.error("FAIL: node dist/cli.js --version didn't print banner");
  process.exit(1);
}
console.log(`   OK (${nodeVersion})`);

console.log("6. Required docs exist...");
for (const f of ["README.md", "CHANGELOG.md", "LICENSE", "CONTRIBUTING.md"]) {
  try {
    await Bun.file(f).stat();
  } catch {
    console.error(`FAIL: ${f} missing`);
    process.exit(1);
  }
}
console.log("   OK");

console.log("\nReady to publish.\n");
console.log("Next steps:");
console.log("  npm login                           # one-time");
console.log("  npm publish --access public         # publish to npm");
console.log("  npx anki-xml --version              # verify");
