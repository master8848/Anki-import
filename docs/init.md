# `anki-import init` — zero-click setup

One command to get Anki + AnkiConnect ready. Running `anki-import init` with **no flags already installs and enables AnkiConnect** [2055492159](https://ankiweb.net/shared/download/2055492159) — zero-click, no `--addon` flag needed. Only AnkiConnect is managed (no other add-ons). Add `--install-anki` only if you also want the Anki binary auto-installed.

## When to run it

- **First time** on a new machine — before `doctor`, `import`, or `sync`.
- **CI / fresh containers** — with `--install-anki --yes` for unattended setup.
- **After reinstalling Anki** — re-registers the add-on if the profile was wiped.
- Anytime `doctor` reports Anki or AnkiConnect missing.

## Quick start

```sh
npx anki-xml init                         # default: installs+enables AnkiConnect 2055492159
node dist/cli.js init                     # from source checkout (same default)
npx anki-xml init --install-anki          # also auto-install Anki binary if missing
npx anki-xml init --addon-only            # shortcut: skip Anki binary check, same addon install
```

Plain `init` without args = check Anki on PATH + install/enable AnkiConnect + `doctor` verification. `--install-anki` only adds auto-install of the Anki app itself. `--addon-only` is just a shortcut that skips step 1 when you know Anki is already installed — the addon work is identical.

## Per-OS install paths

| OS | Command (`--install-anki`) | Notes |
|---|---|---|
| **macOS** | `brew install --cask anki` | Installs Homebrew first if missing. |
| **Windows** | `winget install --id Anki.Anki -e --silent` → `choco install anki -y` fallback | Prefers winget. |
| **Linux** | `flatpak install -y flathub net.ankiweb.Anki` (preferred) · `pacman -S anki` · `apt install anki` (often outdated) · tarball from `apps.ankiweb.net` | Flatpak recommended; `sudo` only when needed. |

Without `--install-anki`, `init` just checks Anki on `PATH` and fails with hints if missing — but still proceeds to install/enable AnkiConnect when Anki is found.

## What it does

1. Check Anki installed → install via OS path above only if `--install-anki`.
2. Launch Anki if not already running.
3. Wait for AnkiConnect (`http://127.0.0.1:8765`, `--url` to override) until `--timeout` (default 60 s).
4. **Always** download add-on zip from `https://ankiweb.net/shared/download/2055492159` (skipped only by `--check`).
5. **Always** unzip to `addons21/2055492159` in the Anki data folder.
6. **Always** ensure `addons21/2055492159/meta.json` has `{"disabled": false}` (enable).
7. Restart Anki so the add-on loads.
8. Run `doctor` verification — confirms AnkiConnect answers `version`.

Steps 4–6 run on every `init` (no flag needed) unless `--check`. `--addon-only` skips step 1; `--force` re-downloads even if present.

## Flags

| Flag | Description |
|---|---|
| `--install-anki` / `--no-install-anki` | Auto-install the Anki binary itself if missing. AnkiConnect 2055492159 is **always** installed/enabled by default regardless of this flag. |
| `--addon-only` | Skip Anki binary check/install; only install/enable AnkiConnect (shortcut when Anki is already installed — plain `init` does the same addon work). |
| `--check` | Dry run — report what would happen. |
| `--force` | Re-download even if add-on exists. |
| `--yes`, `-y` | Skip prompts (CI). |
| `--timeout <ms>` | Wait for AnkiConnect (default 60000). |
| `--url <url>` | AnkiConnect URL (default `http://127.0.0.1:8765`). |

Human-readable output is the default; `--json` is still supported.

## Output examples

Success:
```
✔ Anki 24.06.3 installed (brew --cask anki)
✔ AnkiConnect 2055492159 installed → ~/Library/Application Support/Anki2/addons21/2055492159
✔ Anki restarted
✔ AnkiConnect responding — version 6 (http://127.0.0.1:8765)
init complete — run `anki-import doctor` to verify
```
Already installed / `--check` / failure:
```
✔ Anki already installed (24.06.3) — AnkiConnect already installed — version 6
nothing to do
[check] Anki not found — would run: brew install --cask anki
[check] AnkiConnect not found — would download 2055492159
[check] no changes made
✖ Anki not found and no installer available for this platform
  hint: install Anki from https://apps.ankiweb.net then re-run: anki-import init --addon-only
```

## Troubleshooting

- **brew not found (macOS):** install Homebrew via official script, then re-run `init --install-anki`.
- **winget missing (Windows):** install App Installer from Microsoft Store or `choco install anki -y`.
- **sudo / permission denied (Linux):** re-run with `sudo` or `flatpak install --user flathub net.ankiweb.Anki` (no sudo).
- **Flatpak add-on not found:** check `~/.var/app/net.ankiweb.Anki/data/Anki2/addons21`; restart Anki.
- **Windows SmartScreen blocks installer:** More info → Run anyway, or download from `apps.ankiweb.net`.
- **Add-on requires restart:** `init` restarts automatically; if manual install, fully quit and reopen Anki.

Next: `anki-import doctor` → `anki-import import <file>`.
