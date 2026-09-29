/**
 * Rewrite heatmap (SPEC section 20): how much each sentence of the new text changed.
 *
 * Both texts are split with the sentences tokenizer, old sentences are aligned to
 * new ones by word similarity, and every new sentence gets a heat bucket 0..4.
 */
import { diffArrays } from 'diff';
import { tokenize } from './computeDiff';
import { escapeHtml, idPrefixOf } from './render';
import { computeSimilarity, nonWhitespaceLength, prepareForSimilarity } from './similarity';
import type { RenderOptions } from './types';

/** Two sentences can be aligned when their similarity is at least this. */
export const HEAT_MATCH_THRESHOLD = 0.5;
/** Above this many sentences (either side, after trimming) alignment falls back to exact matches. */
export const HEAT_MAX_SENTENCES = 500;
/** Legend text per heat bucket. */
export const HEAT_LABELS = ['unchanged', 'lightly edited', 'edited', 'heavily edited', 'rewritten or new'] as const;

export interface HeatmapOptions {
  ignoreCase?: boolean;
}

export type HeatLevel = 0 | 1 | 2 | 3 | 4;
export type HeatStatus = 'unchanged' | 'edited' | 'rewritten' | 'added';

export interface HeatSentence {
  type: 'sentence';
  /** The new sentence, verbatim. */
  text: string;
  heat: HeatLevel;
  status: HeatStatus;
  /** Similarity to its old counterpart in [0, 1]; 0 when added. */
  similarity: number;
  /** Integer percent changed shown in labels (0 when unchanged, 100 when added). */
  changed: number;
  /** The old counterpart, when paired. */
  old?: string;
}

export interface HeatGap {
  type: 'gap';
  /** Whitespace between sentences of the new text. */
  text: string;
}

export interface HeatRemoved {
  type: 'removed';
  /** An old sentence with no counterpart in the new text. */
  text: string;
}

export type HeatSegment = HeatSentence | HeatGap | HeatRemoved;

export interface Heatmap {
  segments: HeatSegment[];
  /** True when the exact-match fallback was used (more than HEAT_MAX_SENTENCES sentences). */
  exact: boolean;
}

export interface HeatmapRenderOptions extends RenderOptions {
  /** Show removed old sentences inline. Default true. */
  showRemoved?: boolean;
  /** Append the legend. Default true. */
  legend?: boolean;
}

/** Heat bucket for a similarity: 1 → 0, ≥0.75 → 1, ≥0.5 → 2, ≥0.25 → 3, else 4. */
export function heatLevel(similarity: number): HeatLevel {
  if (similarity >= 1) return 0;
  if (similarity >= 0.75) return 1;
  if (similarity >= 0.5) return 2;
  if (similarity >= 0.25) return 3;
  return 4;
}

/** Percent changed for a paired sentence: 0 when unchanged, else max(1, 100 - floor(sim * 100 + 0.5)). */
export function changedPercent(similarity: number): number {
  if (similarity >= 1) return 0;
  return Math.max(1, 100 - Math.floor(similarity * 100 + 0.5));
}

const isSentence = (token: string): boolean => nonWhitespaceLength(token) > 0;

/** Sentences are plain text: `<` and `>` are ordinary characters (SPEC section 8). */
const TEXT = { html: false } as const;

interface WordBag {
  /** Non-whitespace code points of the prepared sentence. */
  size: number;
  /** Trimmed word token -> [count, non-whitespace length]. */
  words: Map<string, [number, number]>;
}

function wordBag(sentence: string): WordBag {
  const prepared = prepareForSimilarity(sentence, TEXT);
  const words = new Map<string, [number, number]>();
  for (const token of tokenize('words', prepared)) {
    const k = token.trim();
    const hit = words.get(k);
    if (hit) hit[0]++;
    else words.set(k, [1, nonWhitespaceLength(k)]);
  }
  return { size: nonWhitespaceLength(prepared), words };
}

/** Upper bound on unchanged non-whitespace code points of a word diff between two bags. */
function bagIntersection(a: WordBag, b: WordBag): number {
  let sum = 0;
  const [small, large] = a.words.size <= b.words.size ? [a.words, b.words] : [b.words, a.words];
  for (const [k, [count, len]] of small) {
    const other = large.get(k);
    if (other) sum += Math.min(count, other[0]) * len;
  }
  return sum;
}

