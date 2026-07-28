# Contributing

Thanks for your interest in `anki-xml`. This file explains how to
make a change that lands cleanly.

## Ground rules

- **Run `bun test` before every commit.** All 420+ tests must pass.
- **One commit per logical change.** Don't bundle unrelated work.
- **Prefer small, behavior-preserving refactors.** A refactor that
  changes behavior is a bug.
- **Write tests first when fixing bugs.** The failing test
  demonstrates the bug; the fix makes it pass.
- **Document in the right file.** New command → `docs/commands.md`.
  Schema change → `docs/field-names.md`. New error → JSON envelope doc.
- **Update the CHANGELOG** under `[Unreleased]`. Don't bump the
  version — that's done at release time.

## Adding a new command

The CLI is data-driven: every command is a `Command<T>` object
registered in `src/cli/registry.ts`. The shape:

```ts
const command: Command<MySubArgs> = {
  name: "my-cmd",
  description: "What this command does in one line.",
  flags: { "--flag <value>": "Description for --help." },
  parseSubArgs(positional, rest) { return { /* parsed sub-args */ }; },
  async run(args, sub) {
    return withFatal(async () => {
      const startMs = Date.now();
      const data = await doTheWork(args.url);
      const human = renderHuman(data);
      console.log(formatOutput(data, { args, startMs, command: "my-cmd" }, human));
      return 0;
    });
  },
};
export default command;
```

Steps:

1. Create `src/my-thing.ts` with the core logic (pure async function,
   easy to mock).
2. Create `src/cli/commands/my-cmd.ts` with the CLI wrapper above.
3. Register in `src/cli/registry.ts`.
4. Add a subcommand flag in `src/cli/args.ts` (if it's a new
   global-style flag, add to the recognized set).
5. Add the new flag to `tests/cli-internals.test.ts` registry
   expectation.
6. Add tests in `tests/my-thing.test.ts`.
7. Update `docs/commands.md` and `CHANGELOG.md`.

## Architecture

See [`docs/architecture-review.md`](docs/architecture-review.md) for
the high-level rationale and [`docs/extension-policy.md`](docs/extension-policy.md)
for when to extend the CLI vs. when to write a new tool.

The short version:

- **Library** (`src/`) — pure async functions, no I/O outside of
  reading files. Mockable. Used by tests.
- **CLI commands** (`src/cli/commands/`) — thin `Command<T>` wrappers.
  Format output via `formatOutput()`. Wrap async work in `withFatal()`.
- **AnkiConnect** (`src/anki-connect.ts`) — single class, every RPC
  call is a typed method. Use `createClient(args)` from
  `src/cli/client.ts` to construct.

## Testing

Tests use `bun test`. Run:

```sh
bun test                  # all tests
bun test tests/foo.ts     # one file
bun test --watch          # watch mode
```

When testing code that talks to AnkiConnect, mock `fetch` with a
tiny `(url, init) => Response` shim that returns canned JSON. See
`tests/checkpoints.test.ts` for the canonical pattern.

## Releasing

1. Move `[Unreleased]` entries to a dated `[x.y.z]` section in CHANGELOG.md.
2. Bump `version` in `package.json`.
3. Tag the commit: `git tag -a v0.2.0 -m "v0.2.0"`.
4. Push: `git push --follow-tags`.

## Code of conduct

Be kind. Assume good faith. Reviews are about the code, not the
person.