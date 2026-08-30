# Release checklist (no npm publishing yet)

`anki-xml` is **not published to npm yet** — releases are git tags plus
a changelog. This checklist covers that flow, plus the (future) npm
publish steps.

## 0. Pre-flight

- [ ] Branch is clean or the working tree changes are intentional
  (`git status`).
- [ ] Current version confirmed: `node dist/cli.js --version` and
  `grep VERSION packages/cli/src/help.ts`.

## 1. Bump the version

- [ ] Run the version sync script — it updates the root
  `package.json`, every `packages/*/package.json`, every
  `apps/*/package.json` (playground), and the `VERSION` constant in
  `packages/cli/src/help.ts`:

  ```sh
  node scripts/version-sync.mjs X.Y.Z
  ```

  The script only rewrites files whose version differs, and prints how
  many files were synced. It also updates the MCP version constant
  (`packages/mcp/src/version.ts`). Verify: `grep '"version"' package.json
  packages/*/package.json apps/playground/package.json` and
  `grep VERSION packages/cli/src/help.ts packages/mcp/src/version.ts`.
- [ ] **Manual:** both `skills/anki-import-cli/SKILL.md` and
  `skills/anki-import-mcp/SKILL.md` carry `metadata: version: "0.0.4"`
  — `version-sync.mjs` does **not** touch them. Update by hand if the
  skills ship version metadata.
- [ ] Rebuild so `dist/cli.js` contains the new version:
  `pnpm build`.

## 2. CHANGELOG

- [ ] Add a `## [X.Y.Z] — <date>` section at the top of `CHANGELOG.md`
  (keep the existing `## [Unreleased]` flow: move its entries into the
  new release or re-create it).
- [ ] Group by `### Added` / `### Changed` / `### Removed` / `### Fixed`,
  following the v0.0.4 entry style. Reference docs for removed items
  (e.g. "see `docs/migration-strategy.md`").

## 3. Quality gates

Run all of:

```sh
pnpm test && pnpm typecheck && pnpm build && node dist/cli.js --version
```

- [ ] `pnpm test` — full vitest suite (15 files, no network).
- [ ] `pnpm typecheck` (`= pnpm lint`) — `tsc --noEmit` clean.
- [ ] `pnpm build` — esbuild bundle succeeds; note the size in the
  changelog when it changes materially.
- [ ] `node dist/cli.js --version` prints `anki-import vX.Y.Z`.
- [ ] `node dist/cli.js --help` renders the command table.

## 4. Smoke tests (manual, against the bundle)

- [ ] **doctor without Anki**: with Anki closed, `node dist/cli.js
  doctor --json` exits 1 and the JSON envelope carries
  `code: "ANKICONNECT_ERROR"` with `cause`, `hints` (add-on
  2055492159 steps), and `suggestion: "anki-import doctor"`.
- [ ] **doctor with Anki**: with Anki + AnkiConnect running, `doctor`
  exits 0 and reports `API version 6` supported.
- [ ] **Plan on every example format** (dry run against live Anki, or
  expect a clean validation-only run):
  `plan examples/basic.xml`, `plan examples/cards.yaml`,
  `plan examples/cards.json`, `plan examples/cards.csv`,
  `plan examples/cards.md` — each prints `Plan: …` and exits 0.
- [ ] **MCP handshake**: `node scripts/smoke-mcp.mjs` — prints
  `ok initialize: anki-xml 2024-11-05`, `ok tools/list: <N> tools`,
  `ok validate_xml: …` (also runnable via `pnpm smoke:mcp`).
- [ ] **Rollback dry-run**: `checkpoint list`; for a checkpoint,
  `rollback <id> --dry-run` prints "Dry run: would delete N notes"
  and leaves the checkpoint file in place.
- [ ] **Import + rollback loop** on a scratch deck: `import examples/
  basic.xml --checkpoint smoke-<ts>` (creates N notes, writes
  checkpoint), then `rollback smoke-<ts>` deletes them and removes the
  checkpoint.

## 5. Tag and push

- [ ] Commit: `git add -A && git commit -m "chore: release vX.Y.Z"`.
- [ ] Tag: `git tag vX.Y.Z` (existing tags: `v0.0.1`, `v0.0.2`,
  `v0.0.3`).
- [ ] Push: `git push origin feat/monorepo-restructure` (or the current
  branch) **and** `git push origin vX.Y.Z`.
- [ ] CI on the branch runs the node 20/22 matrix — confirm green.

## 6. (Future) npm publish — not active yet

When publishing starts, in addition to the above:

- [ ] `.npmrc`: keep `minimum-release-age=20160` (14 days — recorded in
  the v0.0.3 changelog) and the other publish guards from
  `scripts/publish-check.ts` history.
- [ ] `files` whitelist in root `package.json` is already:
  `dist`, `schema`, `docs`, `examples`, `README.md`, `CHANGELOG.md`,
  `LICENSE`, `skills` — verify nothing else would be packed
  (`npm pack --dry-run`).
- [ ] Bin entries point at `./dist/cli.js` for both names:
  `anki-import` and `anki-xml`.
- [ ] `npm publish` with `--workspaces=false` (single root package; the
  `packages/*` workspaces are internal, not published separately) —
  **confirm the intended publishing shape before enabling**, since
  `@anki-xml/*` packages are workspace-only today.