/** Build the heatmap model for old → new. */
export function buildHeatmap(oldText: string, newText: string, options: HeatmapOptions = {}): Heatmap {
  const ignoreCase = options.ignoreCase === true;
  const key = (s: string): string => (ignoreCase ? s.toLowerCase() : s);
  const newTokens = tokenize('sentences', newText);
  const O = tokenize('sentences', oldText).filter(isSentence);
  const N = newTokens.filter(isSentence);
  const oKeys = O.map(key);
  const nKeys = N.map(key);

  // matches[k] = [oldIndex, newIndex, similarity], strictly increasing in both indexes.
  const matches: Array<[number, number, number]> = [];

  // 1. Common prefix and suffix of equal sentences.
  let pre = 0;
  while (pre < O.length && pre < N.length && oKeys[pre] === nKeys[pre]) pre++;
  let suf = 0;
  while (
    suf < O.length - pre &&
    suf < N.length - pre &&
    oKeys[O.length - 1 - suf] === nKeys[N.length - 1 - suf]
  ) {
    suf++;
  }
  for (let k = 0; k < pre; k++) matches.push([k, k, 1]);

  // 2. Align the middle.
  const n = O.length - pre - suf;
  const m = N.length - pre - suf;
  const exact = n > HEAT_MAX_SENTENCES || m > HEAT_MAX_SENTENCES;
  if (exact) {
    const changes = diffArrays(oKeys.slice(pre, pre + n), nKeys.slice(pre, pre + m));
    let i = pre;
    let j = pre;
    for (const c of changes) {
      if (c.added) j += c.count;
      else if (c.removed) i += c.count;
      else for (let k = 0; k < c.count; k++) matches.push([i++, j++, 1]);
    }
  } else if (n > 0 && m > 0) {
    // Two result-neutral shortcuts skip pairs that cannot reach the threshold, using
    // u <= min(a, b) and u <= the multiset intersection of their word tokens
    // (u = unchanged non-whitespace code points, a/b = non-whitespace lengths).
    const oBag = oKeys.slice(pre, pre + n).map(wordBag);
    const nBag = nKeys.slice(pre, pre + m).map(wordBag);
    const W: Array<Array<number | null>> = [];
    for (let i = 0; i < n; i++) {
      const row: Array<number | null> = [];
      for (let j = 0; j < m; j++) {
        const a = oBag[i]!.size;
        const b = nBag[j]!.size;
        if (4 * Math.min(a, b) < a + b || 4 * bagIntersection(oBag[i]!, nBag[j]!) < a + b) {
          row.push(null);
          continue;
        }
        const s = computeSimilarity(oKeys[pre + i]!, nKeys[pre + j]!, TEXT);
        row.push(s >= HEAT_MATCH_THRESHOLD ? s : null);
      }
      W.push(row);
    }
    const D: number[][] = [];
    for (let i = 0; i <= n; i++) D.push(new Array<number>(m + 1).fill(0));
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
    let i = n;
    let j = m;
    while (i > 0 && j > 0) {
      const w = W[i - 1]![j - 1]!;
      if (w !== null && D[i]![j] === D[i - 1]![j - 1]! + w) {
        mid.push([pre + i - 1, pre + j - 1, w]);
        i--;
        j--;
      } else if (D[i]![j] === D[i - 1]![j]) {
        i--;
      } else {
        j--;
      }
    }
    for (let k = mid.length - 1; k >= 0; k--) matches.push(mid[k]!);
  }
  for (let k = suf; k > 0; k--) matches.push([O.length - k, N.length - k, 1]);

  // 3. Pair leftovers positionally inside each run between matches.
  const pairOf: Array<{ old: number; sim: number } | null> = new Array(N.length).fill(null);
  const oldUsed = new Array<boolean>(O.length).fill(false);
  let prevI = -1;
  let prevJ = -1;
  for (const [mi, mj, ms] of [...matches, [O.length, N.length, 0] as [number, number, number]]) {
    const runO = mi - prevI - 1;
    const runN = mj - prevJ - 1;
    for (let k = 0; k < Math.min(runO, runN); k++) {
      const oi = prevI + 1 + k;
      const nj = prevJ + 1 + k;
      pairOf[nj] = { old: oi, sim: computeSimilarity(oKeys[oi]!, nKeys[nj]!, TEXT) };
      oldUsed[oi] = true;
    }
    if (mi < O.length) {
      pairOf[mj] = { old: mi, sim: ms };
      oldUsed[mi] = true;
    }
    prevI = mi;
    prevJ = mj;
  }

  // 4. Removed old sentences go before the first matched new sentence whose old index is larger.
  const removedBefore: string[][] = N.map(() => []);
  const removedAtEnd: string[] = [];
  let mk = 0;
  for (let oi = 0; oi < O.length; oi++) {
    if (oldUsed[oi]) continue;
    while (mk < matches.length && matches[mk]![0] < oi) mk++;
    if (mk < matches.length) removedBefore[matches[mk]![1]]!.push(O[oi]!);
    else removedAtEnd.push(O[oi]!);
  }

  // 5. Segments in new-text order.
  const segments: HeatSegment[] = [];
  let j = 0;
  for (const token of newTokens) {
    if (!isSentence(token)) {
      segments.push({ type: 'gap', text: token });
      continue;
    }
    for (const r of removedBefore[j]!) segments.push({ type: 'removed', text: r });
    const p = pairOf[j];
    if (p === null || p === undefined) {
      segments.push({ type: 'sentence', text: token, heat: 4, status: 'added', similarity: 0, changed: 100 });
    } else {
      const heat = heatLevel(p.sim);
      const status: HeatStatus = heat === 0 ? 'unchanged' : p.sim >= HEAT_MATCH_THRESHOLD ? 'edited' : 'rewritten';
      segments.push({
        type: 'sentence',
        text: token,
        heat,
        status,
        similarity: p.sim,
        changed: changedPercent(p.sim),
        old: O[p.old]!,
      });
    }
    j++;
  }
  for (const r of removedAtEnd) segments.push({ type: 'removed', text: r });
  return { segments, exact };
}

