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
});
