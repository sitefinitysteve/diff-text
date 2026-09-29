import { describe, expect, it } from 'vitest';
import { buildHunks, buildRows, buildSplitRows, splitLines } from '../lines';
import { lineStats } from '../stats';

const lines = (n: number, f = (i: number) => `line ${i}`) => Array.from({ length: n }, (_, i) => f(i + 1)).join('\n') + '\n';

describe('lines model', () => {
  it('splitLines strips LF and CRLF terminators', () => {
    expect(splitLines('a\r\nb\nc')).toStrictEqual(['a', 'b', 'c']);
    expect(splitLines('a\n')).toStrictEqual(['a']);
    expect(splitLines('\n\n')).toStrictEqual(['', '']);
    // A lone CR is not a terminator; only a final CR before LF is removed.
    expect(splitLines('a\rb\r\r\n')).toStrictEqual(['a\rb\r']);
  });

  it('numbers rows', () => {
    expect(buildRows('a\nb\n', 'a\nc\n')).toStrictEqual([
      { type: 'equal', oldNo: 1, newNo: 1, text: 'a' },
      { type: 'removed', oldNo: 2, text: 'b' },
      { type: 'added', newNo: 2, text: 'c' },
    ]);
  });

  it('collapses context outside contextLines', () => {
    const a = lines(20);
    const b = lines(20, (i) => (i === 10 ? 'changed' : `line ${i}`));
    const hunks = buildHunks(a, b);
    expect(hunks.map((h) => h.type)).toStrictEqual(['collapsed', 'hunk', 'collapsed']);
    expect(hunks[0]).toMatchObject({ count: 6, oldStart: 1, newStart: 1 });
    expect(hunks[1]).toMatchObject({ oldStart: 7, oldLines: 7, newStart: 7, newLines: 7 });
    expect(hunks[2]).toMatchObject({ count: 7, oldStart: 14, newStart: 14 });
    expect(lineStats(hunks)).toStrictEqual({ added: 1, removed: 1, unchanged: 19, unit: 'lines' });
  });

  it('merges nearby changes into one hunk and splits distant ones', () => {
    const a = lines(30);
    const near = lines(30, (i) => (i === 5 || i === 11 ? 'x' : `line ${i}`));
    expect(buildHunks(a, near).filter((h) => h.type === 'hunk')).toHaveLength(1);
    // Changes at 5 and 14 leave rows 9-10 hidden between their context windows.
    const far = lines(30, (i) => (i === 5 || i === 14 ? 'x' : `line ${i}`));
    expect(buildHunks(a, far).filter((h) => h.type === 'hunk')).toHaveLength(2);
  });

  it('contextLines 0 shows only changed rows', () => {
    const hunks = buildHunks('a\nb\nc\nd\ne\n', 'a\nb\nC\nd\ne\n', { contextLines: 0 });
    expect(hunks.map((h) => h.type)).toStrictEqual(['collapsed', 'hunk', 'collapsed']);
  });

  it('never folds a single unchanged line', () => {
    const hunks = buildHunks('a\nb\nc\n', 'a\nB\nc\n', { contextLines: 0 });
    expect(hunks.map((h) => h.type)).toStrictEqual(['hunk']);
    const far = buildHunks(lines(30), lines(30, (i) => (i === 5 || i === 13 ? 'x' : `line ${i}`)));
    expect(far.filter((h) => h.type === 'hunk')).toHaveLength(1);
  });

  it('identical input is one collapsed block; empty input is no blocks', () => {
    expect(buildHunks('a\nb\n', 'a\nb\n').map((h) => h.type)).toStrictEqual(['collapsed']);
    expect(buildHunks('', '')).toStrictEqual([]);
  });

  it('pairs removed and added lines positionally with intra-line diffs', () => {
    const [hunk] = buildSplitRows('one two three\nold\n', 'one 2 three\n', { contextLines: 5 });
    if (!hunk || hunk.type !== 'hunk') throw new Error('expected hunk');
    expect(hunk.rows.map((r) => r.type)).toStrictEqual(['modified', 'removed']);
    const first = hunk.rows[0]!;
    // wordsWithSpace tokens: only "two" -> "2" differs; "one " is 2 tokens, " three" 2 tokens.
    expect(first.left?.parts).toStrictEqual([
      { value: 'one ', added: false, removed: false, count: 2 },
      { value: 'two', added: false, removed: true, count: 1 },
      { value: ' three', added: false, removed: false, count: 2 },
    ]);
    expect(first.right?.parts).toStrictEqual([
      { value: 'one ', added: false, removed: false, count: 2 },
      { value: '2', added: true, removed: false, count: 1 },
      { value: ' three', added: false, removed: false, count: 2 },
    ]);
    expect(hunk.rows[1]!.right).toBeUndefined();
  });
});
