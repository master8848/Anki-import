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
bun test tests/import.test.ts -t 'duplicates'   # all tests whose name matches "duplicates"
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
const client = createClient({ url: "...", fetchImpl });
```

### 3.4 The publish check

`bun run publish:check` is the canonical "is the build safe to ship"
harness. It:

1. Runs `bun test`.
2. Verifies `bun run src/index.ts --version` works.
3. Verifies `--help` lists every registered command (count must
   match `src/cli/registry.ts`).
4. Builds the npm bundle.
5. Runs the resulting `dist/cli.js` with `node`.
6. Confirms README, CHANGELOG, LICENSE, CONTRIBUTING all exist.

It exits non-zero on any failure.

### 3.5 Test conventions

- One file per concern. `tests/foo.test.ts` for `src/foo.ts`.
- No snapshot tests. Use plain `expect(...)` against typed values.
- Edge cases in their own files (see `tests/edge-cases.test.ts`).
- For every `tests/foo.test.ts`, the corresponding `src/foo.ts`
  must not import the test file (no test/prod cycles).
- Mock external dependencies, not internal logic.

---

## 4. Adding a new command

The CLI is data-driven: every command is a `Command<T>` object
registered in `src/cli/registry.ts`.

### 4.1 Shape of a command

```ts
const command: Command<MySubArgs> = {
  name: "my-cmd",
  description: "What this command does in one line.",
  flags: { "--flag <value>": "Description for --help." },
  parseSubArgs(positional, rest) {
    return { /* parsed sub-args */ };
  },
  async run(args, sub) {
    return withFatal(async () => {
      const startMs = Date.now();
      const data = await doTheWork(args.url);
      const human = renderHuman(data);
      console.log(
        formatOutput(data, { args, startMs, command: "my-cmd" }, human),
      );
      return 0;
    });
  },
};
export default command;
```

### 4.2 Steps

1. **Create the logic** — `src/my-thing.ts` with a pure async
   function. Use injectable `fetchImpl` for AnkiConnect calls. Make
   the function easy to mock.

2. **Create the wrapper** — `src/cli/commands/my-cmd.ts` with the
   `Command<T>` shape above. Use `formatOutput()` for both human
   and `--json` paths. Wrap async work in `withFatal()`.

3. **Register** — add it to `src/cli/registry.ts`:

   ```ts
   { name: "my-cmd", path: "./commands/my-cmd.ts", surface: "Read / Query" }
   ```

4. **Group it in `--help`** — update `src/cli/help.ts`'s `grouping`
   map so the new command appears under the right surface.

5. **Whitelist its flags** — if it adds a new subcommand-level flag,
   add it to the recognized flags list in `src/cli/args.ts`.

6. **Add tests** — at minimum:
   - `tests/my-thing.test.ts` — logic.
   - `tests/cli-internals.test.ts` — registry expectation.
   - `tests/cli.test.ts` — end-to-end via `spawn`.

7. **Document** — add the command's section to
   [`docs/commands.md`](docs/commands.md) and an `[Unreleased]` entry
   in [`CHANGELOG.md`](CHANGELOG.md).

8. **Update `--help` examples** — add a usage line to
   `EXAMPLES_BLOCK` in `src/cli/help.ts`.

9. **Run the gates** — `bun test && bunx tsc --noEmit && bun run
   publish:check`.

### 4.3 Adding a subcommand

Commands with multiple subcommands (`profile`, `checkpoint`, `addon`)
parse the verb in their own `parseSubArgs`. Keep the subcommand set
flat — no nested verbs.

---

## 5. Adding a stable error code

This is part of the JSON envelope contract. Treat it as a breaking
change for AI agents.

1. Add the code to `ErrorCode` in `src/cli/envelope.ts`.
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

Cut a release **only** from `main`, only after `bun run
publish:check` passes.

1. Move the `[Unreleased]` content to a dated `[x.y.z]` section in
   [`CHANGELOG.md`](CHANGELOG.md).
2. Bump `version` in `package.json`.
3. Update `VERSION` in `src/cli/help.ts`, `version` in
   `src/cli/envelope.ts`, and `version` in `src/cli/output.ts`.
4. Run `bun run publish:check` once more.
5. Commit with message `chore: release vX.Y.Z`.
6. Tag: `git tag -a vX.Y.Z -m "..."`.
7. Push: `git push --follow-tags`.
8. Publish to npm: `npm publish --access public` (after `npm login`).
9. Cut a GitHub Release from the tag using the CHANGELOG entry.

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

- [ ] **`bun test` passes locally.** (430/0)
- [ ] **`bunx tsc --noEmit` is clean.**
- [ ] **`bun run publish:check` is OK.**
- [ ] **Every new public function** has a test.
- [ ] **No new global mutable state** introduced.
- [ ] **No new dependencies** without discussion in an issue first.
- [ ] **The new command's logic** lives in `src/*.ts`, not
      `src/cli/commands/*.ts`.
- [ ] **The new command** is registered in `src/cli/registry.ts`
      **and** in `src/cli/help.ts`'s `grouping`.
- [ ] **Documentation updates** match the docs table in §7.
- [ ] **`[Unreleased]` entry** added to `CHANGELOG.md`.
- [ ] **Commit messages** follow §2.2.
- [ ] **No `process.exit` outside `src/index.ts`.**
- [ ] **No snapshot tests** introduced.
- [ ] **No XML parsed with regex in tests.**

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
