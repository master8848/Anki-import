# Extension policy

This document is the contract for adding new commands, fields, models,
and error codes to `anki-xml`. Read it before proposing a feature.

## Principles

1. **AI-first.** Every new capability should make the CLI easier to drive
   from an LLM agent loop. If a feature is hard to describe in a JSON
   envelope, it is probably hard to use from an agent.
2. **Backward compatibility.** The v1 XML contract is frozen. New
   features are opt-in via flags or new attributes. Nothing in this
   roadmap removes a working command, flag, or attribute.
3. **No sidecar state.** The XML file is the source of truth. New
   workflows (delete, move, tag) accept XML first; the agent owns the
   XML.
4. **Data over code.** Adding a note model, an error code, or a shell
   completion entry should be a single data entry, not an `if/else`
   arm.
5. **One thing per command.** If a new feature would add a third
   unrelated flag to an existing command, it probably belongs in a new
   command.

## Adding a new command

1. Create `src/cli/commands/<name>.ts`.
2. Define a `Command<T>` object that exports:
   - `name`: the subcommand name (no leading dashes, lowercase).
   - `description`: one line, no trailing period.
   - `flags`: optional map of `--flag <desc>` for `--help` and completion.
   - `parseSubArgs?`: optional sub-argument parser. Throws `CliError`.
   - `run(args, subArgs)`: the command body. Returns 0/1/2.
3. Wrap the body in `withFatal(async () => { ... })` so uncaught errors
   become exit code 2.
4. For JSON output, use `formatOutput(data, { args, startMs, command },
   human)`. The envelope is automatic.
5. Add the command to `COMMANDS` in `src/cli/registry.ts`.
6. Update `docs/commands.md` and the registry-driven smoke test.
7. Add at least one test per happy path and one per failure path.

## Adding a new flag

- Global flags (apply to every command): add to the parser in
  `src/cli/args.ts` and to `GLOBAL_FLAGS` in `src/completion.ts`.
- Subcommand flags: add to `SUBCOMMAND_FLAGS` in `src/cli/args.ts` and
  to the owning command's `flags` map. The completion script will
  pick it up automatically.
- Boolean flags with no value: add to `BOOLEAN_FLAGS` in
  `src/cli/args.ts` so the parser stops greedy consumption.
- Always accept `--no-X` in addition to `--X` so scripts can disable
  defaults without `--no-` confusion (e.g. `--no-color`).

## Adding a new note model

1. Add a `NoteModel` entry to `MODELS` in `src/models.ts`.
2. Define `accepts`, `required`, `optional`, `fieldNames`,
   `validateExtras?`, and `buildFields`.
3. The model is automatically picked up by `validateNotes`,
   `getModel`, `SUPPORTED_MODEL_NAMES`, and the registry smoke
   tests.
4. Optionally extend `docs/field-names.md` with the new XML tag →
   Anki display name mapping.

Custom note types are out of scope in v1. Phase 4.2 lifts the
restriction once a real use case materializes.

## Adding a new error code

- Add the new code to `ErrorCode` in `src/cli/envelope.ts`.
- Use `formatError(ctx, code, message, details)` to emit a JSON failure
  envelope; the CLI prints the error message and returns exit code 2.
- Pick a stable, UPPER_SNAKE_CASE identifier. The agent pattern-matches
  on these, not on `message`.
- Document the new code in `docs/ai-integration.md` (error code
  reference).

## Adding a new shell

- Add the shell to `SUPPORTED_SHELLS` in `src/completion.ts`.
- Add a generator `XxxCompletion()` that returns a `string` script.
  Use `string[]` and `.join("\n")` rather than template literals to
  avoid shell metacharacters being parsed as TS expressions.
- Wire the shell into `generateCompletion(shell)`.
- Add a smoke test in `tests/completion.test.ts`.

## Adding a new subcommand flag namespace

If a flag repeats (`--tag`), the parser already handles it. The owning
command's `parseSubArgs` walks `rest` and accumulates values into an
array. No parser change is needed.

## Adding a new JSON envelope field

- For ad-hoc additions: documented in `docs/ai-integration.md` and
  shipped.
- For breaking changes: bump `ENVELOPE_VERSION` to 2 and shipping
  the new shape alongside `--json-legacy=1` for the migration window.
- Agents reading `version` first can switch on the shape.

## Adding a new validation rule

- For note-level rules: extend the relevant `NoteModel.validateExtras`
  in `src/models.ts`.
- For document-level rules (across notes): add to `validateNotes` in
  `src/xml.ts`.
- For non-fatal rules: append to `warnings` (with line/column when
  the source is available).
- For fatal rules: append to `errors`.
- Tag validation: extend `validateTags` in `src/xml.ts`.

## What NOT to do

- Don't add a plugin system until 3 real plugin requests materialize.
  It is a security surface and a maintenance burden.
- Don't add schema v2 until v1 is painful in production. 95% of
  authoring needs are already covered.
- Don't add hidden state files. The XML is the source of truth.
- Don't change the JSON envelope shape without bumping the version and
  shipping a legacy flag.
- Don't add `--quiet` to a command that didn't have it before. The
  one-shot agent should always get the full output.
