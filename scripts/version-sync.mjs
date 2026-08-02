/**
 * Sync the version across the monorepo: root package.json, every
 * workspace package.json under packages/, apps/playground/package.json,
 * and the VERSION constant in packages/cli/src/help.ts.
 *
 * Usage: node scripts/version-sync.mjs <version>
 */

import * as fs from "node:fs";
import * as path from "node:path";

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+/.test(version)) {
  console.error("usage: node scripts/version-sync.mjs <version>");
  process.exit(1);
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n");
}

let updated = 0;

const rootPkg = readJson("package.json");
rootPkg.version = version;
writeJson("package.json", rootPkg);
updated++;

for (const dir of fs.readdirSync("packages")) {
  const p = path.join("packages", dir, "package.json");
  if (!fs.existsSync(p)) continue;
  const pkg = readJson(p);
  if (pkg.version === version) continue;
  pkg.version = version;
  writeJson(p, pkg);
  updated++;
}

for (const dir of fs.readdirSync("apps")) {
  const p = path.join("apps", dir, "package.json");
  if (!fs.existsSync(p)) continue;
  const pkg = readJson(p);
  if (pkg.version === version) continue;
  pkg.version = version;
  writeJson(p, pkg);
  updated++;
}

const helpPath = "packages/cli/src/help.ts";
const help = fs.readFileSync(helpPath, "utf8");
const nextHelp = help.replace(/export const VERSION = "[^"]+";/, `export const VERSION = "${version}";`);
if (nextHelp !== help) {
  fs.writeFileSync(helpPath, nextHelp);
  updated++;
}

console.log(`version ${version} synced across ${updated} files`);
