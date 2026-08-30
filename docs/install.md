# Install

## Quick start

Set up everything with `npx anki-xml init` — it installs AnkiConnect (2055492159) automatically.
See [`docs/init.md`](init.md) for options and details.

---

Two active install methods (npm is **not published yet** — build from
source until the first npm release; see `docs/release-checklist.md`):

| Method | Prerequisite | Bundle | Best for |
|---|---|---|---|
| `npm install -g` or `npx` (when published) | Node ≥ 20 | single ESM bundle (`dist/cli.js`) | Most users, CI, agents |
| Build from source | Node ≥ 20 + pnpm ≥ 10 | source + `dist/cli.js` | Contributors, unreleased features |

## npm / npx (recommended — once published)

```sh
npm install -g anki-xml
npx anki-xml --help
```

The package ships a single self-contained ESM bundle (`dist/cli.js`)
with two bins: `anki-import` and `anki-xml`. All dependencies are
inlined; no `node_modules` install, no native bindings. Verify:

```sh
npx anki-xml --version        # anki-xml v0.0.4
npx anki-xml doctor           # verify environment
```

## Build from source (current way)

```sh
git clone https://github.com/master8848/Anki-import
cd Anki-import
pnpm install
pnpm build              # esbuild → dist/cli.js (ESM, Node ≥ 20)
node dist/cli.js --version
```

Useful when:

- You're contributing to the project
- You need an unreleased feature
- You want to read the source

## Choosing between methods

- **Just want to use it now?** Build from source, then use
  `node dist/cli.js` or `pnpm start` during development.
- **CI / agents / scripting?** Once published: `npm install -g anki-xml`.
- **Developing?** Clone + `pnpm install` + `pnpm start`
  (or `pnpm doctor`).

## Updating

After updating, re-run `anki-xml doctor` to confirm the new version
still talks to AnkiConnect:

```sh
npm update -g anki-xml
anki-xml doctor
```

## Uninstalling

```sh
npm uninstall -g anki-xml
```

Local checkpoints live in `$XDG_DATA_HOME/anki-import/checkpoints`
(default `~/.local/share/anki-import/`) and are **not removed** by
uninstall:

```sh
rm -rf ~/.local/share/anki-import
```
