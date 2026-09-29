# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.5.0] - 2026-03-10

### Fixed
- Curly/smart quotes (`\u201C` `\u201D` `\u2018` `\u2019`) no longer produce noisy diff artifacts when compared against straight quotes — quotes are normalized before diffing
- `computeTextSimilarity` now normalizes quotes before comparison, preventing false similarity penalties from quote style differences

### Added
- `ignoreFormattingTags` prop on DiffHtml — when `true`, strips inline formatting tags (`<strong>`, `<em>`, `<b>`, `<i>`, `<u>`, `<s>`, `<mark>`, `<sub>`, `<sup>`) before diffing so that formatting-only changes don't produce spurious diffs
- `normalizeQuotes` and `stripFormattingTags` utilities in `src/utils/normalizeHtml.ts`
- 40 new tests covering quote normalization, formatting tag stripping, and integration scenarios

## [1.4.0] - 2026-03-08

### Added
- `similarity-threshold` prop for DiffHtml — when text similarity falls below the threshold, renders a clean full replacement (old text deleted, new text added) instead of garbled word-level diff
- `computeTextSimilarity` utility using Dice coefficient via `diffWords`
- Test suite with Vitest covering all 6 component types and similarity utility
- Demo section showing similarity threshold with side-by-side comparison
- Playground threshold slider for DiffHtml

### Changed
- DiffHtml template now supports conditional full-replacement rendering

## [1.3.0] - 2025-06-24

### Added
- DiffHtml component using diffblazer for HTML-aware diffing
- `diffblazer` dependency for HTML diff support

### Changed
- Updated description for clarity on component functionality

## [1.2.1] - 2025-06-20

### Fixed
- CSS import documentation — removed automatic CSS import, users must import explicitly

## [1.2.0] - 2025-06-20

### Changed
- Converted from scoped CSS to global CSS with `.text-diff` class scoping for easier customization

## [1.1.2] - 2025-06-19

### Added
- Specific CSS class names per component (`text-diff-chars`, `text-diff-words`, etc.) for targeted styling

### Fixed
- Vue dependency moved to peerDependencies to prevent multiple Vue instances

## [1.1.1] - 2025-06-19

### Fixed
- Module resolution — corrected file paths in package.json

## [1.1.0] - 2025-06-19

### Added
- DiffChars, DiffWords, DiffLines, DiffSentences components
- Interactive demo app with playground
- CSS variable support for customizing diff colors
- Options passthrough to underlying jsdiff library

### Changed
- Renamed from single TextDiff to multiple specialized components

## [1.0.0] - 2025-06-18

### Added
- Initial release with DiffWordsWithSpace component (exported as TextDiff)
- Vue 3 Composition API support
- Built-in diff styling with CSS variables

[1.5.0]: https://github.com/sitefinitysteve/vue-diff-text/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/sitefinitysteve/vue-diff-text/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/sitefinitysteve/vue-diff-text/compare/v1.2.1...v1.3.0
[1.2.1]: https://github.com/sitefinitysteve/vue-diff-text/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/sitefinitysteve/vue-diff-text/compare/v1.1.2...v1.2.0
[1.1.2]: https://github.com/sitefinitysteve/vue-diff-text/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/sitefinitysteve/vue-diff-text/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/sitefinitysteve/vue-diff-text/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/sitefinitysteve/vue-diff-text/releases/tag/v1.0.0
