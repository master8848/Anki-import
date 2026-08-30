import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";

export const ANKICONNECT_CODE = "2055492159";
export const ANKICONNECT_DOWNLOAD_URL =
  "https://ankiweb.net/shared/download/2055492159?v=2.1&p=0";

/** Determine Anki addon directory for 2055492159 */
export function addonDir(platform = process.platform): string {
  const code = ANKICONNECT_CODE;
  const baseOverride = process.env.ANKI_BASE;
  if (baseOverride) {
    return join(baseOverride, "addons21", code);
  }

  if (platform === "darwin") {
    const home = homedir();
    return join(home, "Library", "Application Support", "Anki2", "addons21", code);
  }

  if (platform === "win32") {
    const appData = process.env.APPDATA || join(homedir(), "AppData", "Roaming");
    return join(appData, "Anki2", "addons21", code);
  }

  // linux
  const xdg = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
  return join(xdg, "Anki2", "addons21", code);
}

export function addonsBaseDir(platform = process.platform): string {
  const dir = addonDir(platform);
  // strip trailing /2055492159 to get addons21
  return join(dir, "..");
}

export function isAddonInstalled(platform = process.platform): boolean {
  const dir = addonDir(platform);
  if (!existsSync(dir)) return false;
  // Check at least one file exists or meta
  try {
    const stat = existsSync(join(dir, "meta.json")) || existsSync(dir);
    return stat;
  } catch {
    return false;
  }
}

export function isAddonEnabled(platform = process.platform): boolean {
  const metaPath = join(addonDir(platform), "meta.json");
  if (!existsSync(metaPath)) return true; // no meta means enabled by default
  try {
    const raw = readFileSync(metaPath, "utf8");
    const data = JSON.parse(raw) as { disabled?: boolean };
    return data.disabled !== true;
  } catch {
    return true;
  }
}

export function enableAddon(platform = process.platform): void {
  const dir = addonDir(platform);
  const metaPath = join(dir, "meta.json");
  mkdirSync(dir, { recursive: true });
  let data: Record<string, unknown> = {};
  if (existsSync(metaPath)) {
    try {
      data = JSON.parse(readFileSync(metaPath, "utf8")) as Record<string, unknown>;
    } catch {
      data = {};
    }
  }
  data["disabled"] = false;
  // ensure minimal fields
  if (!data["config"]) data["config"] = {};
  writeFileSync(metaPath, JSON.stringify(data, null, 2), "utf8");
}

/**
 * Filesystem method: download AnkiConnect and unzip to addon dir.
 * Uses fetch (Node 20) to follow redirect, saves to temp file, then unzips via platform tools.
 */
export async function installAddon(platform = process.platform): Promise<void> {
  const dir = addonDir(platform);
  mkdirSync(dir, { recursive: true });

  // download
  const tmpZip = join(dir, "..", `.${ANKICONNECT_CODE}.zip`);
  try {
    await downloadFile(ANKICONNECT_DOWNLOAD_URL, tmpZip);
  } catch (err) {
    throw new Error(
      `Failed to download AnkiConnect ${ANKICONNECT_CODE} from ${ANKICONNECT_DOWNLOAD_URL}: ${(err as Error).message}. Hint: check network or install manually from https://ankiweb.net/shared/info/2055492159`,
    );
  }

  // unzip
  try {
    unzipFile(tmpZip, dir, platform);
  } catch (err) {
    throw new Error(
      `Failed to unzip AnkiConnect to ${dir}: ${(err as Error).message}. Try manually: download https://ankiweb.net/shared/download/2055492159 and unzip to ${dir}`,
    );
  } finally {
    // clean up zip if exists
    try {
      const { unlinkSync } = await import("node:fs");
      if (existsSync(tmpZip)) unlinkSync(tmpZip);
    } catch {}
  }

  // ensure enabled
  enableAddon(platform);
}

async function downloadFile(url: string, dest: string): Promise<void> {
  // Use global fetch with redirect follow
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  // Write stream to file
  const fileStream = createWriteStream(dest);
  // @ts-ignore - body is web stream
  await pipeline(res.body as unknown as NodeJS.ReadableStream, fileStream);
}

function unzipFile(zipPath: string, destDir: string, platform: string): void {
  mkdirSync(destDir, { recursive: true });

  // Try unzip command
  if (platform !== "win32") {
    try {
      execSync(`unzip -o "${zipPath}" -d "${destDir}"`, { stdio: "ignore", timeout: 30000 });
      return;
    } catch {}
    // Fallback to python
    try {
      execSync(`python3 -c "import zipfile; zipfile.ZipFile('${zipPath.replace(/'/g, "'\\''")}').extractall('${destDir.replace(/'/g, "'\\''")}')"`, {
        stdio: "ignore",
        timeout: 30000,
      });
      return;
    } catch {}
    try {
      execSync(`python -c "import zipfile; zipfile.ZipFile('${zipPath.replace(/'/g, "'\\''")}').extractall('${destDir.replace(/'/g, "'\\''")}')"`, {
        stdio: "ignore",
        timeout: 30000,
      });
      return;
    } catch {}
  } else {
    // Windows: try powershell Expand-Archive
    try {
      execSync(
        `powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`,
        { stdio: "ignore", timeout: 30000 },
      );
      return;
    } catch {}
    // Try unzip if available (git bash)
    try {
      execSync(`unzip -o "${zipPath}" -d "${destDir}"`, { stdio: "ignore", timeout: 30000 });
      return;
    } catch {}
  }

  throw new Error("No unzip tool available (tried unzip, python3, powershell Expand-Archive)");
}

export function quitAnki(platform = process.platform): void {
  try {
    if (platform === "darwin") {
      try {
        execSync('osascript -e \'tell application "Anki" to quit\'', {
          stdio: "ignore",
          timeout: 5000,
        });
        return;
      } catch {}
      execSync("pkill -x Anki || pkill -f Anki || true", { stdio: "ignore", timeout: 5000, shell: "/bin/sh" });
    } else if (platform === "win32") {
      execSync('taskkill /IM anki.exe /F 2>nul || taskkill /IM Anki.exe /F 2>nul || exit 0', {
        stdio: "ignore",
        timeout: 5000,
        shell: "cmd.exe",
      });
    } else {
      execSync("pkill -x anki || pkill -x anki-desktop || pkill -f Anki || true", {
        stdio: "ignore",
        timeout: 5000,
        shell: "/bin/sh",
      });
    }
  } catch {}
}
