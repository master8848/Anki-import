# anki-import init

One command that sets up Anki and connects it to anki-xml. It installs AnkiConnect (2055492159) automatically — you don't need any extra flag. AnkiConnect Plus (2036732292) is also supported: either add-on is ok, but the default install is 2055492159 (more stable).

## Quick start

```sh
npx anki-xml init              # set everything up
npx anki-xml init --check      # see what would happen
npx anki-xml init --yes        # skip confirmations
```

## What happens when you run it

1. Checks if Anki is installed — installs it if missing.
2. Checks AnkiConnect — if either AnkiConnect (2055492159) or AnkiConnect Plus (2036732292) is already installed and enabled, skips install (either is ok). Otherwise installs and enables the default AnkiConnect (2055492159). If both are enabled, warns about port 8765 conflict but still considers it ok.
3. Restarts Anki so the add-on loads.
4. Verifies the connection works (including API version ≥ 6; if stale, reinstalls 2055492159).

## Flags

| Flag | What it does |
|---|---|
| `--skip-anki-install` | Don't install Anki, only set up AnkiConnect |
| `--update-anki` | Update Anki if an older version is found |
| `--check` | Show what would happen without changing anything |
| `--yes` | Skip all questions (good for scripts) |

## Per-OS notes

| System | How Anki is installed |
|---|---|
| macOS | via `brew install --cask anki` |
| Windows | via `winget install Anki.Anki` |
| Linux | via `flatpak install flathub net.ankiweb.Anki` |

If Anki is too old, init tells you and asks if you want to update (use `--update-anki` to update automatically, or `--yes` to accept).

If install fails, install Anki by hand from [apps.ankiweb.net](https://apps.ankiweb.net) and then run:

```sh
npx anki-xml init --skip-anki-install
```

## Troubleshooting

- Anki doesn't appear after install — open it once by hand, then run `init` again.
- AnkiConnect not responding — fully quit and reopen Anki, then run `npx anki-xml doctor`.
- Permission error on Linux — try `flatpak install --user flathub net.ankiweb.Anki`.
- Which AnkiConnect? Either `2055492159` (AnkiConnect, default, more stable) or `2036732292` (AnkiConnect Plus) works. `init` defaults to `2055492159`. `doctor` reports which one is enabled; if both are enabled it warns about port 8765 conflict.
