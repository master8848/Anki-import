# Install

## Quick start

Set up everything with `npx anki-xml init` — it installs AnkiConnect (2055492159) automatically.
See [`docs/init.md`](init.md) for options and details.

---

Two install methods:

| Method | Prerequisite | Bundle | Best for |
|---|---|---|---|
| `npm install -g` or `npx` | Node ≥ 20 | single ESM bundle (`dist/cli.js`) | Most users, CI, agents |
| Build from source | Node ≥ 20 + bun ≥ 10 | source + `dist/cli.js` | Contributors, unreleased features |

## npm / npx (recommended)

```sh
npm install -g anki-xml
npx anki-xml --help
```

The package ships a single self-contained ESM bundle (`dist/cli.js`)
with two bins: `anki-import` and `anki-xml`. All dependencies are
inlined; no `node_modules` install, no native bindings. Verify:

```sh
npx anki-xml --version        # anki-xml v0.0.5
npx anki-xml doctor           # verify environment
```

## Build from source (for contributors / unreleased features)

```sh
git clone https://github.com/master8848/Anki-import
cd Anki-import
bun install
bun run build              # rslib → dist/cli.js (ESM, Node ≥ 20)
node dist/cli.js --version
```

Useful when:

- You're contributing to the project
- You need an unreleased feature
- You want to read the source

## Choosing between methods

- **Just want to use it?** `npm install -g anki-xml` or `npx anki-xml`.
- **CI / agents / scripting?** `npm install -g anki-xml` or `npx -y anki-xml`.
- **Developing?** Clone + `bun install` + `bun run start`
  (or `bun run doctor`).

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
