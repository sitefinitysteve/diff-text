# diff-text — cross-platform plan (Vue · React · PHP)

Reviewed by Codex; its feedback is folded in below.

## Layout (monorepo, decided)
```
diff-text/                    one GitHub repo (the renamed sitefinitysteve/vue-diff-text), npm workspaces
  SPEC.md                     behavior contract all 3 libraries follow
  fixtures/*.json             canonical fixtures, generated from packages/core; PHP tests read them directly
  packages/core/              @diff-text/core: private workspace pkg, framework-agnostic TS; bundled into vue + react
  packages/vue/               npm: vue-diff-text (public API, entry points, dist/style.css path unchanged)
  packages/react/             npm: react-diff-text (1:1 with vue)
  packages/php/               Packagist: sitefinitysteve/php-diff-text, split to the php-diff-text mirror repo on release
  demo/                       shared demo content + css; per-platform demo apps
  .github/workflows/          ci.yml (js + php matrix), split-php.yml, release workflows
```
The old repos are not deleted: vue-diff-text is renamed to diff-text on GitHub (URLs redirect), and php-diff-text becomes a read-only split mirror (Packagist keeps working).

## Contract decisions
- **Text modes** (chars, words, wordsWithSpace, lines, sentences) follow **jsdiff v8** semantics. Vue and React call jsdiff v8 directly. PHP ports jsdiff's tokenizers (punctuation/word boundaries, sentence splitting, line options).
- **Options per mode:** ignoreCase (all modes); ignoreWhitespace, newlineIsToken, stripTrailingCr (lines); intlSegmenter is excluded (JS-only). Unsupported options are documented per platform.
- **Lengths** are counted in Unicode code points everywhere (JS `[...s].length`, PHP `mb_strlen`).
- **Similarity** is redefined and clamped to [0,1] (the current Vue metric can exceed 1: `a b` → `a     b` gives 1.60). New metric: strip tags, normalize quotes, collapse whitespace, run a word diff, then `2·unchanged_non_ws_codepoints / (old_non_ws + new_non_ws)`. Released as a documented bugfix.
- **HTML:** Vue and React use diffblazer. PHP gets a tag-aware diff where tags are atomic tokens and spans only ever wrap text runs, split at tag boundaries. The parity target is structural: valid HTML and the same highlighted text. Byte-identical output is not the target. Full replacement wraps in `<div>`, not `<span>`, so block HTML stays valid. Fixtures cover attribute-only changes, entities, comments, void elements, quoted `>`, and empty inputs.
- Raw-HTML output is trusted input. Callers must sanitize untrusted input; the READMEs will say so.

## PHP engine
Trim the common prefix and suffix, intern tokens to int keys (lowercased once for ignoreCase), then run Myers with linear-space reconstruction (middle snake). Build the change list from indices. Add a `maxEditLength` option: past that bound, fall back to whole replacement, as jsdiff does. Declare `ext-mbstring`. Benchmarks sized by token count and edit distance, covering unrelated and repetitive inputs.

## New views (all 3 platforms, shared line/hunk model in core)
1. **Split (side-by-side):** rows pair removed lines with added lines, with intra-line word highlighting on paired rows. Intra-line work is bounded. Stacks responsively on narrow widths.
2. **Unified:** old/new line-number gutters, `contextLines` (default 3), collapsible "N unchanged lines" hunks. Keyboard accessible; PHP uses `<details>`.
3. **Stats:** `{ added, removed, unchanged }` in explicit units (lines for line views, code points for text), plus similarity. `DiffStats` badge.
4. **Navigation:** `data-change-index` attributes on changes. Vue/React expose `next()`/`prev()`. Non-color indicators (+/−, aria labels). Explicit empty and no-change states.
Deferred: unified-patch export, per Codex (hunk headers, CRLF, and no-final-newline handling make it more than a small follow-up).

## Order
1. SPEC + packages/core + fixture generator + fixtures (in parallel: PHP engine/tokenizers/HTML, React scaffold)
2. In parallel: PHP rewrite · Vue upgrade (jsdiff v8, core, new components) · React package (1:1 with Vue)
3. Demos: redesigned demo for all three (same design), plus screenshots in each README
4. Versions: vue/php → 1.6.0, react → 1.6.0 (same version line for parity). CHANGELOGs call out the behavior fixes. No publishing or pushing without an explicit OK.
