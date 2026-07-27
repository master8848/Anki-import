#!/usr/bin/env bun
/**
 * Build a standalone anki-xml binary.
 *
 * Usage:
 *   bun run scripts/build.ts           # build ./anki-xml
 *   bun run scripts/build.ts --out foo # build ./foo
 *
 * The output is a self-contained executable that bundles the CLI +
 * fast-xml-parser. No bun install required at runtime.
 *
 * Bun supports `bun build --compile` for native binaries. This
 * script wraps it so the output is reproducible across machines
 * that may have different Bun versions.
 */

import { $ } from "bun";

const args = process.argv.slice(2);
let out = "anki-xml";
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--out" && args[i + 1]) {
    out = args[i + 1]!;
    i++;
  }
}

console.log(`Building ${out} ...`);
await $`bun build --compile --target=bun --minify --outfile ${out} src/index.ts`.quiet();
console.log(`Built ${out}.`);

// Report the binary size.
const file = Bun.file(out);
const sizeKb = Math.round(file.size / 1024);
console.log(`Size: ${sizeKb} KB`);