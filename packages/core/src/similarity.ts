import { diffWords } from 'diff';
import type { Change } from './types';
import { normalizeQuotes } from './normalize';
import { wellFormed } from './computeDiff';

export interface SimilarityOptions {
  /**
   * The inputs are HTML: strip tags (each `<...>` becomes a space) before comparing.
   * Default true (the HTML full-replacement threshold). Text views pass false, so a
   * plain-text `<` or `>` is compared like any other character.
   */
  html?: boolean;
}

const WS = /\s/u;

/** Count code points that are not whitespace (JS `\s`). */
export function nonWhitespaceLength(text: string): number {
  let n = 0;
  for (const ch of text) if (!WS.test(ch)) n++;
  return n;
}

function clamp01(x: number): number {
  if (!(x > 0)) return 0; // also maps NaN to 0
  return x > 1 ? 1 : x;
}

/**
 * Similarity of a finished word diff: 2 * unchanged_non_ws / (old_non_ws + new_non_ws).
 * Both sides with no non-whitespace content -> 1. Clamped to [0, 1].
 */
export function similarityFromChanges(changes: Change[], oldText: string, newText: string): number {
  const oldLen = nonWhitespaceLength(oldText);
  const newLen = nonWhitespaceLength(newText);
  if (oldLen + newLen === 0) return 1;
  let unchanged = 0;
  for (const c of changes) if (!c.added && !c.removed) unchanged += nonWhitespaceLength(c.value);
  return clamp01((2 * unchanged) / (oldLen + newLen));
}

/**
 * Prepare text for the similarity metric: replace lone surrogates, strip tags (HTML input
 * only), normalize quotes, collapse whitespace.
 */
export function prepareForSimilarity(text: string, options: SimilarityOptions = {}): string {
  const s = wellFormed(text);
  return normalizeQuotes(options.html === false ? s : s.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Similarity of old -> new in [0, 1] (see SPEC.md "Similarity").
 * 1. strip tags (each `<...>` becomes a space) unless options.html is false,
 * 2. normalize quotes, 3. collapse whitespace runs to one space and trim,
 * 4. word diff old -> new (jsdiff v8 diffWords),
 * 5. 2 * unchanged non-ws code points / (old non-ws + new non-ws).
 *
 * Directional: the diff runs old -> new, and where several minimal diffs exist the
 * one chosen can keep different words than the reverse diff would, so
 * computeSimilarity(a, b) and computeSimilarity(b, a) can differ.
 */
export function computeSimilarity(oldText: string, newText: string, options: SimilarityOptions = {}): number {
  const a = prepareForSimilarity(oldText, options);
  const b = prepareForSimilarity(newText, options);
  if (a === '' && b === '') return 1;
  if (a === '' || b === '') return 0;
  return similarityFromChanges(diffWords(a, b), a, b);
}
