import { describe, expect, it } from 'vitest';
import { computeDiff } from '../computeDiff';
import { buildHunks, buildSplitRows } from '../lines';
import { formatPercent, hundredths, minimapMarksLines, minimapMarksText, renderMinimap, renderWithMinimap } from '../minimap';
import { renderText, renderUnified } from '../render';
import { prng, pick } from './prng';

describe('minimap', () => {
  it('rounds half up to two decimals with integer math', () => {
    expect(hundredths(1, 3)).toBe(3333);
    expect(hundredths(2, 3)).toBe(6667);
    expect(hundredths(1, 800)).toBe(13); // 0.125 -> 0.13
    expect(hundredths(1, 0)).toBe(0);
    expect(formatPercent(1250)).toBe('12.50%');
    expect(formatPercent(5)).toBe('0.05%');
    expect(formatPercent(10000)).toBe('100.00%');
  });

  it('positions text-mode marks by code-point offset in the new text', () => {
    const marks = minimapMarksText(computeDiff('chars', 'ab', 'a\u{1F600}b'));
    expect(marks).toStrictEqual([{ index: 0, kind: 'added', top: 3333, height: 3334 }]);
  });

  it('gives unified and split the same marks', () => {
    const a = Array.from({ length: 30 }, (_, i) => `l${i}`).join('\n') + '\n';
    const b = a.replace('l3\n', 'L3\n').replace('l20\n', '').replace('l27\n', 'l27\nnew\n');
    expect(minimapMarksLines(buildSplitRows(a, b))).toStrictEqual(minimapMarksLines(buildHunks(a, b)));
  });

  it('renders links to anchored changes', () => {
    const changes = computeDiff('words', 'a b', 'a c');
    const diff = renderText('words', changes, { anchors: true, idPrefix: 'x' });
    expect(diff).toContain('<span class="diff-removed" id="x-change-0" data-change-index="0">b</span>');
    const nav = renderMinimap(minimapMarksText(changes), { idPrefix: 'x' });
    expect(nav).toBe(
      '<nav class="text-diff-minimap" aria-label="Change minimap">' +
        '<a class="diff-minimap-mark diff-minimap-removed" href="#x-change-0" style="top:66.67%;height:0.00%" aria-label="Change 1: removed"></a>' +
        '<a class="diff-minimap-mark diff-minimap-added" href="#x-change-1" style="top:66.67%;height:33.33%" aria-label="Change 2: added"></a></nav>',
    );
    expect(renderWithMinimap(diff, nav)).toBe(`<div class="text-diff-with-minimap">${diff}${nav}</div>`);
  });

  it('anchors default off, so existing markup is unchanged', () => {
    const hunks = buildHunks('a\n', 'b\n');
    expect(renderUnified(hunks)).not.toContain(' id=');
    expect(renderUnified(hunks, { anchors: true })).toContain('id="td-change-0"');
  });

  it('property: every mark stays within 0..100% and marks are in document order', () => {
    const rand = prng(3);
    const words = ['a', 'b', 'c', 'dd', '\u{1F600}', '東', ' ', '\n'];
    for (let k = 0; k < 300; k++) {
      const make = () => Array.from({ length: Math.floor(rand() * 40) }, () => pick(rand, words)).join('');
      const a = make();
      const b = make();
      for (const marks of [
        minimapMarksText(computeDiff('chars', a, b)),
        minimapMarksText(computeDiff('words', a, b)),
        minimapMarksLines(buildHunks(a, b, { contextLines: Math.floor(rand() * 3) })),
        minimapMarksLines(buildSplitRows(a, b, { detectMoves: true })),
      ]) {
        let prevTop = 0;
        marks.forEach((m, i) => {
          expect(m.index).toBe(i);
          expect(m.top).toBeGreaterThanOrEqual(0);
          expect(m.height).toBeGreaterThanOrEqual(0);
          expect(m.top + m.height).toBeLessThanOrEqual(10000);
          expect(m.top).toBeGreaterThanOrEqual(prevTop);
          prevTop = m.top;
        });
      }
    }
  });

  it('prints two decimals, padding only single-digit fractions', () => {
    // 1210 hundredths = 12.10%: the fraction 10 has two digits and needs no padding.
    expect(formatPercent(1210)).toBe('12.10%');
    expect(formatPercent(1209)).toBe('12.09%');
    expect(formatPercent(0)).toBe('0.00%');
    expect(formatPercent(10000)).toBe('100.00%');
  });

  it('skips empty-valued changes like the text renderer does, so indexes line up', () => {
    const changes = [
      { value: 'a', added: false, removed: false, count: 1 },
      { value: '', added: true, removed: false, count: 1 },
      { value: 'b', added: true, removed: false, count: 1 },
    ];
    // Total new-side length 2; the added "b" covers offset 1..2 -> 50%..100%.
    expect(minimapMarksText(changes)).toStrictEqual([{ index: 0, kind: 'added', top: 5000, height: 5000 }]);
    expect(renderText('chars', changes)).toBe(
      '<div class="text-diff text-diff-chars"><span>a</span><span class="diff-added" data-change-index="0">b</span></div>',
    );
  });

  it('a run that mixes moved and plain changed rows is "modified"', () => {
    const hunks = [
      {
        type: 'hunk' as const,
        oldStart: 1,
        oldLines: 2,
        newStart: 1,
        newLines: 1,
        rows: [
          { type: 'removed' as const, oldNo: 1, text: 'x' },
          { type: 'moved-from' as const, oldNo: 2, text: 'm', move: 0, counterpart: 1 },
          { type: 'equal' as const, oldNo: 3, newNo: 1, text: 'k' },
          { type: 'moved-from' as const, oldNo: 4, text: 'n', move: 1, counterpart: 1 },
          { type: 'moved-to' as const, newNo: 2, text: 'z', move: 2, counterpart: 9 },
        ],
      },
    ];
    expect(minimapMarksLines(hunks).map((m) => m.kind)).toStrictEqual(['modified', 'moved']);
  });

  it('a collapsed block ends the current run even at context 0', () => {
    // Rows: X/x changed, then 2 hidden equal rows, then Y/y changed: two runs, two marks.
    const hunks = buildHunks('X\na\nb\nY\n', 'x\na\nb\ny\n', { contextLines: 0 });
    expect(hunks.map((h) => h.type)).toStrictEqual(['hunk', 'collapsed', 'hunk']);
    expect(minimapMarksLines(hunks).map((m) => [m.index, m.top, m.height])).toStrictEqual([
      [0, 0, 2500],
      [1, 7500, 2500],
    ]);
  });
});
