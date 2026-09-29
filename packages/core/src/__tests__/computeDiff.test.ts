import { describe, expect, it } from 'vitest';
import { cleanChanges, computeDiff, pickOptions } from '../computeDiff';
import type { Change } from '../types';

// Reconstruction, empty values, adjacent kinds and minimality are properties (properties.test.ts);
// maxEditLength edges are goldens (boundaries.test.ts). These are hand-checked examples.

const keep = (value: string, count: number): Change => ({ value, added: false, removed: false, count });

describe('computeDiff', () => {
  it('chars diff splits by code point', () => {
    // U+1F600 and U+1F601 are one code point (two UTF-16 units) each.
    expect(computeDiff('chars', 'a😀b', 'a😁b')).toStrictEqual([
      keep('a', 1),
      { value: '😀', added: false, removed: true, count: 1 },
      { value: '😁', added: true, removed: false, count: 1 },
      keep('b', 1),
    ]);
  });

  it('words diff dedupes whitespace (jsdiff v8, SPEC 6 example 1)', () => {
    expect(computeDiff('words', 'foo bar baz', 'foo baz')).toStrictEqual([
      keep('foo ', 1),
      { value: 'bar ', added: false, removed: true, count: 1 },
      keep('baz', 1),
    ]);
  });

  it('ignoreCase keeps the new text for unchanged runs', () => {
    expect(computeDiff('words', 'Hello World', 'hello world', { ignoreCase: true })).toStrictEqual([keep('hello world', 2)]);
  });

  it('only passes line options to lines mode', () => {
    expect(pickOptions('words', { ignoreWhitespace: true, newlineIsToken: true, stripTrailingCr: true })).toStrictEqual({});
    expect(pickOptions('lines', { ignoreWhitespace: true, stripTrailingCr: true, ignoreCase: true })).toStrictEqual({
      ignoreCase: true,
      ignoreWhitespace: true,
      stripTrailingCr: true,
    });
    // unknown options are dropped; booleans must be strictly true
    expect(pickOptions('chars', { oneChangePerToken: true } as never)).toStrictEqual({});
    expect(pickOptions('lines', { ignoreCase: 1, newlineIsToken: 'yes' } as never)).toStrictEqual({ ignoreCase: true, newlineIsToken: true });
  });

  it('stripTrailingCr makes CRLF and LF lines equal', () => {
    expect(computeDiff('lines', 'a\r\nb\r\n', 'a\nb\n', { stripTrailingCr: true })).toStrictEqual([keep('a\nb\n', 2)]);
  });
});

describe('cleanChanges (SPEC 7.2)', () => {
  it('drops empty values and merges same-kind neighbours without touching its input', () => {
    // jsdiff never produces these (properties.test.ts P3 checks the final output); cleanChanges
    // guarantees the contract anyway.
    const input: Change[] = [
      keep('a', 1),
      { value: '', added: true, removed: false, count: 1 },
      keep('b', 2),
      { value: 'x', added: false, removed: true, count: 1 },
      { value: 'y', added: false, removed: true, count: 3 },
      { value: 'z', added: true, removed: false, count: 1 },
    ];
    const copy = structuredClone(input);
    expect(cleanChanges(input)).toStrictEqual([
      keep('ab', 3),
      { value: 'xy', added: false, removed: true, count: 4 },
      { value: 'z', added: true, removed: false, count: 1 },
    ]);
    expect(input).toStrictEqual(copy);
  });
});
