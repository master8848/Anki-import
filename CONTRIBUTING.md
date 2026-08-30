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
| [bun](https://bun.io) | ≥ 10 | Package manager (`packageManager` in `package.json`) |
| Git | latest | PRs land via GitHub |
| Anki + AnkiConnect | Anki 2.1.49+, AnkiConnect 5+ | Optional — only for manual smoke tests |

Installs enforce a **14-day minimum release age** (see `.npmrc`).

### 1.2 First-time setup

```sh
git clone https://github.com/master8848/Anki-import
cd Anki-import
bun install
```

You're done. Verify with:

```sh
node --version     # ≥ 20
bun --version     # ≥ 10
bun run test          # all tests pass
bun run build && node dist/cli.js --version
```

If `bun install` refuses a package, it may be newer than 14 days —
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
bun run test                  # all tests pass
bun run typecheck             # 0 type errors
bun run build                 # dist/cli.js
```

If any fails, fix and re-run. Do not skip.

### 2.4 Commit only when green

The CI on every PR runs the same three commands. Pushing "to see CI"
wastes cycles; run them locally first.

---

## 3. Running tests

### 3.1 Standard commands

```sh
bun run test                      # all tests
bun run test tests/foo.test.ts    # one file
bun run test:watch                # re-run on change
```

### 3.2 Single test focus

```sh
bun run test tests/import.test.ts -t "duplicates"   # only tests whose name matches "duplicates"
```

### 3.3 Network tests

Tests **never** talk to a real AnkiConnect. They mock `fetch` with
a one-line shim that returns canned JSON. See the canonical pattern
in `tests/ankiconnect.test.ts` and `tests/mcp.test.ts`:

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

`bun run test && bun run typecheck && bun run build && node dist/cli.js --version`
is the canonical "is the build safe to ship" harness. It:

1. Runs `bun run test` (vitest, all AnkiConnect traffic mocked).
2. Runs `bun run typecheck` (strict `tsc --noEmit`, monorepo-wide).
3. Builds the single-file bundle (`rslib build` → `dist/cli.js`).
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

8. **Document** — keep every surface in sync so no doc contradicts
   another (this is a reviewable checklist):
   - `packages/cli/src/help.ts` — `printHelp()` command list + examples
     and `printCommandHelp()` usage line.
   - `docs/cli-design.md` — the canonical command table (one row per
     command; update the command count in its header text if you touch
     the surface).
   - `README.md` — `## Commands` list (and quick start for a new
     top-level workflow).
   - `AGENTS.md` — the `## Commands` line.
   - `skills/anki-import-cli/SKILL.md` — command table (agent-facing).
   - `docs/README.md` — doc index, if it lists a command count.
   - `CHANGELOG.md` — `[Unreleased]` entry.
   - `tests/cli.test.ts` or `tests/cli-formats.test.ts` — help/exit
     behavior if the change affects it.
   - `docs/commands.md` — legacy surface; only update if the command
     exists there (historical, not canonical).

9. **Run the gates** — `bun run test && bun run typecheck && bun run build &&
   node dist/cli.js --version`.

### 4.3 Adding a subcommand

Commands with multiple subcommands (`checkpoint`, `tags`, `media`)
parse the verb in their own `parseSubArgs`. Keep the subcommand set
flat — no nested verbs.

### 4.4 Adding an MCP tool

MCP tools live in `packages/mcp/src/tools.ts` via the `makeTool`
helper (name, tier, description, Valibot `inputSchema`, handler).
Steps:

1. **Reuse core** — the handler must call `@anki-xml/core` (or a
   package) functions, never talk to AnkiConnect directly; use
   `clientFor(ctx)` for the shared client.
2. **Pick a tier** — P0 (diagnose/read baseline), P1 (common writes),
   P2 (advanced). Update the tiering list in
   `docs/mcp-design.md`.
3. **Validate params** — a Valibot schema; wrong params must throw
   `McpToolError` (→ `-32602`).
4. **Keep stdout clean** — the handler returns data; the server
   serializes it. No `console.log`.
