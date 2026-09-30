# Releasing

`vue-diff-text` (npm), `react-diff-text` (npm) and `sitefinitysteve/php-diff-text` (Packagist) are
released together: one version, one tag (`vX.Y.Z`), one command. No CI is needed.

## One-time setup

| What | How |
|---|---|
| npm | `npm login` as the owner of `vue-diff-text` and `react-diff-text` (`npm whoami` to check). With 2FA on, npm asks for a one-time code during publish. |
| GitHub CLI | `gh auth login` (creates the releases and pushes to the PHP mirror). |
| Packagist | Already set up: the package reads `github.com/sitefinitysteve/php-diff-text`. The mirror's webhook (Settings → Webhooks → `https://packagist.org/api/github?username=sitefinitysteve`, push events) makes Packagist pick up new tags within a minute. |
| Demo site | Settings → Pages → Source: **GitHub Actions** (or `gh api -X POST repos/sitefinitysteve/diff-text/pages -f build_type=workflow`). |

## Release

1. **Bump the version** in all three packages at once:
   ```bash
   scripts/release.sh set-version 1.6.1
   ```
2. **Write the notes.**
   - In `packages/vue/CHANGELOG.md`, `packages/react/CHANGELOG.md` and `packages/php/CHANGELOG.md`, add an entry for the version, and change `Unreleased` to today's date.
   - Create `.github/release-notes/vX.Y.Z.md` for the diff-text GitHub release.
   - Optionally, create `.github/release-notes/vX.Y.Z-php.md` for the php-diff-text mirror's release. Without it, the mirror gets the main notes.
3. **Commit and push to `main`,** then wait for CI to go green if you use it.
4. **Dry run.** This runs every check, test and build, plus `npm publish --dry-run`, and publishes nothing:
   ```bash
   scripts/release.sh
   ```
5. **Publish:**
   ```bash
   scripts/release.sh --go
   ```

`--go` refuses to run unless you're on a clean `main` that matches `origin/main`, all three versions match, and the changelogs and release notes exist. Then it does these steps, in order:

1. **npm:** publishes `vue-diff-text` and `react-diff-text`.
2. **Packagist:** splits `packages/php` and pushes it to the mirror's `main`, then tags the mirror `vX.Y.Z`. Packagist picks up the tag.
3. **Tag:** tags the monorepo `vX.Y.Z` and pushes the tag.
4. **GitHub releases:** creates `vX.Y.Z` on diff-text and on php-diff-text, each marked Latest.
5. **Demo site:** runs the `pages.yml` workflow, which builds and deploys it.

Each step is skipped if it already happened. If the release stops partway (say, a wrong npm code), fix the problem and run `--go` again.

## Checking a release

```bash
npm view vue-diff-text version
npm view react-diff-text version
composer show sitefinitysteve/php-diff-text --all | grep versions
```

Or open:
- npmjs.com/package/vue-diff-text
- packagist.org/packages/sitefinitysteve/php-diff-text
- the Releases section of both GitHub repos

If Packagist hasn't picked up the tag after a few minutes, click **Update** on the package page. If that fixes it, check the mirror's webhook.

## Doing it by hand

Use this if the script can't run. Replace `1.6.0` with the version.

**npm:**
```bash
npm ci
npm test
npm run build -w vue-diff-text -w react-diff-text
npm publish -w vue-diff-text --access public
npm publish -w react-diff-text --access public
```

**Packagist.** The mirror only fast-forwards; never force-push it.
```bash
sha=$(git subtree split --prefix=packages/php HEAD | tail -1)
git push https://github.com/sitefinitysteve/php-diff-text.git "${sha}:refs/heads/main"
git push https://github.com/sitefinitysteve/php-diff-text.git "${sha}:refs/tags/v1.6.0"
```

**Tag and GitHub releases:**
```bash
git tag -a v1.6.0 -m v1.6.0 && git push origin v1.6.0
gh release create v1.6.0 -R sitefinitysteve/diff-text --title v1.6.0 --notes-file .github/release-notes/v1.6.0.md --latest
gh release create v1.6.0 -R sitefinitysteve/php-diff-text --title v1.6.0 --notes-file .github/release-notes/v1.6.0-php.md --latest
```

**Demo site:**
```bash
gh workflow run pages.yml -R sitefinitysteve/diff-text --ref main
```
To preview the site locally, run `scripts/build-pages.sh`; the output lands in `_site/`.

## Optional CI backups

These live in `.github/workflows`, and you run them from the Actions tab:
- **`release-npm.yml`** publishes one npm package. It needs the `NPM_TOKEN` secret.
- **`split-php.yml`** updates and tags the mirror. It needs the `SPLIT_TOKEN` secret, a token with contents:write on php-diff-text.

None of them run on push or on tags, so they never publish twice.
