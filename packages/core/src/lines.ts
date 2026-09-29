import { computeDiff, tokenize } from './computeDiff';
import { applyMoves, buildMoves } from './moves';
import { codePointLength } from './normalize';
import { similarityFromChanges } from './similarity';
import type {
  Change,
  CollapsedHunk,
  Hunk,
  LineOptions,
  LineRow,
  SplitCell,
  SplitHunk,
  SplitRow,
  VisibleHunk,
} from './types';

export const DEFAULT_CONTEXT_LINES = 3;
/** Intra-line diffs are skipped when either line is longer than this (code points). */
export const INTRALINE_MAX_LENGTH = 1000;
/** Intra-line diffs are dropped when the pair's word similarity is below this. */
export const INTRALINE_MIN_SIMILARITY = 0.3;

/**
 * Split a change value into lines. Each line keeps everything up to and including
 * its "\n"; a final piece without "\n" is also a line. Then the terminator
 * ("\n" or "\r\n") is removed from each line.
 */
export function splitLines(value: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '\n') {
      out.push(value.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (start < value.length) out.push(value.slice(start));
  return out.map((l) => l.replace(/\r?\n$/, ''));
}

/** Full list of line rows (no collapsing), numbered from 1. */
export function buildRows(oldText: string, newText: string, options: LineOptions = {}): LineRow[] {
  const changes = computeDiff('lines', oldText, newText, {
    ignoreCase: options.ignoreCase,
    ignoreWhitespace: options.ignoreWhitespace,
    stripTrailingCr: options.stripTrailingCr,
  });
  const rows: LineRow[] = [];
  let oldNo = 1;
  let newNo = 1;
  for (const c of changes) {
    for (const text of splitLines(c.value)) {
      if (c.added) rows.push({ type: 'added', newNo: newNo++, text });
      else if (c.removed) rows.push({ type: 'removed', oldNo: oldNo++, text });
      else rows.push({ type: 'equal', oldNo: oldNo++, newNo: newNo++, text });
    }
  }
  return rows;
}

/** buildRows, then (when options.detectMoves) moved-block detection (SPEC section 19). */
export function buildLineRows(oldText: string, newText: string, options: LineOptions = {}): LineRow[] {
  const rows = buildRows(oldText, newText, options);
  if (options.detectMoves !== true) return rows;
  return applyMoves(rows, buildMoves(rows, options));
}

function contextOf(options: LineOptions): number {
  const n = options.contextLines;
  return typeof n === 'number' && n >= 0 ? Math.floor(n) : DEFAULT_CONTEXT_LINES;
}

interface Range {
  start: number; // inclusive row index
  end: number; // exclusive row index
  visible: boolean;
}

/**
 * Partition row indices into visible and collapsed ranges.
 * A row is visible if it is changed or within `context` rows of a changed row.
 * If there are no changed rows, everything is one collapsed range.
 * A hidden run of a single row stays visible: folding it would save no space.
 */
function partition(types: string[], context: number): Range[] {
  const n = types.length;
  const visible = new Array<boolean>(n).fill(false);
  for (let i = 0; i < n; i++) {
    if (types[i] === 'equal') continue;
    const lo = Math.max(0, i - context);
    const hi = Math.min(n - 1, i + context);
    for (let j = lo; j <= hi; j++) visible[j] = true;
  }
  if (visible.includes(true)) {
    for (let i = 0; i < n; i++) {
      if (!visible[i] && visible[i - 1] !== false && visible[i + 1] !== false) visible[i] = true;
    }
  }
  const ranges: Range[] = [];
  for (let i = 0; i < n; i++) {
    const last = ranges[ranges.length - 1];
    if (last && last.visible === visible[i]) last.end = i + 1;
    else ranges.push({ start: i, end: i + 1, visible: visible[i] === true });
  }
  return ranges;
}

function countBefore(rows: LineRow[], end: number): { oldBefore: number; newBefore: number } {
  let oldBefore = 0;
  let newBefore = 0;
  for (let i = 0; i < end; i++) {
    const r = rows[i]!;
    if (r.oldNo !== undefined) oldBefore++;
    if (r.newNo !== undefined) newBefore++;
  }
  return { oldBefore, newBefore };
}

/**
 * Unified hunks: visible hunks (changes plus `contextLines` of context) interleaved,
 * in document order, with collapsed ranges of unchanged lines.
 */
export function buildHunks(oldText: string, newText: string, options: LineOptions = {}): Hunk[] {
  const rows = buildLineRows(oldText, newText, options);
  const ranges = partition(
    rows.map((r) => r.type),
    contextOf(options),
  );
  const out: Hunk[] = [];
  let oldBefore = 0;
  let newBefore = 0;
  for (const range of ranges) {
    const slice = rows.slice(range.start, range.end);
    const oldLines = slice.filter((r) => r.oldNo !== undefined).length;
    const newLines = slice.filter((r) => r.newNo !== undefined).length;
    if (range.visible) {
      const hunk: VisibleHunk = {
        type: 'hunk',
        oldStart: oldBefore + 1,
        oldLines,
        newStart: newBefore + 1,
        newLines,
        rows: slice,
      };
      out.push(hunk);
    } else {
      const collapsed: CollapsedHunk = {
        type: 'collapsed',
        count: slice.length,
        oldStart: oldBefore + 1,
        newStart: newBefore + 1,
        rows: slice,
      };
      out.push(collapsed);
    }
    oldBefore += oldLines;
    newBefore += newLines;
  }
  return out;
}

/**
 * Intra-line diff (wordsWithSpace, so whitespace changes are kept) for a removed/added
 * pair, or undefined when skipped: either line longer than INTRALINE_MAX_LENGTH code
 * points, or similarity below INTRALINE_MIN_SIMILARITY. Unchanged values carry the new
 * text; use splitParts for the per-side parts.
 */
export function intraLineDiff(oldLine: string, newLine: string, options: LineOptions = {}): Change[] | undefined {
  if (codePointLength(oldLine) > INTRALINE_MAX_LENGTH || codePointLength(newLine) > INTRALINE_MAX_LENGTH) {
    return undefined;
  }
  const changes = computeDiff('wordsWithSpace', oldLine, newLine, { ignoreCase: options.ignoreCase });
  if (similarityFromChanges(changes, oldLine, newLine) < INTRALINE_MIN_SIMILARITY) return undefined;
  return changes;
}

/**
 * Per-side parts of an intra-line diff. `left` is the removed and unchanged changes with
 * every value taken from the old line's tokens, `right` is the added and unchanged changes
 * (values from the new line), so each side joins back to its own line exactly, even when
 * ignoreCase makes differently-spelled tokens equal.
 */
export function splitParts(changes: Change[], oldLine: string): { left: Change[]; right: Change[] } {
  const oldTokens = tokenize('wordsWithSpace', oldLine);
  const left: Change[] = [];
  let pos = 0;
  for (const c of changes) {
    if (c.added) continue;
    left.push({ ...c, value: oldTokens.slice(pos, pos + c.count).join('') });
    pos += c.count;
  }
  return { left, right: changes.filter((c) => !c.removed) };
}

function cell(row: LineRow): SplitCell {
  if (row.type === 'added') return { type: 'added', lineNo: row.newNo!, text: row.text };
  if (row.type === 'moved-to') {
    return { type: 'moved-to', lineNo: row.newNo!, text: row.text, move: row.move!, counterpart: row.counterpart! };
  }
  if (row.type === 'moved-from') {
    return { type: 'moved-from', lineNo: row.oldNo!, text: row.text, move: row.move!, counterpart: row.counterpart! };
  }
  return { type: row.type, lineNo: row.oldNo!, text: row.text };
}

/** Pair buffered removed/added rows positionally (i-th with i-th), leftovers one-sided. */
function flushPairs(removed: LineRow[], added: LineRow[], out: SplitRow[], options: LineOptions): void {
  const n = Math.max(removed.length, added.length);
  for (let k = 0; k < n; k++) {
    const l = removed[k];
    const r = added[k];
    if (l && r) {
      const left = cell(l);
      const right = cell(r);
      const changes = intraLineDiff(l.text, r.text, options);
      if (changes) {
        const parts = splitParts(changes, l.text);
        left.parts = parts.left;
        right.parts = parts.right;
      }
      out.push({ type: 'modified', left, right });
    } else if (l) {
      out.push({ type: 'removed', left: cell(l) });
    } else if (r) {
      out.push({ type: 'added', right: cell(r) });
    }
  }
  removed.length = 0;
  added.length = 0;
}

/**
 * Pair rows side by side. Equal rows map to themselves. Within each maximal run of
 * changed rows, the i-th removed line is paired with the i-th added line; leftovers
 * get a row with only one side. Paired rows get an intra-line diff when bounded.
 * Moved rows (SPEC section 19) are never paired: each one flushes the pending
 * removed/added rows and then becomes its own one-sided row.
 */
export function pairRows(rows: LineRow[], options: LineOptions = {}): SplitRow[] {
  const out: SplitRow[] = [];
  const removed: LineRow[] = [];
  const added: LineRow[] = [];
  for (const row of rows) {
    if (row.type === 'equal') {
      flushPairs(removed, added, out, options);
      out.push({
        type: 'equal',
        left: { type: 'equal', lineNo: row.oldNo!, text: row.text },
        right: { type: 'equal', lineNo: row.newNo!, text: row.text },
      });
    } else if (row.type === 'removed') {
      removed.push(row);
    } else if (row.type === 'added') {
      added.push(row);
    } else {
      flushPairs(removed, added, out, options);
      if (row.type === 'moved-from') out.push({ type: 'moved-from', left: cell(row) });
      else out.push({ type: 'moved-to', right: cell(row) });
    }
  }
  flushPairs(removed, added, out, options);
  return out;
}

/**
 * Side-by-side hunks: the same visible/collapsed partition as buildHunks, with each
 * visible hunk's rows paired by pairRows.
 */
export function buildSplitRows(oldText: string, newText: string, options: LineOptions = {}): SplitHunk[] {
  return buildHunks(oldText, newText, options).map((h): SplitHunk => {
    if (h.type === 'collapsed') return h;
    return { ...h, rows: pairRows(h.rows, options) };
  });
}
