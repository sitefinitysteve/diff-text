#!/usr/bin/env bash
# Local release for all three packages. No CI needed.
#
#   scripts/release.sh set-version 1.6.1   # bump vue, react and php to one version
#   scripts/release.sh                     # dry run: checks, tests, builds, npm --dry-run
#   scripts/release.sh --go                # publish for real
#
# Releases are lockstep: vue-diff-text, react-diff-text and php-diff-text share one
# version and one tag (vX.Y.Z). Every step is idempotent, so a partial release can be
# re-run: versions already on npm, tags that exist, and releases that exist are skipped.
#
# --go does, in order:
#   1. npm publish vue-diff-text and react-diff-text
#   2. split packages/php into the php-diff-text mirror, push main + tag vX.Y.Z
#      (Packagist picks the tag up from the mirror)
#   3. tag the monorepo vX.Y.Z and push it
#   4. GitHub releases: vX.Y.Z on diff-text (notes: .github/release-notes/vX.Y.Z.md)
#      and on php-diff-text (notes: .github/release-notes/vX.Y.Z-php.md if present)
#   5. build the demo site and push it to the gh-pages branch
#      (Settings → Pages → Deploy from a branch → gh-pages / root)
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

MONO_REPO="sitefinitysteve/diff-text"
PHP_MIRROR="sitefinitysteve/php-diff-text"
PHP_MIRROR_URL="https://github.com/$PHP_MIRROR.git"

say()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
skip() { printf '    skip: %s\n' "$*"; }
die()  { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }

json_version() { node -p "require('./$1').version"; }

