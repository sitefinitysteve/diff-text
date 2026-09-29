import { describe, expect, it } from 'vitest';
import { computeSimilarity } from '../similarity';

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
});
