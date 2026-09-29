import { diffArrays } from 'diff';
import type { HtmlDiffOptions, HtmlDiffResult } from './types';
import { computeSimilarity } from './similarity';
import { scrubUnicode, tokenizeHtml } from './htmlTokens';
import type { HtmlToken } from './htmlTokens';
import { renderHtmlItems } from './htmlRender';
import type { HtmlItem } from './htmlRender';

export const DEFAULT_ORPHAN_MATCH_THRESHOLD = 0.3;

type Op = [type: -1 | 0 | 1, count: number];

/** Token-level Myers diff (jsdiff v8, the same search as every text mode) over interned keys. */
function diffKeys(a: HtmlToken[], b: HtmlToken[], maxEditLength: number | undefined): Op[] {
  const ids = new Map<string, number>();
  const intern = (t: HtmlToken): number => {
    let id = ids.get(t.key);
    if (id === undefined) ids.set(t.key, (id = ids.size));
    return id;
  };
  const x = a.map(intern);
  const y = b.map(intern);
  const opts = maxEditLength === undefined ? {} : { maxEditLength };
  const result = diffArrays(x, y, opts as never) as Array<{ added: boolean; removed: boolean; count: number }> | undefined;
  if (result === undefined) {
    const ops: Op[] = [];
    if (x.length) ops.push([-1, x.length]);
    if (y.length) ops.push([1, y.length]);
    return ops;
  }
  return result.filter((c) => c.count > 0).map((c): Op => [c.removed ? -1 : c.added ? 1 : 0, c.count]);
}

/** Alternating unchanged runs and changes (every removed/added token between two unchanged runs). */
function buildItems(a: HtmlToken[], b: HtmlToken[], ops: Op[]): HtmlItem[] {
  const items: HtmlItem[] = [];
  let i = 0;
  let j = 0;
  for (const [type, count] of ops) {
    if (type === 0) {
      items.push({ eq: true, old: a.slice(i, i + count), new: b.slice(j, j + count) });
      i += count;
      j += count;
      continue;
    }
    let last = items[items.length - 1];
    if (!last || last.eq) items.push((last = { eq: false, removed: [], added: [] }));
    if (type === -1) {
      last.removed.push(...a.slice(i, i + count));
      i += count;
    } else {
      last.added.push(...b.slice(j, j + count));
      j += count;
    }
  }
  return items;
}

type EqItem = Extract<HtmlItem, { eq: true }>;
type ChangeItem = Extract<HtmlItem, { eq: false }>;

/** Tags of a run left unpaired by stack pairing (a close pairs only with the innermost open). */
function unpairedTags(tokens: HtmlToken[], start: number, end: number): number {
  const open: string[] = [];
  let unpaired = 0;
  for (let i = start; i < end; i++) {
    const t = tokens[i]!;
    if (t.kind === 'open') open.push(t.name);
    else if (t.kind === 'close') {
      if (open.length && open[open.length - 1] === t.name) open.pop();
      else unpaired++;
    }
  }
  return unpaired + open.length;
}

/**
 * Slide pure insertions/deletions along equal neighbours (SPEC 12.2 "Sliding"): a change that
 * only removes (or only adds) may move left or right while the token leaving one end equals the
 * token entering the other. It moves only when that strictly reduces its unpaired tags; among
 * the best positions the one closest to the original wins, the left one on a tie.
 */
function slideChanges(input: HtmlItem[]): HtmlItem[] {
  const items = input.slice();
  for (let k = 0; k < items.length; k++) {
    const item = items[k]!;
    if (item.eq || (item.removed.length > 0) === (item.added.length > 0)) continue;
    const side = item.removed.length > 0 ? 'removed' : 'added';
    const eqSide = side === 'removed' ? 'old' : 'new';
    const otherSide = side === 'removed' ? 'new' : 'old';
    const prev = items[k - 1] as EqItem | undefined;
    const next = items[k + 1] as EqItem | undefined;
    const before = prev ? prev[eqSide] : [];
    const after = next ? next[eqSide] : [];
    const run = item[side];
    const seq = [...before, ...run, ...after];
    const start0 = before.length;
    const len = run.length;
    const leftRun = prev && items[k - 2] ? (items[k - 2] as ChangeItem)[side] : null;
    const rightRun = next && items[k + 2] ? (items[k + 2] as ChangeItem)[side] : null;
    // Unpaired tags of this run and of the neighbouring changes it would merge with.
    const score = (start: number): number => {
      const mergeLeft = leftRun !== null && start === 0;
      const mergeRight = rightRun !== null && start + len === seq.length;
      const merged = [...(mergeLeft ? leftRun : []), ...seq.slice(start, start + len), ...(mergeRight ? rightRun : [])];
      return (
        unpairedTags(merged, 0, merged.length) +
        (leftRun && !mergeLeft ? unpairedTags(leftRun, 0, leftRun.length) : 0) +
        (rightRun && !mergeRight ? unpairedTags(rightRun, 0, rightRun.length) : 0)
      );
    };
    let best = start0;
    let bestScore = score(start0);
    let bestDist = 0;
    const consider = (start: number) => {
      const sc = score(start);
      const dist = Math.abs(start - start0);
      if (sc < bestScore || (sc === bestScore && best !== start0 && (dist < bestDist || (dist === bestDist && start < best)))) {
        best = start;
        bestScore = sc;
        bestDist = dist;
      }
    };
    for (let s = start0; s > 0 && seq[s - 1]!.key === seq[s + len - 1]!.key; s--) consider(s - 1);
    for (let s = start0; s + len < seq.length && seq[s]!.key === seq[s + len]!.key; s++) consider(s + 1);
    if (best === start0) continue;

    const other = [...(prev ? prev[otherSide] : []), ...(next ? next[otherSide] : [])];
    const moved: ChangeItem = { eq: false, removed: [], added: [] };
    moved[side] = seq.slice(best, best + len);
    const newPrev = { eq: true, [eqSide]: seq.slice(0, best), [otherSide]: other.slice(0, best) } as EqItem;
    const newNext = { eq: true, [eqSide]: seq.slice(best + len), [otherSide]: other.slice(best) } as EqItem;
    const replacement: HtmlItem[] = [];
    if (newPrev.old.length) replacement.push(newPrev);
    replacement.push(moved);
    if (newNext.old.length) replacement.push(newNext);
    const from = prev ? k - 1 : k;
    items.splice(from, (prev ? 1 : 0) + 1 + (next ? 1 : 0), ...replacement);
    // Merge with a neighbouring change when an equal run vanished.
    let at = from + (newPrev.old.length ? 1 : 0);
    const left = items[at - 1];
    if (left && !left.eq) {
      items.splice(at - 1, 2, { eq: false, removed: [...left.removed, ...moved.removed], added: [...left.added, ...moved.added] });
      at--;
    }
    const cur = items[at] as ChangeItem;
    const right = items[at + 1];
    if (right && !right.eq) {
      items.splice(at, 2, { eq: false, removed: [...cur.removed, ...right.removed], added: [...cur.added, ...right.added] });
    }
    k = at;
  }
  return items;
}

