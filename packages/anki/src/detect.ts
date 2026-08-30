import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { WIN32_EXE_CANDIDATES } from "./launch.ts";

export const MIN_ANKI_VERSION = "23.10.0";

function commandExists(cmd: string, platform = process.platform): boolean {
  try {
    if (platform === "win32") {
      execSync(`where ${cmd}`, { stdio: "ignore" });
    } else {
      execSync(`which ${cmd}`, { stdio: "ignore" });
    }
    return true;
  } catch {
    return false;
  }
}

/** Check if Anki desktop app is installed. */
export function isAnkiInstalled(platform = process.platform): boolean {
  if (platform === "darwin") {
    if (existsSync("/Applications/Anki.app")) return true;
    if (commandExists("anki", platform)) return true;
    // open -a Anki check: try to resolve app via mdfind or just check open command can find it
    try {
      execSync("open -a Anki --help 2>&1 | head -1", { stdio: "ignore" });
      // if open exists, we still need Anki.app; fallback to checking via mdfind
    } catch {}
    // Try mdfind
    try {
      const out = execSync("mdfind 'kMDItemCFBundleIdentifier == net.ankiweb.dtop' 2>/dev/null", {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      if (out.trim().length > 0) return true;
    } catch {}
    return false;
  }

  if (platform === "win32") {
    for (const exe of WIN32_EXE_CANDIDATES) {
      if (existsSync(exe)) return true;
    }
    if (commandExists("anki", platform)) return true;
    try {
      execSync("where anki", { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }

  // linux
  if (commandExists("anki", platform)) return true;
  if (commandExists("anki-desktop", platform)) return true;
  try {
    const out = execSync("flatpak list 2>/dev/null | grep -q net.ankiweb.Anki && echo yes || echo no", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    if (out.trim() === "yes") return true;
  } catch {}
  // Also check flatpak list direct
  try {
    const out = execSync("flatpak list --app 2>/dev/null", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    if (out.includes("net.ankiweb.Anki")) return true;
  } catch {}
  return false;
}

/** Try to get Anki version string, e.g. "24.06.3". Returns null if not found. */
export function getAnkiVersion(platform = process.platform): string | null {
  // Try anki --version
  for (const cmd of ["anki --version", "anki-desktop --version"]) {
    try {
      const out = execSync(cmd, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 5000,
      });
      const v = parseVersionFromString(out);
      if (v) return v;
    } catch {}
  }

  if (platform === "darwin") {
    const plist = "/Applications/Anki.app/Contents/Info.plist";
    if (existsSync(plist)) {
      try {
        const content = readFileSync(plist, "utf8");
        const m = content.match(
          /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/,
        );
        if (m?.[1]) {
          const v = parseVersionFromString(m[1]);
          if (v) return v;
          return m[1].trim();
        }
      } catch {}
    }
  }

  return null;
}

function parseVersionFromString(s: string): string | null {
  const m = s.match(/(\d+\.\d+(?:\.\d+)?)/);
  return m?.[1] ?? null;
}

/** Compare two version strings. Returns <0 if a<b, 0 if equal, >0 if a>b */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((x) => parseInt(x, 10) || 0);
  const pb = b.split(".").map((x) => parseInt(x, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da - db;
  }
  return 0;
}

export function isVersionAtLeast(version: string, min: string): boolean {
  return compareVersions(version, min) >= 0;
}
