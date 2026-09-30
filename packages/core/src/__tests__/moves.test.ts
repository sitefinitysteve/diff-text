import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildHunks, buildRows, buildSplitRows } from '../lines';
import { buildMoves, minMoveLinesOf, moveThresholdOf, normalizeMoveLine } from '../moves';
import { renderSplit, renderUnified } from '../render';
import { computeSimilarity } from '../similarity';
import { lineStats } from '../stats';
import type { LineRow, MoveBlock } from '../types';
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

  it('reads minMoveLines and moveSimilarity strictly', () => {
    // Only numbers count; strings, 0 and out-of-range values fall back to the defaults.
    expect([2.7, 1, 0.5, 0, -3, '3', null].map((n) => minMoveLinesOf({ minMoveLines: n as number }))).toStrictEqual([2, 1, 1, 1, 1, 1, 1]);
    expect([0.6, 0, 1, 1.5, -0.2, '0.5', null].map((t) => moveThresholdOf({ moveSimilarity: t as number }))).toStrictEqual([0.6, 1, 1, 1, 1, 1, 1]);
  });

  it('skips detection above 1,000,000 removed x added pairs', () => {
    // Removed: "moved" + 999 others (1000); added: 999 others + "moved" (+ extra): the block is
    // a valid move in a different region.
    const olds = Array.from({ length: 999 }, (_, i) => `old ${i}`);
    const news = Array.from({ length: 999 }, (_, i) => `new ${i}`);
    const a = ['moved', ...olds, 'keep'].join('\n') + '\n';
    const at = (extra: string[]) => ['keep', ...news, ...extra, 'moved'].join('\n') + '\n';
    // 1000 x 1000 = 1,000,000 pairs: still detected.
    expect(buildMoves(buildRows(a, at([])), {})).toStrictEqual([{ id: 0, oldStart: 1, newStart: 1001, lines: 1 }]);
    // 1000 x 1001: skipped.
    expect(buildMoves(buildRows(a, at(['one more'])), {})).toStrictEqual([]);
  });
});

/** Independent reference: a literal transcription of SPEC 19.1 (no index, no cache). */
function referenceMoves(rows: LineRow[], minMoveLines: number, threshold: number, ignoreCase: boolean): MoveBlock[] {
  const n = rows.length;
  const region: number[] = [];
  let r = -1;
  rows.forEach((row, i) => {
    if (row.type !== 'equal' && (i === 0 || rows[i - 1]!.type === 'equal')) r++;
    region.push(row.type === 'equal' ? -1 : r);
  });
  const R = rows.filter((x) => x.type === 'removed').length;
  const A = rows.filter((x) => x.type === 'added').length;
  if (R * A === 0 || R * A > 1_000_000) return [];
  const near = threshold < 1 && R * A <= 250_000;
  const norm = (i: number) => {
    const s = rows[i]!.text.replace(/\s+/gu, ' ').trim();
    return ignoreCase ? s.toLowerCase() : s;
  };
  const blank = (i: number) => norm(i) === '';
  const eq = (i: number, j: number) =>
    norm(i) === norm(j) || (near && !blank(i) && !blank(j) && computeSimilarity(norm(i), norm(j), { html: false }) >= threshold);
  const assigned = new Array<boolean>(n).fill(false);
  const found: Array<[number, number, number]> = [];
  for (;;) {
    let best: [number, number] | null = null;
    let bestLen = 0;
    for (let aj = 0; aj < n; aj++) {
      if (rows[aj]!.type !== 'added' || assigned[aj] || blank(aj)) continue;
      for (let ri = 0; ri < n; ri++) {
        if (rows[ri]!.type !== 'removed' || assigned[ri] || region[ri] === region[aj] || !eq(ri, aj)) continue;
        let len = 1;
        while (
          rows[ri + len]?.type === 'removed' &&
          rows[aj + len]?.type === 'added' &&
          !assigned[ri + len] &&
          !assigned[aj + len] &&
          eq(ri + len, aj + len)
        ) {
          len++;
        }
        while (blank(aj + len - 1)) len--;
        if (len > bestLen) {
          best = [ri, aj];
          bestLen = len;
        }
      }
    }
    if (best === null || bestLen === 0 || bestLen < minMoveLines) break;
    for (let k = 0; k < bestLen; k++) assigned[best[0] + k] = assigned[best[1] + k] = true;
    found.push([best[0], best[1], bestLen]);
  }
  found.sort((x, y) => x[1] - y[1]);
  return found.map(([ri, aj, len], id) => ({ id, oldStart: rows[ri]!.oldNo!, newStart: rows[aj]!.newNo!, lines: len }));
}

describe('moves against the SPEC reference', () => {
  const line = fc.constantFrom('alpha beta', 'alpha  beta', 'Alpha beta', 'alpha gamma', 'gamma delta', 'x', 'y', '', ' ', 'k');
  const doc = fc.array(line, { maxLength: 12 }).map((ls) => ls.join('\n') + '\n');

  it('buildMoves equals the literal SPEC transcription (exact and near modes)', () => {
    fc.assert(
      fc.property(doc, doc, fc.boolean(), fc.constantFrom(1, 2, 3), fc.constantFrom(1, 0.5, 0.6, 0.75), (a, b, ignoreCase, minMoveLines, moveSimilarity) => {
        const opts = { ignoreCase, minMoveLines, moveSimilarity };
        const rows = buildRows(a, b, opts);
        expect(buildMoves(rows, opts)).toStrictEqual(referenceMoves(rows, minMoveLines, moveSimilarity, ignoreCase));
      }),
      { numRuns: 1500, seed: 20260929 },
    );
  });
});
