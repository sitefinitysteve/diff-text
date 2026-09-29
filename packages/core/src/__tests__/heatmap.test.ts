import { describe, expect, it } from 'vitest';
import { buildHeatmap, changedPercent, heatLevel, renderHeatmap } from '../heatmap';
import type { HeatSentence } from '../heatmap';
import { prng, pick } from './prng';

const sentences = (h: ReturnType<typeof buildHeatmap>) =>
  h.segments.filter((s): s is HeatSentence => s.type === 'sentence');

describe('heatmap', () => {
  it('buckets similarity with explicit thresholds', () => {
    expect([1, 0.99, 0.75, 0.7499, 0.5, 0.4999, 0.25, 0.2499, 0].map(heatLevel)).toStrictEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it('heat is monotonic (non-increasing) in similarity', () => {
    const rand = prng(7);
    for (let k = 0; k < 2000; k++) {
      const a = rand();
      const b = rand();
      const [lo, hi] = a < b ? [a, b] : [b, a];
      expect(heatLevel(hi)).toBeLessThanOrEqual(heatLevel(lo));
    }
  });

  it('percent changed: 0 when unchanged, at least 1 otherwise', () => {
    expect(changedPercent(1)).toBe(0);
    expect(changedPercent(0.999)).toBe(1);
    expect(changedPercent(0.72)).toBe(28);
    expect(changedPercent(0)).toBe(100);
  });

  it('marks unchanged, edited, rewritten, added and removed sentences', () => {
    const h = buildHeatmap(
      'Keep this one. The quick brown fox jumps over the lazy dog. Delete me please. Totally old words.',
      'Keep this one. The quick brown fox leaps over the lazy dog. Brand new stuff here!',
    );
    const s = sentences(h);
    expect(s.map((x) => [x.status, x.heat])).toStrictEqual([
      ['unchanged', 0],
      ['edited', 1],
      ['rewritten', 4],
    ]);
    expect(s[2]!.old).toBe('Delete me please.');
    expect(h.segments.filter((x) => x.type === 'removed').map((x) => x.text)).toStrictEqual(['Totally old words.']);
  });

  it('keeps the new text byte-for-byte (sentences + gaps)', () => {
    const rand = prng(11);
    const pool = ['Alpha one.', 'Beta two!', 'Gamma three?', 'Delta four.', 'Epsilon five six.', 'Zeta.'];
    for (let k = 0; k < 200; k++) {
      const make = () =>
        Array.from({ length: Math.floor(rand() * 6) }, () => pick(rand, pool)).join(pick(rand, [' ', '  ', '\n', '\r\n']));
      const a = make();
      const b = make();
      const h = buildHeatmap(a, b);
      expect(h.segments.filter((s) => s.type !== 'removed').map((s) => s.text).join('')).toBe(b);
      // Every old sentence is either paired with a new one or listed as removed.
      const oldCount = a.split(/(?<=[.!?])\s+/).filter((x) => x.trim() !== '').length;
      const paired = sentences(h).filter((x) => x.old !== undefined).length;
      const removed = h.segments.filter((s) => s.type === 'removed').length;
      expect(paired + removed).toBe(oldCount);
    }
  });

  it('property: without the fallback, edited <=> heat 1-2 and rewritten <=> heat 3-4', () => {
    const rand = prng(19);
    const words = ['the', 'cat', 'sat', 'on', 'a', 'mat', 'dog', 'ran', 'far', 'away', 'today'];
    const sentence = () =>
      Array.from({ length: 2 + Math.floor(rand() * 6) }, () => pick(rand, words)).join(' ') + pick(rand, ['.', '!', '?']);
    for (let k = 0; k < 150; k++) {
      const make = () => Array.from({ length: Math.floor(rand() * 7) }, sentence).join(' ');
      const h = buildHeatmap(make(), make());
      expect(h.exact).toBe(false);
      for (const s of sentences(h)) {
        if (s.status === 'unchanged') expect(s.heat).toBe(0);
        if (s.status === 'edited') expect([1, 2]).toContain(s.heat);
        if (s.status === 'rewritten') expect([3, 4]).toContain(s.heat);
        if (s.status === 'added') expect([s.heat, s.changed, s.old]).toStrictEqual([4, 100, undefined]);
      }
    }
  });

  it('matches only pairs with similarity >= 0.5 in the alignment', () => {
    const h = buildHeatmap('One two three four.', 'One two five six seven eight.');
    const [s] = sentences(h);
    expect(s!.similarity).toBeLessThan(0.5);
    expect(s!.status).toBe('rewritten');
  });

  it('falls back to exact matching above 500 sentences', () => {
    const many = (edit: boolean) =>
      Array.from({ length: 502 }, (_, i) => (edit && (i === 0 || i === 501) ? `Changed ${i}.` : `S ${i}.`)).join(' ');
    expect(buildHeatmap(many(false), many(true)).exact).toBe(true);
    expect(buildHeatmap('A. B.', 'A. C.').exact).toBe(false);
  });

  it('renders titles, screen-reader labels, removed markers and a legend', () => {
    const html = renderHeatmap(buildHeatmap('Old sentence here. Gone.', 'Old sentence here!'));
    expect(html).toContain('title="lightly edited, 6% changed"');
    expect(html).toContain('<span class="diff-sr"> (lightly edited, 6% changed)</span>');
    expect(html).toContain('<span class="diff-heat-removed" data-change-index="1" title="removed sentence">');
    expect(html).toContain('<ul class="diff-heat-legend" aria-label="Heat legend">');
    const bare = renderHeatmap(buildHeatmap('A. Gone.', 'A.'), { legend: false, showRemoved: false });
    expect(bare).toBe(
      '<div class="text-diff text-diff-heatmap"><div class="diff-heat-text"><span class="diff-heat" data-heat="0">A.</span></div></div>',
    );
  });
});
