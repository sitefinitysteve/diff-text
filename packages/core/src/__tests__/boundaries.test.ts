/**
 * Hand-verified boundary goldens. Every expected value here was worked out by hand
 * from SPEC.md (the comment next to it says how); none was copied from the output.
 */
import { describe, expect, it } from 'vitest';
import { computeDiff } from '../computeDiff';
import { buildHunks, buildSplitRows, intraLineDiff, splitParts } from '../lines';
import { computeSimilarity } from '../similarity';
import type { Change, SplitHunk, SplitRow } from '../types';

const keep = (value: string, count: number): Change => ({ value, added: false, removed: false, count });
const del = (value: string, count: number): Change => ({ value, added: false, removed: true, count });
const add = (value: string, count: number): Change => ({ value, added: true, removed: false, count });

/** The single split row of a one-line-pair diff. */
function onlyRow(hunks: SplitHunk[]): SplitRow {
  expect(hunks).toHaveLength(1);
  const h = hunks[0]!;
  if (h.type !== 'hunk') throw new Error('expected a visible hunk');
  expect(h.rows).toHaveLength(1);
  return h.rows[0]!;
}

describe('split cells reproduce each side exactly (SPEC 10)', () => {
  it('keeps the old indentation in the left column', () => {
    // wordsWithSpace tokens: old ["    ","return"," ","x",";"], new ["  ","return"," ","y",";"].
    // The first tokens differ, so Myers deletes "    " then inserts "  " (a deletion is preferred
    // on ties), keeps "return " (2 tokens), replaces x by y and keeps ";".
    const row = onlyRow(buildSplitRows('    return x;\n', '  return y;\n'));
    expect(row.type).toBe('modified');
    expect(row.left!.parts).toStrictEqual([del('    ', 1), keep('return ', 2), del('x', 1), keep(';', 1)]);
    expect(row.right!.parts).toStrictEqual([add('  ', 1), keep('return ', 2), add('y', 1), keep(';', 1)]);
  });

  it('keeps tabs', () => {
    // Tokens old ["\t","if"," ","(","a",")"], new ["\t","if"," ","(","b",")"]: only a -> b changes.
    const row = onlyRow(buildSplitRows('\tif (a)\n', '\tif (b)\n'));
    expect(row.left!.parts).toStrictEqual([keep('\tif (', 4), del('a', 1), keep(')', 1)]);
    expect(row.right!.parts).toStrictEqual([keep('\tif (', 4), add('b', 1), keep(')', 1)]);
  });

  it('shows a whitespace-only change instead of hiding it (T14)', () => {
    // "a b" -> "a  b": tokens ["a"," ","b"] vs ["a","  ","b"]. Unchanged non-ws = 2 of 2+2 -> 1 >= 0.3,
    // so parts are kept, and the changed space run is highlighted on each side.
    const row = onlyRow(buildSplitRows('a b\n', 'a  b\n'));
    expect(row.left!.parts).toStrictEqual([keep('a', 1), del(' ', 1), keep('b', 1)]);
    expect(row.right!.parts).toStrictEqual([keep('a', 1), add('  ', 1), keep('b', 1)]);
  });

  it('with ignoreCase the left column keeps the old spelling (T12)', () => {
    // Tokens old ["Hello"," ","World"], new ["hello"," ","world","!"]; with ignoreCase the first three
    // compare equal (count 3) and "!" is added. Similarity = 2*10/(10+11) = 20/21 >= 0.3.
    const changes = intraLineDiff('Hello World', 'hello world!', { ignoreCase: true });
    expect(changes).toStrictEqual([keep('hello world', 3), add('!', 1)]);
    expect(splitParts(changes!, 'Hello World')).toStrictEqual({
      left: [keep('Hello World', 3)],
      right: [keep('hello world', 3), add('!', 1)],
    });
    // Without ignoreCase "Hello"/"World" are changed tokens: unchanged non-ws is only 0 -> dropped.
    expect(intraLineDiff('Hello World', 'hello world!')).toBeUndefined();
  });
});

