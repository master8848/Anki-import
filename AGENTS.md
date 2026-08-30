# AGENTS.md — anki-xml

Git + Terraform for Anki knowledge. XML-first infrastructure-as-code
toolkit for Anki collections, driven by AnkiConnect.

## Architecture (pnpm monorepo)

```
packages/
  cli/          # argv parsing + command wrappers only (no business logic)
  core/         # orchestration: import pipeline, doctor, plan, diff,
                #   sync-file, watch, plugin registry
  parser/       # XML (tokenizer+CDATA+stream) + YAML/JSON/CSV/Markdown
  validation/   # Valibot schemas + model rules (validateNote/validateNotes)
  planner/      # buildPlan: add/update/remove/duplicates/unchanged
  diff/         # diffNote/diffNoteLists/diffDecks/diffTags
  checkpoint/   # JSON snapshots ($XDG_DATA_HOME/anki-import/checkpoints)
  rollback/     # delete notes from a checkpoint
  sync/         # applyPlan + driftFromCheckpoint
  anki/         # AnkiConnect HTTP client + diagnostics (ONLY package
                #   that talks to AnkiConnect)
  models/       # note-type registry (getModel etc.) + listModels/fields/templates
  tags/ media/ stats/ config/ logger/ utils/ mcp/
apps/playground/
tests/          # vitest; fixtures/ goldens/ snapshots/
```

## Constraints

1. XML remains canonical — never JSON-first for cards. Other formats map
   onto the same in-memory note model via importer plugins.
2. No business logic in `packages/cli/src/commands/*`.
3. No Bun-only APIs (`Bun.file`, `Bun.write`, `Bun.spawn`).
4. Never decode XML entities in field content.
5. CDATA: escape bare `&`, `<`, `>`; do not double-escape entities.
6. Void HTML tags (`br`, `img`, …) are unpaired.
7. Validation gates mutation.
8. `--json` changes output only, not control flow.
9. Error codes are stable; branch on `code`, never `message`.
10. Only `packages/anki` may talk to AnkiConnect.
11. MCP stdout is protocol-clean — no log lines (stdio JSON-RPC only).
12. Import creates notes only; `sync` creates AND updates.

## AnkiConnect diagnostics

`packages/anki/src/errors.ts` classifies failures into stable causes
(`refused | timeout | http | bad-json | network | ok | unknown`) with
ordered `hints` and a `suggestion`. Every CLI error path renders them;
`--json` and MCP expose `cause`/`hints`/`suggestion` for AI agents.
`doctor` runs the full diagnosis. Fix steps cover: Anki app not running,
AnkiConnect add-on (2055492159) not installed, wrong URL, hung Anki.

## Commands

`doctor` · `open` · `validate` · `plan` · `diff` · `import` · `sync` · `rollback`
· `checkpoint` · `watch` · `tags` · `models` · `stats` · `media` ·
`benchmark` · `mcp`

## Quality gates

```sh
pnpm test && pnpm typecheck && pnpm build && node dist/cli.js --version
```

## Skill

Agent-facing docs: `skills/anki-import-cli/SKILL.md` (CLI — the
recommended interface) and `skills/anki-import-mcp/SKILL.md` (MCP
subset) — self-contained for npm users. Contributor skill rules:
`CONTRIBUTING.md` §13.
