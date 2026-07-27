# GitHub repo setup checklist

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
bun run build                     # standalone binary in ./anki-xml
# Publish the binary as a release; mention the install line in README
```

Or, full npm package:

```sh
# change package.json to:
#   "bin": { "anki-xml": "src/index.ts" }
# add a shebang to src/index.ts (#!/usr/bin/env bun)
bun publish
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
