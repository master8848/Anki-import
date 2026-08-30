import { defineConfig } from "@rslib/core";

export default defineConfig({
  lib: [
    {
      bundle: true,
      format: "esm",
      syntax: "es2022",
      banner: {
        js: "#!/usr/bin/env node",
      },
      autoExternal: false,
      dts: false,
    },
  ],
  source: {
    entry: {
      cli: "./packages/cli/src/index.ts",
    },
    tsconfigPath: "./tsconfig.json",
  },
  output: {
    target: "node",
    distPath: {
      root: "./dist",
    },
    filename: {
      js: "cli.js",
    },
    externals: ["yaml", "csv-parse"],
    cleanDistPath: false,
    sourceMap: false,
  },
});
