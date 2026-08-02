# Contributing to `anki-xml`

Thanks for your interest. This file explains how to make a change that
lands cleanly — from setup, through testing, through PR review, through
release.

If you're an AI agent writing code in this repo, see
[`AGENTS.md`](AGENTS.md) for the full project design context first.

---

## Quick links

- [`AGENTS.md`](AGENTS.md) — full project guide for AI agents and new
  developers (constraints, anti-patterns, contracts).
- [`docs/architecture-review.md`](docs/architecture-review.md) —
  design rationale.
- [`docs/roadmap.md`](docs/roadmap.md) — milestones.
- [`docs/extension-policy.md`](docs/extension-policy.md) — when to
  extend the CLI vs. write a new tool.
- [`CHANGELOG.md`](CHANGELOG.md) — what shipped, in semantic order.

---

## 1. Setup

### 1.1 Prerequisites

| Tool | Version | Notes |
|---|---|---|
| [Node.js](https://nodejs.org) | ≥ 20 | Runtime for CLI and Vitest |
| [pnpm](https://pnpm.io) | ≥ 10 | Package manager (`packageManager` in `package.json`) |
| Git | latest | PRs land via GitHub |
| Anki + AnkiConnect | Anki 2.1.49+, AnkiConnect 5+ | Optional — only for manual smoke tests |

Installs enforce a **14-day minimum release age** (see `.npmrc`).

### 1.2 First-time setup

```sh
git clone https://github.com/master8848/Anki-import
cd Anki-import
pnpm install
```

You're done. Verify with:

```sh
node --version     # ≥ 20
pnpm --version     # ≥ 10
pnpm test          # all tests pass
pnpm build && node dist/cli.js --version
```

If `pnpm install` refuses a package, it may be newer than 14 days —
that is intentional (`minimum-release-age=20160` minutes).

---

## 2. Development workflow

### 2.1 Branching

- Branch from `main`.
- Branch name format: `feat/<thing>`, `fix/<thing>`, `docs/<thing>`,
  `refactor/<thing>`. Slug case: kebab-case.
- One branch per PR. Rebase before review if `main` has moved.

### 2.2 Commit messages

- Imperative subject line: "Add `tag` command", not "Added" or
  "Adds".
- First line ≤ 72 chars; blank line; optional body.
- Reference milestones when relevant: `(M22)`, `(P4.9)`.

### 2.3 Pre-commit checklist

Run **all** of these locally before you push:

```sh
pnpm test                  # all tests pass
pnpm typecheck             # 0 type errors
pnpm build                 # dist/cli.js
```

If any fails, fix and re-run. Do not skip.

### 2.4 Commit only when green

The CI on every PR runs the same three commands. Pushing "to see CI"
wastes cycles; run them locally first.

---

## 3. Running tests

### 3.1 Standard commands

```sh
pnpm test                      # all tests
pnpm test tests/foo.test.ts    # one file
pnpm test:watch                # re-run on change
```

### 3.2 Single test focus

```sh
pnpm test tests/import.test.ts -t "duplicates"   # only tests whose name matches "duplicates"
```

### 3.3 Network tests

Tests **never** talk to a real AnkiConnect. They mock `fetch` with
a one-line shim that returns canned JSON. See the canonical pattern
in `tests/checkpoints.test.ts` and `tests/addon.test.ts`:

```ts
const fetchImpl: typeof fetch = async (url, init) => {
  return new Response(JSON.stringify({ result: [...], error: null }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
const client = new AnkiClient({ url: "...", fetchImpl });
```

### 3.4 The quality gates

`pnpm test && pnpm typecheck && pnpm build && node dist/cli.js --version`
is the canonical "is the build safe to ship" harness. It:

1. Runs `pnpm test` (vitest, all AnkiConnect traffic mocked).
2. Runs `pnpm typecheck` (strict `tsc --noEmit`, monorepo-wide).
3. Builds the single-file bundle (`node scripts/build.mjs`).
4. Runs the resulting `dist/cli.js` with `node` (`--version`).

It exits non-zero on any failure.

### 3.5 Test conventions

- One file per concern under `tests/`. `tests/foo.test.ts` tests
  `packages/<pkg>/src/foo.ts`.
- No snapshot tests. Use plain `expect(...)` against typed values.
- Mock ALL AnkiConnect traffic via the injectable `fetchImpl` on
  `AnkiClient` — never hit the network in tests.
- For every `tests/foo.test.ts`, the corresponding source file must
  not import the test file (no test/prod cycles).
- Mock external dependencies, not internal logic.

---

## 4. Adding a new command

Commands are thin wrappers in `packages/cli/src/commands/*.ts`
dispatched by a `switch` in `packages/cli/src/run.ts`. Business logic
lives in `packages/core` (or a dedicated package); CLI files must
contain no business logic.

### 4.1 Shape of a command

```ts
// packages/cli/src/commands/my-cmd.ts
import { doTheWork } from "@anki-xml/core";
import { flagString, type ParsedArgs } from "../args.ts";
import type { Logger } from "@anki-xml/logger";

export async function runMyCmd(
  positional: string[],
  args: ParsedArgs,
  log: Logger,
): Promise<number> {
  const result = await doTheWork({ url: args.flags.url });
  if (args.flags.json) console.log(JSON.stringify(result));
  else log.info(`done: ${result.count}`);
  return 0;
}
```

### 4.2 Steps

1. **Create the logic** — in `packages/core/src/my-thing.ts` (or a new
   package if it owns a domain) with a pure async function and
   injectable `fetchImpl` for AnkiConnect calls. Make it easy to mock.

2. **Export it** — add to `packages/core/src/index.ts` (or the new
   package's `src/index.ts`).

3. **Create the wrapper** — `packages/cli/src/commands/my-cmd.ts` with
   the thin shape above. Both human and `--json` output paths must be
   covered; `--json` must keep stdout to a single JSON document.

4. **Dispatch** — add a `case "my-cmd":` in `packages/cli/src/run.ts`.

5. **Whitelist its flags** — add any new flags to `GLOBAL_BOOL` /
   `GLOBAL_VALUE` in `packages/cli/src/args.ts`.

6. **Update `--help`** — add the command to `printHelp()` and
   `printCommandHelp()` in `packages/cli/src/help.ts`.

7. **Add tests** — at minimum:
   - `tests/my-thing.test.ts` — logic with mocked `fetchImpl`.
   - `tests/cli.test.ts` or `tests/cli-formats.test.ts` — command-level
     via `main([...])` (error paths need no Anki).

8. **Document** — add the command's section to
   [`docs/commands.md`](docs/commands.md) (or
   `docs/monorepo-architecture.md` for design) and an `[Unreleased]`
   entry in [`CHANGELOG.md`](CHANGELOG.md).

9. **Run the gates** — `pnpm test && pnpm typecheck && pnpm build &&
   node dist/cli.js --version`.

### 4.3 Adding a subcommand

Commands with multiple subcommands (`profile`, `checkpoint`, `addon`)
parse the verb in their own `parseSubArgs`. Keep the subcommand set
flat — no nested verbs.

---

## 5. Adding a stable error code

This is part of the JSON envelope contract. Treat it as a breaking
change for AI agents.

1. Add the code where the error is produced (error envelope helpers
   live in `packages/cli/src/errors.ts`; diagnostics in
   `packages/anki/src/errors.ts`).
2. Document it in:
   - [`CHANGELOG.md`](CHANGELOG.md)
   - [`docs/ai-integration.md`](docs/ai-integration.md) §"Stable
     JSON Shapes Per Command"
   - [`AGENTS.md`](AGENTS.md) §5
3. Add a test that asserts the code appears in the error envelope
   (don't just test the message).

---

## 6. Modifying the XML schema

`docs/language.md` is the authoritative grammar. Any change to
<note>, <anki>, attribute handling, or field mapping requires:

1. New validation test in `tests/models.test.ts`.
2. New tokenizer test in `tests/xml.test.ts`.
3. New round-trip test in `tests/upstream-regressions.test.ts`.
4. CHANGELOG entry under the next `[Unreleased]` section.

Schema changes are **breaking** for users with existing XML files;
flag them in the release notes.

---

## 7. Documentation policy

Every doc file has a purpose. When you change a doc:

| Change | Doc to update |
|---|---|
| New command | `docs/commands.md`, `CHANGELOG.md`, `src/cli/help.ts` (`EXAMPLES_BLOCK`) |
| New flag (global) | `docs/cli.md`, `README.md`, `AGENTS.md` §4 |
| New flag (subcommand) | `src/cli/help.ts` flags map, `docs/commands.md` |
| New error code | `docs/ai-integration.md`, `AGENTS.md` §5, `CHANGELOG.md` |
| New XML attribute | `docs/language.md`, `docs/usage.md`, `docs/field-names.md` |
| New exit code | `docs/cli.md`, `AGENTS.md` §4.3 |
| Architectural change | `docs/architecture-review.md`, `AGENTS.md` §3 |

---

## 8. Releasing

We are **not publishing to npm yet** (v0.0.4 is a restructure release).
When publishing begins, follow `docs/release-checklist.md`. Cut a
release only from `main`, only after the quality gates pass:

1. Move the `[Unreleased]` content to a dated `[x.y.z]` section in
   [`CHANGELOG.md`](CHANGELOG.md).
2. Bump `version` in root `package.json` **and** every
   `packages/*/package.json` + `apps/playground/package.json`.
3. Update `VERSION` in `packages/cli/src/help.ts`.
4. Run the gates once more: `pnpm test && pnpm typecheck && pnpm
   build && node dist/cli.js --version`.
5. Commit with message `chore: release vX.Y.Z`.
6. Tag: `git tag -a vX.Y.Z -m "..."`.
7. Push: `git push --follow-tags`.

The minor version (`X.Y.0`) bumps when:
- A new command is added.
- A new stable error code is added.

The patch version (`X.Y.Z`) bumps when:
- A bug is fixed.
- Docs are corrected.
- Tests are added without behavior change.

Major version (`X.0.0`) bumps when:
- The JSON envelope version moves from `1` to `2`.
- A documented command is removed.
- A stable error code is repurposed.

---

## 9. PR review checklist

Use this when reviewing your own or another's PR:

- [ ] **`pnpm test` passes locally.**
- [ ] **`pnpm typecheck` is clean.**
- [ ] **`pnpm build` + `node dist/cli.js --version` works.**
- [ ] **Every new public function** has a test.
- [ ] **No new global mutable state** introduced.
- [ ] **No new dependencies** without discussion in an issue first.
- [ ] **The new command's logic** lives in `packages/core` (or a
      domain package), not `packages/cli/src/commands/*`.
- [ ] **The new command** is dispatched in `packages/cli/src/run.ts`
      **and** documented in `packages/cli/src/help.ts`.
- [ ] **Documentation updates** match the docs table in §7.
- [ ] **`[Unreleased]` entry** added to `CHANGELOG.md`.
- [ ] **Commit messages** follow §2.2.
- [ ] **No `process.exit` outside `packages/cli/src/index.ts`.**
- [ ] **No snapshot tests** introduced.
- [ ] **No XML parsed with regex in tests.**
- [ ] **AnkiConnect is only ever reached from `packages/anki`.**

---

## 10. Code of conduct

Be kind. Assume good faith. Reviews are about the code, not the
person. If a disagreement cannot be resolved in the PR, escalate to
a maintainer.

This project follows the [Contributor Covenant][cov] in spirit. If
someone is being unkind, open an issue or contact a maintainer
privately.

---

[cov]: https://www.contributor-covenant.org/

## 11. Where to ask questions

- **A bug or feature request** → open an issue with the right
  template (`bug_report.md`, `feature_request.md`, or
  `agent_workflow.md`).
- **A "how do I" question** → check the docs first, then open a
  question in Discussions (if enabled), or open an issue with the
  `question` label.
- **A security issue** → see [`SECURITY.md`](SECURITY.md). Do not
  file a public issue.

---

## 12. Helpful scripts

| Script | Purpose |
|---|---|
| `pnpm test` | Run all tests (Vitest) |
| `pnpm typecheck` | Type-check only |
| `pnpm start` | Run the CLI from source (`tsx`) |
| `pnpm build` | Build `dist/cli.js` (Node ≥ 20) |

The build produces `dist/cli.js` — a self-contained ESM bundle for Node 20+.

---

## 13. Agent skill (`skills/anki-import/`)

The skill ships in the npm package for agents that only have
`npm install -g anki-xml` — not this repository.

Rules when editing it:

1. Keep `SKILL.md` self-contained (≈150–250 lines). No links to
   `schema/anki.xsd`, `CHANGELOG.md`, `../SKILL.md`, or repo paths.
2. One command table lives in `SKILL.md` only. Do not reintroduce
   `references/commands.md` or `references/xml-schema.md`.
3. All examples live under `skills/anki-import/examples/`
   (`commands.md`, XML fixtures, `update-and-delete.md`). Do not
   keep a sibling `examples.md` next to `SKILL.md`.
4. Do not duplicate fixture content into `SKILL.md` — list filenames
   only.
5. Contributor / from-source docs belong here, not in the skill.
   There is no `update` CLI in the current release; document
   delete/replace via `checkpoint` + `rollback` + re-`import`.

---

Welcome aboard!
