# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.6.0] - Unreleased

First release of the React package, a 1:1 port of vue-diff-text. It starts at 1.6.0 to share a version line with vue-diff-text. Compared with vue-diff-text 1.5.x and early builds of this port:

### Changed (behavior fixes; see "Changes in 1.6.0" in the README)
- Split view: each column reproduces its own line exactly (the intra-line diff is now whitespace-aware, so the old column no longer shows the new indentation, and whitespace-only changes are highlighted)
- `computeSimilarity(old, new, { html })`: tags are stripped only for HTML input (default `true`, used by the HTML view's threshold); the stats badge, heatmap, moves and timeline compare plain text, so `<` and `>` count. Similarity is directional (old → new)
- Lone surrogates in any input are replaced with U+FFFD before diffing (`wellFormed()`)
- Diff logic now comes from the shared `@diff-text/core` (bundled), so Vue, React and PHP produce the same output
- Text modes follow jsdiff v8 (was v5): word diffs attribute surrounding whitespace more precisely (e.g. `foo\nbar baz` → `foo baz` now shows `\nbar` removed instead of `bar ` with the line break lost), and punctuation/whitespace tokenization matches v8
- `options` is an explicit list: `ignoreCase` and `maxEditLength` for every text mode, plus `ignoreWhitespace`, `newlineIsToken` and `stripTrailingCr` for lines; other jsdiff options are ignored
- Similarity is redefined and clamped to [0, 1]: tags stripped, quotes normalized, whitespace collapsed, non-whitespace code points counted (the old metric could exceed 1, e.g. `a b` vs `a          b` gave 1.6)
- DiffHtml full replacement renders `<div class="diff-removed">` / `<div class="diff-added">` instead of `<span>`, so block HTML stays valid, and the diff is no longer wrapped in an extra inner `<div>`
- DiffHtml uses the shared HTML engine (the same as php-diff-text, byte-identical output) instead of diffblazer: output is always balanced HTML, content after `<script>`/`<style>` is kept, removed list items and table rows stay inside their list or table, entities compare by decoded value, emoji are never split, and a removed marker is never nested inside an added one
- DiffHtml markers are fixed; `options.markers` is ignored
- Every added/removed element carries `data-change-index` (0-based, document order); unchanged spans no longer render an empty `class=""`
- New shared stylesheet (`dist/style.css`) with more CSS variables and opt-in dark mode; the existing variables keep working

### Added
- DiffHtml `options.ignoreCase` and `options.maxEditLength`
- `DiffUnified`: unified line view with line numbers, `contextLines` (default 3) and collapsed "N unchanged lines" rows that expand on click
- `DiffSplit`: side-by-side line view with intra-line word highlights
- `DiffStats`: added/removed/unchanged badge with similarity (`mode`, `showSimilarity`)
- Navigation on every diff view: `next()`, `prev()`, `goTo(i)` and `count` (components forward a ref via `forwardRef` + `useImperativeHandle`)
- Exports of the core functions: `computeDiff`, `diffHtml`, `computeSimilarity`, `buildHunks`, `buildSplitRows`, `computeStats`, `lineStats`, `normalizeQuotes`, `stripFormattingTags`, plus their types
- `DiffHeatmap`: rewrite heatmap; each sentence of the new text shaded by how much it changed (heat 0-4), removed sentences inline, legend (`options.ignoreCase`, `showRemoved`, `legend`)
- `DiffTimeline`: several versions as CSS-only tabs, one per consecutive pair, each with stats and a diff (`versions`, `labels`, `mode`, `options`)
- `DiffPlayback`: a text diff whose changes animate in order, with a CSS-only Replay toggle and reduced-motion support (`mode`, `speed`, `options`)
- Moved blocks on `DiffUnified` / `DiffSplit`: `detectMoves`, `minMoveLines`, `moveSimilarity`
- `minimap` on the text components, `DiffUnified` and `DiffSplit`: a sticky strip of links to every change
- `anchors` and `idPrefix` on every component that emits ids; the default prefix is unique per instance and SSR-stable (`useId()`)
- Fixture-parity tests: every case in the monorepo's `fixtures/*.json` (all 15 groups) is mounted and compared structurally with the canonical markup
- SSR (node) and hydration tests: every fixture is server-rendered and hydrated without mismatches

### Fixed
- Expanded "N unchanged lines" blocks and the current navigation highlight no longer reset when a parent re-renders with an equal inline `options` object; UI state is now keyed on the content (texts, `contextLines`, the value of `options`)
- `ref.current.count` is a live getter instead of a snapshot taken when the handle was created
- Text containing `\r\n` or `\r` is rendered with `\n`, matching server-rendered markup

### Removed
- Runtime dependencies: `diff` is bundled, `diffblazer` is no longer used, and `@types/diff` is gone
- DiffHtml options `repeatingWordsAccuracy`, `matchGranularity`, `ignoreWhiteSpaceDifferences`, `atomicTags` and `markers` (diffblazer-only; ignored if passed). `orphanMatchThreshold` is kept