describe('intra-line bounds (SPEC 10, T6 and T7)', () => {
  // 'x '.repeat(498) is 996 code points; + 'old!' makes exactly 1000.
  const base = 'x '.repeat(498);

  it('diffs lines of exactly 1000 code points and skips 1001 on either side', () => {
    const old1000 = base + 'old!';
    const new1000 = base + 'new!';
    expect([...old1000]).toHaveLength(1000);
    // 498 "x" + "!" unchanged = 499 non-ws of 502 per side -> 998/1004, far above 0.3.
    expect(intraLineDiff(old1000, new1000)).toStrictEqual([
      keep(base, 996),
      del('old', 1),
      add('new', 1),
      keep('!', 1),
    ]);
    expect(intraLineDiff(old1000 + '?', new1000)).toBeUndefined();
    expect(intraLineDiff(old1000, new1000 + '?')).toBeUndefined();
  });

  it('counts code points, not UTF-16 units', () => {
    // '😀 ' is 2 code points but 3 UTF-16 units: 1000 code points = 1498 units, still diffed.
    const emoji = '😀 '.repeat(498);
    const old1000 = emoji + 'old!';
    expect(old1000.length).toBe(1498);
    expect(intraLineDiff(old1000, emoji + 'new!')).toBeDefined();
    expect(intraLineDiff(old1000 + '😀', emoji + 'new!')).toBeUndefined();
  });

  it('keeps parts at exactly 0.3 similarity and drops them just below', () => {
    // "abc defghij" vs "abc klmnopq": unchanged "abc" = 3 non-ws of 10 + 10 -> 6/20, which is
    // exactly the double 0.3 (IEEE division is correctly rounded), so "< 0.3" is false.
    expect(computeSimilarity('abc defghij', 'abc klmnopq', { html: false })).toBe(0.3);
    expect(intraLineDiff('abc defghij', 'abc klmnopq')).toStrictEqual([
      keep('abc ', 2),
      del('defghij', 1),
      add('klmnopq', 1),
    ]);
    // One more letter per side: 6/22 = 0.2727... < 0.3.
    expect(intraLineDiff('abc defghijk', 'abc klmnopqr')).toBeUndefined();
  });
});

describe('maxEditLength edges (SPEC 3 and 7, T8)', () => {
  it('uses the normal diff when the limit equals the edit distance', () => {
    // words: "a b c" -> "a x c" needs 2 edits (remove "b ", add "x ").
    expect(computeDiff('words', 'a b c', 'a x c', { maxEditLength: 2 })).toStrictEqual([
      keep('a ', 1),
      del('b', 1),
      add('x', 1),
      keep(' c', 1),
    ]);
    // One below: whole replacement, counts are the token counts (3 words per side).
    expect(computeDiff('words', 'a b c', 'a x c', { maxEditLength: 1 })).toStrictEqual([
      del('a b c', 3),
      add('a x c', 3),
    ]);
  });

  it('floors fractional limits and ignores negative or non-finite ones', () => {
    // 1.7 floors to 1 < 2 edits -> fallback.
    expect(computeDiff('words', 'a b c', 'a x c', { maxEditLength: 1.7 })).toHaveLength(2);
    // Negative and NaN are ignored: the normal diff (4 changes, see above).
    expect(computeDiff('words', 'a b c', 'a x c', { maxEditLength: -1 })).toHaveLength(4);
    expect(computeDiff('words', 'a b c', 'a x c', { maxEditLength: NaN })).toHaveLength(4);
  });

  it('at 0 anything but identical input falls back', () => {
    // chars "ab" -> "ac" needs 2 edits > 0: removed "ab" (2 chars), added "ac" (2 chars).
    expect(computeDiff('chars', 'ab', 'ac', { maxEditLength: 0 })).toStrictEqual([del('ab', 2), add('ac', 2)]);
    // Identical input is found by the initial common-prefix scan, before any edit is counted.
    expect(computeDiff('chars', 'ab', 'ab', { maxEditLength: 0 })).toStrictEqual([keep('ab', 2)]);
    // Deleting everything also takes 2 edits: the fallback emits only the removed side ("a " and "b").
    expect(computeDiff('words', 'a b', '', { maxEditLength: 0 })).toStrictEqual([del('a b', 2)]);
  });
});

describe('contextLines normalization (SPEC 9.2, T9)', () => {
  // 20 numbered lines with line 11 changed: rows = 10 equal, removed 11, added 11, 9 equal (21 rows).
  const lines = (f: (i: number) => string) => Array.from({ length: 20 }, (_, k) => f(k + 1)).join('\n') + '\n';
  const a = lines((i) => `line ${i}`);
  const b = lines((i) => (i === 11 ? 'changed' : `line ${i}`));
  const shape = (contextLines: unknown) =>
    buildHunks(a, b, { contextLines: contextLines as number }).map((h) =>
      h.type === 'collapsed' ? `C${h.count}` : `H${h.rows.length}`,
    );

  it('treats negative, NaN and non-numbers as the default 3', () => {
    // Context 3: lines 8-10 before and 12-14 after -> hidden 1-7 (7), visible 3+2+3 = 8, hidden 15-20 (6).
    for (const bad of [-1, NaN, '2', null, undefined]) expect(shape(bad)).toStrictEqual(['C7', 'H8', 'C6']);
  });

  it('floors fractions and accepts Infinity', () => {
    // 1.7 -> 1: hidden 1-9 (9), visible 10, -, +, 12 (4), hidden 13-20 (8).
    expect(shape(1.7)).toStrictEqual(['C9', 'H4', 'C8']);
    // Infinity: every row is within context.
    expect(shape(Infinity)).toStrictEqual(['H21']);
  });

  it('identical single-line input is one collapsed block of 1 (T10)', () => {
    // No changed rows, so the "never fold a single line" rule does not apply.
    expect(buildHunks('a\n', 'a\n')).toStrictEqual([
      { type: 'collapsed', count: 1, oldStart: 1, newStart: 1, rows: [{ type: 'equal', oldNo: 1, newNo: 1, text: 'a' }] },
    ]);
  });
});

