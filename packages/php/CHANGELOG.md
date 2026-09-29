# Changelog

All notable changes to php-diff-text are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.6.0] - Unreleased

1.6.0 brings the PHP package to parity with vue-diff-text and react-diff-text. All three now follow
one behavior contract (`SPEC.md` in the monorepo) and are tested against the same fixtures, so
PHP renders the same markup, byte for byte, as the JavaScript packages.

### Changed
- **Split view fidelity.** The intra-line diff is whitespace-aware (wordsWithSpace) and the old
  column's parts are re-read from the old line, so each column reproduces its own line exactly
  (indentation, tabs, whitespace-only changes, ignoreCase spellings).
- **Similarity input kind.** `Similarity::compute($old, $new, $html = true)`: tags are stripped only
  for HTML input (DiffHtml's threshold); the stats badge, heatmap, moves and timeline pass `false`.
  Similarity is directional (old → new).
- **Invalid UTF-8** becomes U+FFFD in every mode, lines included, one per maximal ill-formed
  subpart (as WHATWG `TextDecoder`), instead of `?` in some modes and raw bytes in others.
- **ignoreCase** lowercases exactly like JavaScript on every PHP version (Final_Sigma before PHP
  8.3, letters newer than the build's Unicode tables).
- **Engine rewrite.** The O(m·n) LCS engine is replaced by a port of jsdiff v8's greedy forward
  Myers search (O((N+M)·D)), including its tie-breaking, so every text mode returns the same change
  list as jsdiff. Tokens are interned to integer ids first (the ignoreCase key is computed once
  per token). When the direction trace would exceed its memory budget, a linear-space bisection
  takes over. Large, similar inputs are much faster; for example, a 100,000-token diff with a few
  edits takes about 60 ms.
- **Tokenizer fixes.** The tokenizers are ports of jsdiff v8's:
  - words keep punctuation as separate tokens and carry their surrounding whitespace;
  - adjacent changes share whitespace the same way as in jsdiff, so `words` no longer drops line
    breaks next to a change;
  - wordsWithSpace emits each newline as its own token;
  - lines and sentences split exactly as jsdiff does.

  Whitespace means JavaScript's `\s` set (including U+00A0, U+3000, …) rather than PCRE's `\s`.
  All lengths are Unicode code points.
- `Change` has a `count` property (number of tokens), and unchanged changes carry the new text's
  spelling (relevant with `ignoreCase`).
- **Similarity** is redefined and clamped to [0, 1]: tags stripped, quotes normalized, whitespace
  collapsed, then 2 × unchanged non-whitespace code points / (old + new). The old metric could
  exceed 1.
- **Tag-aware HTML diff.** `DiffHtml` tokenizes tags as atomic tokens, and highlight spans only
  wrap text, so the output stays valid HTML. An attribute-only change shows the new tag. A removed
  element keeps its tags where they are valid, and comments are dropped. `ignoreFormattingTags`
  (default true) and `orphanMatchThreshold` (default 0.3) match the JS packages, and the output is
  byte-identical to them (one engine for every platform: raw-text elements such as `<script>` are
  atomic, entities compare by decoded value, invalid UTF-8 becomes U+FFFD, unbalanced attribute
  quotes are text).
  `similarityThreshold` can also be passed in `$options`. A full replacement is wrapped in
  `<div class="diff-removed">` / `<div class="diff-added">` instead of `<span>`.
- Every added/removed element carries `data-change-index` (0-based, document order). Escaping
  uses exactly `&amp; &lt; &gt; &quot; &#39;`, and every `\r\n` or lone `\r` in the displayed text
  becomes `\n`, as HTML parsers do. Diffing still uses the original text.
- The bundled `css/style.css` is the shared stylesheet. It adds CSS variables for every view and
  opt-in dark mode; the existing variables keep working.

### Added
- Options: `ignoreCase` and `maxEditLength` for every text mode, plus `ignoreWhitespace`,
  `newlineIsToken` and `stripTrailingCr` for lines. Past `maxEditLength` edits the result is a
  whole replacement.
- `DiffUnified` / `DiffText::unified()`: unified line view with old/new line numbers,
  `contextLines` (default 3) and collapsed "N unchanged lines" rows.
- `DiffSplit` / `DiffText::split()`: side-by-side line view with word highlights inside changed
  lines.
- `DiffStats` / `DiffText::stats()`: added/removed/unchanged badge (lines or characters) with
  percent similarity.
- Five visualizations (static HTML + CSS, no JavaScript):
  - **Moved blocks** in the unified and split views: `detectMoves`, `minMoveLines`,
    `moveSimilarity` (`Moves` class).
  - **Change anchors**: `anchors` and `idPrefix` on every view that emits ids.
  - **Change minimap**: the `minimap` render option on text modes, unified and split (`Minimap`
    class).
  - **Rewrite heatmap**: `DiffText::heatmap()` / `DiffHeatmap`.
  - **Revision timeline**: `DiffText::timeline()` / `DiffTimeline`.
  - **Animated playback**: `DiffText::playback()` / `DiffPlayback`.
- A server-rendered demo page (`composer demo`) and an engine benchmark (`composer bench`).
- Tests: every case in the monorepo's `fixtures/*.json` (15 groups), jsdiff parity cases, and
  property tests.

### Moved
- The package now lives in `packages/php` of the diff-text monorepo, next to the Vue and React
  packages and the shared core, SPEC and fixtures. Its git history was imported.
- `sitefinitysteve/php-diff-text` is now a read-only mirror that CI splits from the monorepo.
  Packagist keeps reading it, so `composer require sitefinitysteve/php-diff-text` is unchanged.
  Releases are tagged `php-vX.Y.Z` in the monorepo and published as `vX.Y.Z` on the mirror.

### Requirements
- `ext-mbstring` is now required (PHP 8.1+ as before).

## [1.5.4] and earlier

Released from the standalone php-diff-text repository: word, character, line and sentence diffs,
an HTML diff with a similarity threshold, quote normalization and formatting-tag stripping.
