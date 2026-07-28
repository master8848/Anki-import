# Install

Three install methods. Pick based on your environment:

| Method | Prerequisite | Bundle | Best for |
|---|---|---|---|
| `npm install -g` or `npx` | Node ≥ 18 | 175 KB CommonJS | Most users, CI, agents |
| Standalone binary | none | ~62 MB native | Air-gapped, no runtime |
| Build from source | Bun ≥ 1.3 | source + dist | Contributors |

## npm / npx (recommended)

```sh
# Global install
npm install -g anki-xml

# No install
npx anki-xml --help
```

The npm package contains a **single self-contained CommonJS bundle**
(`dist/cli.js`, ~175 KB). All dependencies are inlined. No
`node_modules` install, no native bindings.

Verifies on:

- Node ≥ 18 (LTS)
- macOS, Linux, Windows
- Alpine / minimal containers

The bundle is produced by `bun run build:npm`, which calls
`bun build --target=node --format=cjs --bundle --minify`. The
output gets a `#!/usr/bin/env node` shebang and is marked
executable so `npm` symlinks it directly into your `bin`.

### Verify the install

```sh
npx anki-xml --version        # anki-xml v0.1.0
npx anki-xml --help           # grouped help
npx anki-xml doctor           # verify environment
```

### Updating

```sh
npm update -g anki-xml
```

To pin to a version:

```sh
npm install -g anki-xml@0.1.0
```

## Standalone binary

Single file. No runtime required. Cross-platform.

```sh
# macOS arm64
curl -L https://github.com/YOUR-USERNAME/anki-xml/releases/latest/download/anki-xml-darwin-arm64 \
  -o /usr/local/bin/anki-xml
chmod +x /usr/local/bin/anki-xml
anki-xml --version
```

Build the binary yourself with [Bun](https://bun.sh):

```sh
bun run build --out anki-xml
./anki-xml --version
```

Binaries are produced by GitHub Actions on every release and
attached as release artifacts. See the
[Releases page](https://github.com/YOUR-USERNAME/anki-xml/releases).

## Build from source

```sh
git clone https://github.com/YOUR-USERNAME/anki-xml
cd anki-xml
bun install
bun run build:npm       # dist/cli.js (for npm publish)
bun run build           # anki-xml (standalone binary)
```

Useful when:

- You're contributing to the project
- You need an unreleased feature
- You want to read the source

## Choosing between methods

- **Just want to use it now?** `npx anki-xml --help`. No install.
- **CI / agents / scripting?** `npm install -g anki-xml`. Then
  call it from anywhere.
- **Air-gapped?** Download the binary from Releases.
- **Developing?** Clone + `bun install` + `bun run start`.

## Updating

After updating, re-run `anki-xml doctor` to confirm the new
version still talks to AnkiConnect:

```sh
npm update -g anki-xml
anki-xml doctor
```

## Uninstalling

```sh
npm uninstall -g anki-xml
```

Local checkpoints and the audit log live in
`$XDG_DATA_HOME/anki-xml/` and are **not removed** by uninstall.
To wipe them:

```sh
rm -rf ~/.local/share/anki-xml
# config:
rm -rf ~/.config/anki-xml
```
