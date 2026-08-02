# anki-import (`anki-xml`)

**Git + Terraform for Anki knowledge.** XML-first infrastructure-as-code
toolkit for managing Anki collections through structured data files.

Flashcards are treated as code: validate → plan → diff → apply →
checkpoint → rollback → sync.

**Current release: `0.0.4`**

This project is *not* an Anki replacement, a review app, or a GUI
automation tool. It speaks to Anki through
[AnkiConnect](https://foosoft.net/projects/anki-connect/) only.

## Install

```bash
npm install -g anki-xml@0.0.4
# or
npx anki-xml@0.0.4 doctor
```

Bins: `anki-import` and `anki-xml`. Requires **Node 20+**.

Contributor setup (from source): see [CONTRIBUTING.md](CONTRIBUTING.md).

## Quick start

Workflow: doctor → validate → plan → import → rollback.

```bash
anki-import doctor                        # diagnose AnkiConnect with fix steps
anki-import validate cards.xml            # validate without touching Anki
anki-import plan cards.xml                # preview changes vs collection
anki-import import cards.xml --dry-run    # validate + plan only
anki-import import cards.xml              # create notes (writes a checkpoint)
anki-import rollback import-1234          # undo with one command
```

```xml
<anki deck="Spanish">
  <note type="Basic">
    <field name="Front">Hola</field>
    <field name="Back">Hello</field>
  </note>
</anki>
```

## Supported input formats

XML is canonical, but the same workflow works with:

| Format     | Example                                  |
|------------|------------------------------------------|
| XML        | `examples/basic.xml`                     |
| YAML       | `examples/cards.yaml`                    |
| JSON       | `examples/cards.json`                    |
| Markdown   | `examples/cards.md`                      |
| CSV        | `examples/cards.csv`                     |

```bash
anki-import plan cards.yaml
anki-import sync cards.md --dry-run
```

## Commands

```
doctor · validate · plan · diff · import · sync · rollback ·
checkpoint · watch · tags · models · stats · media · benchmark · mcp
```

- `plan <file>` — dry-run preview: adds / updates / duplicates / unchanged
- `diff <file>` — per-note field diffs against the live collection
- `import <file>` — create notes only (writes a checkpoint)
- `sync [<file>]` — reconcile: create + update; without a file, report
  checkpoint drift
- `watch <file>` — auto re-validate on change, show the plan, ask before
  applying (`--yes` for agents)
- `mcp` — Model Context Protocol server over stdio (optional; 17 tools)
- `--json` — machine-readable output with stable error codes everywhere

## Troubleshooting AnkiConnect

`anki-import doctor` explains exactly what is wrong and what to do next:

```
[FAIL] anki-connect-reachable: Connection refused at http://127.0.0.1:8765 (ECONNREFUSED).
Fix:
  1. Start the Anki app — AnkiConnect is served from inside Anki and cannot run standalone.
  2. Install the AnkiConnect add-on: in Anki, Tools → Add-ons → Get Add-ons → enter 2055492159.
  3. Restart Anki after installing or enabling the add-on.
  4. Confirm the URL is correct; pass --url <addr> if you configured another port.
Run: anki-import doctor
```

Every AnkiConnect failure (CLI and MCP) carries the same stable
`cause`/`hints`/`suggestion` envelope for AI agents.

## Development

Monorepo (pnpm workspaces, 18 packages):

```sh
pnpm install
pnpm test        # vitest — 90+ tests, all AnkiConnect traffic mocked
pnpm typecheck
pnpm build       # single-file esbuild bundle → dist/cli.js (~25 ms startup)
node dist/cli.js --version
```

Architecture, interfaces, plugin API, testing strategy, release checklist
and migration guide: `docs/` (start at `docs/monorepo-architecture.md`).

See [CHANGELOG.md](CHANGELOG.md) for release notes.

## License

MIT
