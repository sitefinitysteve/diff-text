import { describe, expect, it } from 'vitest';
import { diffArrays } from 'diff';
import fc from 'fast-check';
import { tokenize } from '../computeDiff';
import { buildHeatmap, changedPercent, heatLevel, renderHeatmap } from '../heatmap';
import type { Heatmap, HeatSentence } from '../heatmap';
import { computeSimilarity } from '../similarity';
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

/**
 * Independent reference: a literal transcription of SPEC 20.1 steps 1-6, without the
 * result-neutral shortcut and without any of buildHeatmap's bookkeeping.
 */
function referenceHeatmap(oldText: string, newText: string, ignoreCase: boolean): Heatmap {
  const isSentence = (t: string) => /\S/u.test(t);
  const newTokens = tokenize('sentences', newText);
  const O = tokenize('sentences', oldText).filter(isSentence);
  const N = newTokens.filter(isSentence);
  const key = (s: string) => (ignoreCase ? s.toLowerCase() : s);
  const sim = (i: number, j: number) => computeSimilarity(key(O[i]!), key(N[j]!), { html: false });
  const matches: Array<[number, number, number]> = [];
  let pre = 0;
  while (pre < O.length && pre < N.length && key(O[pre]!) === key(N[pre]!)) pre++;
  let suf = 0;
  while (suf < O.length - pre && suf < N.length - pre && key(O[O.length - 1 - suf]!) === key(N[N.length - 1 - suf]!)) suf++;
  for (let k = 0; k < pre; k++) matches.push([k, k, 1]);
  const n = O.length - pre - suf;
  const m = N.length - pre - suf;
  const exact = n > 500 || m > 500;
  if (exact) {
    let i = pre;
    let j = pre;
    for (const c of diffArrays(O.slice(pre, pre + n).map(key), N.slice(pre, pre + m).map(key))) {
      if (c.added) j += c.count!;
      else if (c.removed) i += c.count!;
      else for (let k = 0; k < c.count!; k++) matches.push([i++, j++, 1]);
    }
  } else if (n > 0 && m > 0) {
    const W = Array.from({ length: n }, (_, i) =>
      Array.from({ length: m }, (_, j) => {
        const s = sim(pre + i, pre + j);
        return s >= 0.5 ? s : null;
      }),
    );
    const D = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        let best = D[i - 1]![j]!;
        if (D[i]![j - 1]! > best) best = D[i]![j - 1]!;
        const w = W[i - 1]![j - 1]!;
        if (w !== null && D[i - 1]![j - 1]! + w > best) best = D[i - 1]![j - 1]! + w;
        D[i]![j] = best;
      }
    }
    const mid: Array<[number, number, number]> = [];
    for (let i = n, j = m; i > 0 && j > 0; ) {
      const w = W[i - 1]![j - 1]!;
      if (w !== null && D[i]![j] === D[i - 1]![j - 1]! + w) mid.unshift([pre + --i, pre + --j, w]);
      else if (D[i]![j] === D[i - 1]![j]) i--;
      else j--;
    }
    matches.push(...mid);
  }
  for (let k = suf; k > 0; k--) matches.push([O.length - k, N.length - k, 1]);
  // Step 3.
  const pair = new Map<number, [number, number]>(); // new index -> [old index, sim]
  let pi = -1;
  let pj = -1;
  for (const [mi, mj, ms] of [...matches, [O.length, N.length, 0] as [number, number, number]]) {
    for (let k = 0; k < Math.min(mi - pi - 1, mj - pj - 1); k++) pair.set(pj + 1 + k, [pi + 1 + k, sim(pi + 1 + k, pj + 1 + k)]);
    if (mi < O.length) pair.set(mj, [mi, ms]);
    pi = mi;
    pj = mj;
  }
  // Step 5.
  const usedOld = new Set([...pair.values()].map(([oi]) => oi));
  const before = new Map<number, string[]>();
  const atEnd: string[] = [];
  for (let oi = 0; oi < O.length; oi++) {
    if (usedOld.has(oi)) continue;
    const next = matches.find(([mi]) => mi > oi);
    if (next) before.set(next[1], [...(before.get(next[1]) ?? []), O[oi]!]);
    else atEnd.push(O[oi]!);
  }
  // Steps 4 and 6.
  const segments: Heatmap['segments'] = [];
  let j = 0;
  for (const token of newTokens) {
    if (!isSentence(token)) {
      segments.push({ type: 'gap', text: token });
      continue;
    }
    for (const r of before.get(j) ?? []) segments.push({ type: 'removed', text: r });
    const p = pair.get(j);
    if (!p) segments.push({ type: 'sentence', text: token, heat: 4, status: 'added', similarity: 0, changed: 100 });
    else {
      const [oi, s] = p;
      const heat = heatLevel(s);
      segments.push({
        type: 'sentence',
        text: token,
        heat,
        status: heat === 0 ? 'unchanged' : s >= 0.5 ? 'edited' : 'rewritten',
        similarity: s,
        changed: changedPercent(s),
        old: O[oi]!,
      });
    }
    j++;
  }
  for (const r of atEnd) segments.push({ type: 'removed', text: r });
  return { segments, exact };
}

describe('heatmap against the SPEC reference', () => {
  const words = ['the', 'cat', 'dog', 'sat', 'ran', 'on', 'a', 'mat', 'big', 'red', 'Cat', '<b>'];
  const sentence = fc
    .tuple(fc.array(fc.constantFrom(...words), { minLength: 1, maxLength: 5 }), fc.constantFrom('.', '!', '?'))
    .map(([ws, end]) => ws.join(' ') + end);
  const doc = fc.array(sentence, { maxLength: 8 }).chain((ss) => fc.constantFrom(' ', '  ', '\n').map((sep) => ss.join(sep)));

  it('buildHeatmap equals the literal SPEC transcription', () => {
    fc.assert(
      fc.property(doc, doc, fc.boolean(), (a, b, ignoreCase) => {
        expect(buildHeatmap(a, b, { ignoreCase })).toStrictEqual(referenceHeatmap(a, b, ignoreCase));
      }),
      { numRuns: 1500, seed: 20260929 },
    );
  });

  it('switches to exact matching when either middle exceeds 500 sentences', () => {
    // Distinct words per sentence keep the (non-exact) alignment cheap.
    const s = (tag: string, k: number) => `${tag}${k} w${k}x${tag}.`;
    const docOf = (tag: string, count: number) => Array.from({ length: count }, (_, k) => s(tag, k)).join(' ');
    // No common prefix or suffix, so n and m are the full sentence counts.
    expect(buildHeatmap(docOf('a', 501), docOf('b', 499)).exact).toBe(true);
    expect(buildHeatmap(docOf('a', 499), docOf('b', 501)).exact).toBe(true);
    expect(buildHeatmap(docOf('a', 500), docOf('b', 500)).exact).toBe(false);
  });
});
