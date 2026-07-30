# AGENTS.md — anki-import

XML-first CLI for Anki via AnkiConnect. XML is the source of truth.

## Architecture

```
src/
  cli/                 # argv parsing + command wrappers only
  core/
    importer/          # import orchestration + batching
    validator/         # model rules + Valibot
    checkpoint/        # simplified JSON checkpoints
    rollback/          # delete notes from checkpoint
  parser/
    xml-parser.ts      # full-document parse (tokenizer + CDATA)
    xml-stream.ts      # streaming note iterator
  anki/
    ankiconnect.ts     # HTTP only (AnkiClient)
    models.ts          # note-type registry
  validation/schemas.ts
  plugins/             # ImportPlugin (XML built-in)
  utils/ types/
```

## Constraints

1. XML remains canonical — never JSON-first for cards.
2. No business logic in `cli/commands/*`.
3. No Bun-only APIs (`Bun.file`, `Bun.write`, `Bun.spawn`).
4. Never decode XML entities in field content.
5. CDATA: escape bare `&`, `<`, `>`; do not double-escape entities.
6. Void HTML tags (`br`, `img`, …) are unpaired.
7. Validation gates mutation.
8. `--json` changes output only, not control flow.
9. Error codes are stable; branch on `code`, never `message`.

## Commands

`doctor` · `validate` · `import` · `checkpoint` · `rollback` · `benchmark`

## Quality gates

```sh
pnpm test && pnpm typecheck && pnpm build && node dist/cli.js --version
```

## Skill

Agent-facing docs: `skills/anki-import/SKILL.md` — self-contained for
npm users. Contributor skill rules: `CONTRIBUTING.md` §13.
