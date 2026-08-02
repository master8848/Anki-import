import { build } from "esbuild";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const OUT = "dist/cli.js";
const SHEBANG = "#!/usr/bin/env node\n";

await fs.mkdir("dist", { recursive: true });

await build({
  entryPoints: ["packages/cli/src/index.ts"],
  outfile: OUT,
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  banner: { js: SHEBANG.trimEnd() },
  packages: "bundle",
  external: ["yaml", "csv-parse"],
  sourcemap: false,
  minify: false,
  logLevel: "info",
});

await fs.chmod(OUT, 0o755);
const size = (await fs.stat(OUT)).size;
console.log(`Built ${OUT} (${Math.round(size / 1024)} KB)`);
console.log(`Run: node ${path.normalize(OUT)} --help`);