5. **Document** — `docs/mcp-design.md` (tool table + `## Tools (N)`
   count), `tests/mcp.test.ts` (tier-list assertions + a handler
   test), `skills/anki-import-mcp/SKILL.md` (tool table), `README.md`
   (`mcp` bullet tool count), `docs/js-interfaces.md` (`TOOLS`
   count), `CHANGELOG.md` `[Unreleased]`.
6. **Run the gates** — `bun run test && bun run typecheck && bun run build`.

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
   - [`AGENTS.md`](AGENTS.md) — "AnkiConnect diagnostics" section
     (constraint #9: branch on `code`, never `message`)
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

Every doc file has a purpose. When you change a doc, keep the
surfaces below in sync — they describe the **same** thing (commands,
tools, flags) and drift silently:

| Change | Canonical doc(s) to update |
|---|---|
| New command | `packages/cli/src/help.ts`, `docs/cli-design.md`, `README.md`, `AGENTS.md` (Commands), `skills/anki-import-cli/SKILL.md`, `CHANGELOG.md` (see §4.2 step 8) |
| New MCP tool | `packages/mcp/src/tools.ts`, `docs/mcp-design.md`, `tests/mcp.test.ts`, `skills/anki-import-mcp/SKILL.md`, `CHANGELOG.md` (see §4.4) |
| New flag (global) | `docs/cli-design.md`, `README.md`, `AGENTS.md` (Commands) |
| New flag (subcommand) | `packages/cli/src/help.ts` flags map, `docs/cli-design.md` |
| New error code | `docs/ai-integration.md`, `AGENTS.md` (AnkiConnect diagnostics), `CHANGELOG.md` |
| New XML attribute | `docs/language.md`, `docs/usage.md`, `docs/field-names.md` |
| New exit code | `docs/cli-design.md`, `AGENTS.md` |
| Architectural change | `docs/monorepo-architecture.md`, `AGENTS.md` (Architecture) |
| Skill change | `skills/*/SKILL.md` + §13 of this file |

Legacy docs that must **not** be extended (historical only):
`docs/cli.md`, `docs/commands.md`, `docs/cli-command-design.md`,
`docs/architecture-review.md`. Point readers to `docs/cli-design.md`
and `docs/mcp-design.md` instead.

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
4. Run the gates once more: `bun run test && bun run typecheck && bun
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

- [ ] **`bun run test` passes locally.**
- [ ] **`bun run typecheck` is clean.**
- [ ] **`bun run build` + `node dist/cli.js --version` works.**
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
| `bun run test` | Run all tests (Vitest) |
| `bun run typecheck` | Type-check only |
| `bun run start` | Run the CLI from source (`tsx`) |
| `bun run build` | Build `dist/cli.js` (Node ≥ 20) |

The build produces `dist/cli.js` — a self-contained ESM bundle for Node 20+.

---

## 13. Agent skills (`skills/anki-import-cli/`, `skills/anki-import-mcp/`)

The skills ship in the npm package for agents that only have
`npm install -g anki-xml` — not this repository. There are two:

- `skills/anki-import-cli/SKILL.md` — the CLI, **the recommended
  interface** (full surface).
- `skills/anki-import-mcp/SKILL.md` — the MCP subset (18 tools, tiers,
  what MCP cannot do).

Rules when editing them:

1. Keep each `SKILL.md` self-contained and small (≈60–120 lines). No
   links to `schema/anki.xsd`, `CHANGELOG.md`, `../SKILL.md`, or repo
   paths. The MCP skill may point at the CLI skill by name.
2. One command table lives in the CLI `SKILL.md` only; one tool table
   in the MCP `SKILL.md` only. Do not reintroduce
   `references/commands.md` or `references/xml-schema.md`.
3. All examples live under `skills/anki-import-cli/examples/`
   (`commands.md`, XML fixtures, `update-and-delete.md`). Do not
   keep a sibling `examples.md` next to either `SKILL.md`.
4. Do not duplicate fixture content into either `SKILL.md` — list
   filenames only.
5. Contributor / from-source docs belong here, not in the skills.
   There is no `update` CLI in the current release; document
   delete/replace via `checkpoint` + `rollback` + re-`import`.
6. Keep `description` frontmatter distinct per skill (CLI vs MCP
   triggers) so agents pick the right one.

---

Welcome aboard!