describe('split at contextLines 0 (T13)', () => {
  it('keeps line numbers of the paired row and folds both 2-line runs', () => {
    // Rows: a, b equal; c removed; X added; d, e equal. Only the pair is visible; each hidden run
    // has 2 rows so it folds. "c" vs "X" share nothing (similarity 0 < 0.3): no parts.
    expect(buildSplitRows('a\nb\nc\nd\ne\n', 'a\nb\nX\nd\ne\n', { contextLines: 0 })).toStrictEqual([
      {
        type: 'collapsed',
        count: 2,
        oldStart: 1,
        newStart: 1,
        rows: [
          { type: 'equal', oldNo: 1, newNo: 1, text: 'a' },
          { type: 'equal', oldNo: 2, newNo: 2, text: 'b' },
        ],
      },
      {
        type: 'hunk',
        oldStart: 3,
        oldLines: 1,
        newStart: 3,
        newLines: 1,
        rows: [
          { type: 'modified', left: { type: 'removed', lineNo: 3, text: 'c' }, right: { type: 'added', lineNo: 3, text: 'X' } },
        ],
      },
      {
        type: 'collapsed',
        count: 2,
        oldStart: 4,
        newStart: 4,
        rows: [
          { type: 'equal', oldNo: 4, newNo: 4, text: 'd' },
          { type: 'equal', oldNo: 5, newNo: 5, text: 'e' },
        ],
      },
    ]);
  });
});

describe('similarity input kinds and direction (SPEC 8)', () => {
  it('strips tags only for HTML input', () => {
    // html (default): "< 2 and 3 >" is a "tag", leaving "1 2" vs "1 2" -> 1.
    expect(computeSimilarity('1 < 2 and 3 > 2', '1 2')).toBe(1);
    // text: old non-ws "1<2and3>2" = 9, new "12" = 2. The words diff keeps "1" and the final "2"
    // (2 non-ws code points) -> 2*2/11.
    expect(computeSimilarity('1 < 2 and 3 > 2', '1 2', { html: false })).toBe(4 / 11);
  });

  it('is directional: old -> new, not symmetric', () => {
    // "cc b" -> "b!cc": the forward diff keeps only "b" (1 of 3 + 4 non-ws) -> 2/7;
    // the reverse diff keeps "cc" (2) -> 4/7.
    expect(computeSimilarity('cc b', 'b!cc', { html: false })).toBe(2 / 7);
    expect(computeSimilarity('b!cc', 'cc b', { html: false })).toBe(4 / 7);
  });
});

describe('lone surrogates become U+FFFD (SPEC 1)', () => {
  it('in every text mode', () => {
    // "\uD83D" alone is not a code point; it is replaced before tokenizing, so it diffs as U+FFFD.
    expect(computeDiff('chars', 'x\uD83Dy', 'xy')).toStrictEqual([keep('x', 1), del('\uFFFD', 1), keep('y', 1)]);
    expect(computeDiff('lines', 'a\uDE00\n', 'a\uFFFD\n')).toStrictEqual([keep('a\uFFFD\n', 1)]);
    for (const mode of ['words', 'wordsWithSpace', 'sentences'] as const) {
      // words / wordsWithSpace: "x" and the punctuation-like U+FFFD are 2 tokens; sentences: 1.
      expect(computeDiff(mode, 'x\uDC00', 'x\uFFFD')).toStrictEqual([keep('x\uFFFD', mode === 'sentences' ? 1 : 2)]);
    }
    // A valid pair is untouched.
    expect(computeDiff('chars', 'x\uD83D\uDE00', 'x')).toStrictEqual([keep('x', 1), del('\uD83D\uDE00', 1)]);
  });

  it('in the line views and similarity', () => {
    expect(buildSplitRows('\uD800\n', '\uFFFD\n')).toStrictEqual([
      { type: 'collapsed', count: 1, oldStart: 1, newStart: 1, rows: [{ type: 'equal', oldNo: 1, newNo: 1, text: '\uFFFD' }] },
    ]);
    expect(computeSimilarity('a\uD800', 'a\uFFFD', { html: false })).toBe(1);
  });
});