/** Title / screen-reader label of a changed sentence, e.g. "rewritten, 82% changed". */
export function heatLabel(s: HeatSentence): string {
  if (s.status === 'added') return 'new sentence';
  if (s.status === 'rewritten' && s.heat === 4) return `rewritten, ${s.changed}% changed`;
  return `${HEAT_LABELS[s.heat]}, ${s.changed}% changed`;
}

/** Render the heatmap: sentence spans with data-heat, optional removed markers, optional legend. */
export function renderHeatmap(heatmap: Heatmap, options: HeatmapRenderOptions = {}): string {
  const showRemoved = options.showRemoved !== false;
  const anchors = options.anchors === true;
  const prefix = escapeHtml(idPrefixOf(options));
  const counts = [0, 0, 0, 0, 0];
  let removed = 0;
  let index = 0;
  let body = '';
  const indexAttrs = (): string => {
    const id = anchors ? ` id="${prefix}-change-${index}"` : '';
    return `${id} data-change-index="${index++}"`;
  };
  for (const seg of heatmap.segments) {
    if (seg.type === 'gap') {
      body += `<span>${escapeHtml(seg.text)}</span>`;
    } else if (seg.type === 'removed') {
      if (!showRemoved) continue;
      removed++;
      body +=
        `<span class="diff-heat-removed"${indexAttrs()} title="removed sentence">` +
        `<span class="diff-sr">removed sentence: </span>${escapeHtml(seg.text)}</span>`;
    } else {
      counts[seg.heat]!++;
      if (seg.heat === 0) {
        body += `<span class="diff-heat" data-heat="0">${escapeHtml(seg.text)}</span>`;
      } else {
        const label = heatLabel(seg);
        body +=
          `<span class="diff-heat" data-heat="${seg.heat}"${indexAttrs()} title="${label}">` +
          `${escapeHtml(seg.text)}<span class="diff-sr"> (${label})</span></span>`;
      }
    }
  }
  let out = `<div class="text-diff text-diff-heatmap"><div class="diff-heat-text">${body}</div>`;
  if (options.legend !== false) {
    out += '<ul class="diff-heat-legend" aria-label="Heat legend">';
    for (let h = 0; h < 5; h++) {
      out +=
        `<li class="diff-heat-key" data-heat="${h}"><span class="diff-heat-swatch" aria-hidden="true"></span>` +
        `${HEAT_LABELS[h]} (${counts[h]})</li>`;
    }
    if (showRemoved) {
      out +=
        '<li class="diff-heat-key diff-heat-key-removed"><span class="diff-heat-swatch" aria-hidden="true"></span>' +
        `removed (${removed})</li>`;
    }
    out += '</ul>';
  }
  return out + '</div>';
}
