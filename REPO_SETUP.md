# GitHub repo setup checklist

> **Historical (pre-monorepo).** Written for creating the repo the
> first time; the repo now exists at `master8848/Anki-import`. The
> Bun-based build and publish steps below describe the old setup and
> **do not apply** — the current build is `pnpm build` (esbuild) and
> the current release flow is `docs/release-checklist.md` (npm
> publishing is not active yet). Only sections 1–2 (repo creation)
> remain relevant, and only if you fork.

Before pushing `anki-xml` to GitHub for the first time, do these
things:

## 1. Replace the placeholder URLs

`YOUR-USERNAME` appears in:

```
README.md
CHANGELOG.md
SECURITY.md
package.json
.github/workflows/test.yml
.github/ISSUE_TEMPLATE/*.md
```

Run this one-liner (substituting your actual GitHub username):

```sh
GITHUB_USER=your-actual-username
git grep -l 'YOUR-USERNAME' | xargs sed -i '' "s|YOUR-USERNAME|$GITHUB_USER|g"
git add -A && git commit -m "docs: replace YOUR-USERNAME with <$GITHUB_USER>"
```

## 2. Create the repo on GitHub

```sh
# via gh CLI (https://cli.github.com)
gh repo create anki-xml \
  --public \
  --description "AI-agent-friendly CLI for Anki via AnkiConnect. Built for autonomous loops." \
  --source .

# push
git push -u origin main
```

If you don't use `gh`:

1. Create the repo at <https://github.com/new> (no README, no .gitignore).
2. Then:
   ```sh
   git remote add origin git@github.com:<user>/anki-xml.git
   git push -u origin main
   ```

## 3. Set up GitHub-specific features

- **Topics**: `anki`, `flashcards`, `cli`, `spaced-repetition`, `ai-agent`, `xml`
- **Description**: copy from `package.json`
- **Website**: (optional) your Anki workflow page

## 4. Enable the workflows

The `.github/workflows/test.yml` file is committed but won't run
until you push to the default branch (`main`).

## 5. Tag a release

```sh
# after pushing
git tag -a v0.1.0 -m "v0.1.0 — initial release"
git push --follow-tags
# in GitHub UI: edit the tag → "Create release from tag"
# the GitHub Actions build will produce the standalone binary artifact
```

## 6. Optional: publish to npm

If you want `npx anki-xml` to work:

```sh
# one-time
npm login

# build the Node bundle and publish
bun run publish:check      # verify everything's green
npm publish --access public

# verify from anywhere
npx anki-xml --version
```

`bun run publish:check` verifies all 420 tests pass, the Bun CLI
runs, `--help` lists every command, the Node bundle builds, and the
Node bundle runs.

The `prepublishOnly` script auto-runs `bun run build:npm &&
bun run publish:check` before publishing, so you can't ship a
broken bundle.

After publishing, install via:

```sh
npm install -g anki-xml     # global
npx anki-xml                # one-shot, no install
```

## 7. Verify

After pushing to GitHub:

1. Open the repo's Actions tab — confirm `test` runs green.
2. Check the build artifact under Actions → "build" → latest run.
3. Download the binary and run `./anki-xml --version`.
4. Open an issue against the repo, fill in the bug-report template,
   then close it (to verify the template renders correctly).

## 8. Cleanup

After replacing `YOUR-USERNAME`, you can delete this file
(`REPO_SETUP.md`):

```sh
git rm REPO_SETUP.md
git commit -m "docs: remove setup checklist (was for first-push only)"
```