const textLength = (tokens: HtmlToken[]): number => tokens.reduce((n, t) => n + t.len, 0);

/**
 * Orphan grouping (SPEC 12.2): an unchanged run between two changes that contains only text and
 * whitespace is absorbed into one change when
 *   textLen(run) / (textLen(previous change) + textLen(next change)) < threshold
 * (text length = decoded code points of text tokens; whitespace does not count). Orphan status is
 * decided on the ungrouped items; absorbing then proceeds left to right, so chains merge.
 */
function groupOrphans(items: HtmlItem[], threshold: number): HtmlItem[] {
  const n = items.length;
  const orphan: boolean[] = [];
  for (let k = 1; k < n - 1; k++) {
    const item = items[k]!;
    const prev = items[k - 1]!;
    const next = items[k + 1]!;
    if (!item.eq || prev.eq || next.eq) continue;
    if (item.new.some((t) => t.kind !== 'text' && t.kind !== 'space')) continue;
    const surrounding = textLength(prev.removed) + textLength(prev.added) + textLength(next.removed) + textLength(next.added);
    orphan[k] = surrounding > 0 && textLength(item.new) / surrounding < threshold;
  }
  const out: HtmlItem[] = [];
  for (let k = 0; k < n; k++) {
    const item = items[k]!;
    const last = out[out.length - 1];
    if (orphan[k] && item.eq && last && !last.eq) {
      const next = items[k + 1]! as Extract<HtmlItem, { eq: false }>;
      out[out.length - 1] = {
        eq: false,
        removed: [...last.removed, ...item.old, ...next.removed],
        added: [...last.added, ...item.new, ...next.added],
      };
      k++;
    } else {
      out.push(item);
    }
  }
  return out;
}

/**
 * Tag-aware HTML diff (SPEC section 12). Inputs are trusted HTML; callers must sanitize untrusted input.
 *
 * - With a similarityThreshold, when both inputs are non-empty and
 *   computeSimilarity(old, new) < threshold, the result is a full replacement:
 *   `<div class="diff-removed" data-change-index="0">OLD</div><div class="diff-added" data-change-index="1">NEW</div>`.
 * - Otherwise both documents are tokenized (tags are atomic; text is split into words, whitespace
 *   runs and single characters, compared by decoded value with quotes normalized), diffed with
 *   Myers, small unchanged runs between changes are grouped, and the result is rendered along
 *   the new document's structure with `diff-added` / `diff-removed` spans that only wrap text.
 * - Every marker carries data-change-index (0-based, document order).
 */
export function diffHtml(oldHtml: string, newHtml: string, options: HtmlDiffOptions = {}): HtmlDiffResult {
  const { similarityThreshold = null, ignoreFormattingTags = true, orphanMatchThreshold, ignoreCase, maxEditLength } = options;
  const oldText = scrubUnicode(oldHtml);
  const newText = scrubUnicode(newHtml);

  let similarity: number | undefined;
  if (typeof similarityThreshold === 'number' && oldText !== '' && newText !== '') {
    similarity = computeSimilarity(oldText, newText);
    if (similarity < similarityThreshold) {
      return {
        html:
          `<div class="diff-removed" data-change-index="0">${oldText}</div>` +
          `<div class="diff-added" data-change-index="1">${newText}</div>`,
        fullReplacement: true,
        similarity,
      };
    }
  }

  const tokenOptions = { ignoreCase: !!ignoreCase, ignoreFormattingTags: ignoreFormattingTags !== false };
  const a = tokenizeHtml(oldText, tokenOptions);
  const b = tokenizeHtml(newText, tokenOptions);
  const maxEdit = typeof maxEditLength === 'number' && maxEditLength >= 0 ? Math.floor(maxEditLength) : undefined;
  const threshold =
    typeof orphanMatchThreshold === 'number' && Number.isFinite(orphanMatchThreshold) ? orphanMatchThreshold : DEFAULT_ORPHAN_MATCH_THRESHOLD;

  const items = groupOrphans(slideChanges(buildItems(a, b, diffKeys(a, b, maxEdit))), threshold);
  const result: HtmlDiffResult = { html: renderHtmlItems(items), fullReplacement: false };
  if (similarity !== undefined) result.similarity = similarity;
  return result;
}
