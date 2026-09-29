import { describe, expect, it } from 'vitest';
import { buildHunks, buildRows, buildSplitRows } from '../lines';
import { buildMoves, normalizeMoveLine } from '../moves';
import { renderSplit, renderUnified } from '../render';
import { lineStats } from '../stats';
import { prng, pick } from './prng';

describe('moved blocks', () => {
  it('normalizes whitespace and case', () => {
    expect(normalizeMoveLine('  a \t b  ')).toBe('a b');
    expect(normalizeMoveLine(' A  B ', true)).toBe('a b');
  });

  it('detects a moved block and numbers moves by new position', () => {
    const old = 'a\nb\nc\nk1\nk2\nk3\nk4\nx\n';
    const nw = 'x\nk1\nk2\nk3\nk4\na\nb\nc\n';
    const moves = buildMoves(buildRows(old, nw));
    expect(moves).toStrictEqual([
      { id: 0, oldStart: 8, newStart: 1, lines: 1 },
      { id: 1, oldStart: 1, newStart: 6, lines: 3 },
    ]);
  });

  it('is opt-in: without detectMoves the rows are plain removed/added', () => {
    const hunks = buildHunks('m\nk1\nk2\n', 'k1\nk2\nm\n');
    expect(hunks.flatMap((h) => h.rows).map((r) => r.type)).toStrictEqual(['removed', 'equal', 'equal', 'added']);
  });

  it('ignores same-region matches, blank-only blocks and short blocks', () => {
    expect(buildMoves(buildRows('k\n  x\nk2\n', 'k\nx\nk2\n'))).toStrictEqual([]);
    expect(buildMoves(buildRows('\n\nk1\nk2\n', 'k1\nk2\n\n\n'))).toStrictEqual([]);
    expect(buildMoves(buildRows('m\nk1\nk2\n', 'k1\nk2\nm\n'), { minMoveLines: 2 })).toStrictEqual([]);
  });

  it('near matches only with moveSimilarity < 1', () => {
    const old = 'alpha beta gamma delta\nk1\nk2\nk3\n';
    const nw = 'k1\nk2\nk3\nalpha beta gamma delta!\n';
    expect(buildMoves(buildRows(old, nw))).toStrictEqual([]);
    expect(buildMoves(buildRows(old, nw), { moveSimilarity: 0.8 })).toHaveLength(1);
  });

  it('renders moved rows with links, labels and color slots', () => {
    const hunks = buildHunks('m\nk1\nk2\n', 'k1\nk2\nm\n', { detectMoves: true });
    const html = renderUnified(hunks, { idPrefix: 'p' });
    expect(html).toContain('<div class="diff-row diff-row-moved-from diff-move-0" role="group" aria-label="line 1 moved to line 3" data-move="0" data-change-index="0">');
    expect(html).toContain('<a class="diff-move-link" id="p-move-0-from" href="#p-move-0-to">moved to line 3</a>');
    expect(html).toContain('<a class="diff-move-link" id="p-move-0-to" href="#p-move-0-from">moved from line 1</a>');
    expect(lineStats(hunks)).toStrictEqual({ added: 1, removed: 1, unchanged: 2, unit: 'lines' });
    const split = renderSplit(buildSplitRows('m\nk1\nk2\n', 'k1\nk2\nm\n', { detectMoves: true }), { idPrefix: 'p' });
    expect(split).toContain('<div class="diff-row diff-row-moved-to diff-move-0" data-move="0" data-change-index="1">');
  });

  it('property: moves never overlap, pair equal normalized lines, and are ordered by new position', () => {
    const rand = prng(42);
    const pool = ['alpha', 'beta', 'gamma', 'delta', '', '  alpha', 'BETA', 'x', 'y', 'z'];
    for (let k = 0; k < 300; k++) {
      const make = () => Array.from({ length: Math.floor(rand() * 14) }, () => pick(rand, pool)).join('\n') + '\n';
      const a = make();
      const b = make();
      const ignoreCase = rand() < 0.5;
      const rows = buildRows(a, b, { ignoreCase });
      const moves = buildMoves(rows, { ignoreCase });
      const usedOld = new Set<number>();
      const usedNew = new Set<number>();
      moves.forEach((m, i) => {
        expect(m.id).toBe(i);
        if (i > 0) expect(m.newStart).toBeGreaterThan(moves[i - 1]!.newStart);
        for (let j = 0; j < m.lines; j++) {
          expect(usedOld.has(m.oldStart + j)).toBe(false);
          expect(usedNew.has(m.newStart + j)).toBe(false);
          usedOld.add(m.oldStart + j);
          usedNew.add(m.newStart + j);
          const from = rows.find((r) => r.type === 'removed' && r.oldNo === m.oldStart + j)!;
          const to = rows.find((r) => r.type === 'added' && r.newNo === m.newStart + j)!;
          expect(normalizeMoveLine(from.text, ignoreCase)).toBe(normalizeMoveLine(to.text, ignoreCase));
        }
        const first = rows.find((r) => r.type === 'added' && r.newNo === m.newStart)!;
        const last = rows.find((r) => r.type === 'added' && r.newNo === m.newStart + m.lines - 1)!;
        expect(first.text.trim()).not.toBe('');
        expect(last.text.trim()).not.toBe('');
      });
      // Split pairing never pairs a moved row with anything.
      for (const h of buildSplitRows(a, b, { ignoreCase, detectMoves: true })) {
        if (h.type === 'collapsed') continue;
        for (const r of h.rows) {
          if (r.type === 'moved-from') expect(r.right).toBeUndefined();
          if (r.type === 'moved-to') expect(r.left).toBeUndefined();
        }
      }
    }
  });
});
