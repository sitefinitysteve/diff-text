import { describe, expect, it } from 'vitest';
import { computeDiff } from '../computeDiff';
import { intraLineDiff } from '../lines';
import { computeSimilarity, prepareForSimilarity, similarityFromChanges } from '../similarity';

describe('computeSimilarity', () => {
  it('ignores whitespace-only changes (old metric gave 1.60)', () => {
    expect(computeSimilarity('a b', 'a          b')).toBe(1);
  });

  it('counts non-whitespace code points only', () => {
    // unchanged: Hello(5) + world(5) + !(1) = 11; old 12, new 11
    expect(computeSimilarity('Hello, world!', 'Hello world!')).toBeCloseTo(22 / 23, 12);
  });

  // Range and identity are properties (properties.test.ts P6); these are hand-computed values.
  it('handles empty inputs', () => {
    expect(computeSimilarity('', '')).toBe(1);
    expect(computeSimilarity('   ', '<p></p>')).toBe(1);
    expect(computeSimilarity('abc', '')).toBe(0);
    expect(computeSimilarity('', 'abc')).toBe(0);
  });

  it('strips tags and normalizes quotes', () => {
    expect(computeSimilarity('<p>“hi”</p>', '"hi"')).toBe(1);
  });

  it('uses code points, not UTF-16 units', () => {
    // 😀 is one code point; unchanged "a"(1), old "a😀" = 2, new "a" = 1 -> 2/3
    expect(computeSimilarity('a 😀', 'a')).toBeCloseTo(2 / 3, 12);
  });

  it('turns each tag into a space and collapses whitespace runs', () => {
    // "<p>Hello</p><p>world</p>" -> " Hello  world " -> "Hello world": two words, like the plain text.
    expect(prepareForSimilarity('<p>Hello</p><p>world</p>')).toBe('Hello world');
    expect(computeSimilarity('<p>Hello</p><p>world</p>', 'Hello world')).toBe(1);
    expect(prepareForSimilarity(' a \n\t b ', { html: false })).toBe('a b');
  });

  it('similarityFromChanges: 1 for two whitespace-only texts, clamped to 1 under ignoreCase', () => {
    // No non-ws code points on either side: 1 by definition, so the pair keeps its parts.
    expect(similarityFromChanges([], ' ', '  ')).toBe(1);
    expect(intraLineDiff(' ', '  ')).toBeDefined();
    // As one lines-mode token, "İ" (1 code point) equals "i̇" (2) under ignoreCase and the unchanged
    // value comes from new: 2*2/(1+2) = 4/3 without the clamp.
    const changes = computeDiff('lines', 'İ', 'i\u0307', { ignoreCase: true });
    expect(similarityFromChanges(changes, 'İ', 'i\u0307')).toBe(1);
  });
});