# ---------------------------------------------------------------- set-version
if [[ "${1:-}" == "set-version" ]]; then
  v="${2:-}"
  [[ "$v" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$ ]] || die "usage: scripts/release.sh set-version X.Y.Z"
  for f in packages/vue/package.json packages/react/package.json packages/php/composer.json; do
    node -e "
      const fs = require('fs');
      const f = process.argv[1], v = process.argv[2];
      const s = fs.readFileSync(f, 'utf8');
      fs.writeFileSync(f, s.replace(/(\"version\"\s*:\s*\")[^\"]+(\")/, '\$1' + v + '\$2'));
    " "$f" "$v"
    echo "  $f → $v"
  done
  echo "Now add CHANGELOG entries and .github/release-notes/v$v.md, then commit."
  exit 0
fi

GO=0
[[ "${1:-}" == "--go" ]] && GO=1

# ---------------------------------------------------------------- preflight
say "Preflight"
VERSION="$(json_version packages/vue/package.json)"
REACT_V="$(json_version packages/react/package.json)"
PHP_V="$(json_version packages/php/composer.json)"
[[ "$VERSION" == "$REACT_V" && "$VERSION" == "$PHP_V" ]] \
  || die "versions differ: vue $VERSION, react $REACT_V, php $PHP_V (run: scripts/release.sh set-version X.Y.Z)"
TAG="v$VERSION"
NOTES=".github/release-notes/$TAG.md"
PHP_NOTES=".github/release-notes/$TAG-php.md"
echo "    version $VERSION (tag $TAG)"

[[ -f "$NOTES" ]] || die "missing release notes: $NOTES"
for c in packages/vue/CHANGELOG.md packages/react/CHANGELOG.md packages/php/CHANGELOG.md; do
  grep -q "$VERSION" "$c" || die "$c has no entry for $VERSION"
done

branch="$(git rev-parse --abbrev-ref HEAD)"
if (( GO )); then
  [[ "$branch" == "main" ]] || die "release from main (on $branch)"
  [[ -z "$(git status --porcelain)" ]] || die "working tree is not clean"
  git fetch -q origin main
  [[ "$(git rev-parse HEAD)" == "$(git rev-parse origin/main)" ]] || die "main is not in sync with origin/main (push or pull first)"
  npm whoami >/dev/null 2>&1 || die "not logged in to npm (npm login)"
  gh auth status >/dev/null 2>&1 || die "not logged in to gh (gh auth login)"
else
  echo "    dry run on branch $branch (use --go on a clean, pushed main to publish)"
fi

# ---------------------------------------------------------------- verify
say "Tests and builds"
npm run fixtures:check
npm run lint
npm test
npm run build -w vue-diff-text -w react-diff-text
(cd packages/php && composer install --no-interaction --quiet && composer test)

for pkg in vue react; do
  grep -q "@diff-text/core" "packages/$pkg/dist/index.d.ts" && die "packages/$pkg/dist/index.d.ts references the private core package"
  [[ -f "packages/$pkg/dist/style.css" ]] || die "packages/$pkg/dist/style.css is missing"
done

# ---------------------------------------------------------------- 1. npm
say "1. npm"
for ws in vue-diff-text react-diff-text; do
  if npm view "$ws@$VERSION" version >/dev/null 2>&1; then
    skip "$ws@$VERSION is already on npm"
  elif (( GO )); then
    npm publish -w "$ws" --access public
  else
    npm publish -w "$ws" --access public --dry-run
  fi
done

# ---------------------------------------------------------------- 2. php mirror
say "2. php-diff-text mirror"
split_sha="$(git subtree split --prefix=packages/php HEAD 2>/dev/null | tail -1)"
echo "    split commit $split_sha"
if (( GO )); then
  git push "$PHP_MIRROR_URL" "$split_sha:refs/heads/main"
  if git ls-remote --exit-code --tags "$PHP_MIRROR_URL" "refs/tags/$TAG" >/dev/null 2>&1; then
    skip "mirror already has tag $TAG"
  else
    git push "$PHP_MIRROR_URL" "$split_sha:refs/tags/$TAG"
  fi
else
  echo "    would push $split_sha to $PHP_MIRROR main and tag $TAG"
fi

# ---------------------------------------------------------------- 3. monorepo tag
say "3. Tag $TAG"
if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  skip "tag $TAG exists locally"
elif (( GO )); then
  git tag -a "$TAG" -m "$TAG"
else
  echo "    would tag $(git rev-parse --short HEAD) as $TAG"
fi
if (( GO )); then
  git ls-remote --exit-code --tags origin "refs/tags/$TAG" >/dev/null 2>&1 \
    && skip "origin already has $TAG" || git push origin "$TAG"
fi

# ---------------------------------------------------------------- 4. GitHub releases
say "4. GitHub releases"
if (( GO )); then
  if gh release view "$TAG" -R "$MONO_REPO" >/dev/null 2>&1; then
    skip "$MONO_REPO release $TAG exists"
  else
    gh release create "$TAG" -R "$MONO_REPO" --title "$TAG" --notes-file "$NOTES" --latest
  fi
  if gh release view "$TAG" -R "$PHP_MIRROR" >/dev/null 2>&1; then
    skip "$PHP_MIRROR release $TAG exists"
  else
    php_notes="$NOTES"; [[ -f "$PHP_NOTES" ]] && php_notes="$PHP_NOTES"
    gh release create "$TAG" -R "$PHP_MIRROR" --title "$TAG" --notes-file "$php_notes" --latest
  fi
else
  echo "    would create release $TAG on $MONO_REPO from $NOTES"
  echo "    would create release $TAG on $PHP_MIRROR from $([[ -f "$PHP_NOTES" ]] && echo "$PHP_NOTES" || echo "$NOTES")"
fi

# ---------------------------------------------------------------- 5. demo site
say "5. Demo site (gh-pages)"
scripts/build-pages.sh
if (( GO )); then
  tmp="$(mktemp -d)"
  cp -R _site/. "$tmp/"
  touch "$tmp/.nojekyll"
  (
    cd "$tmp"
    git init -q -b gh-pages
    git add -A
    git commit -q -m "Demo site for $TAG"
    git push -f "$(cd "$root" && git remote get-url origin)" gh-pages
  )
  rm -rf "$tmp"
  echo "    https://sitefinitysteve.github.io/diff-text/"
else
  echo "    would push _site/ to the gh-pages branch"
fi

say "Done$( (( GO )) || echo ' (dry run: nothing was published)')"
