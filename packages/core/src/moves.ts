/**
 * Moved-block detection on the line model (SPEC section 19).
 *
 * A move is a contiguous run of removed lines whose normalized text equals a
 * contiguous run of added lines in a different change region. Blocks are found
 * greedily, longest first, and numbered by their position in the new text.
 */
import { computeSimilarity } from './similarity';
import type { LineOptions, LineRow, MoveBlock } from './types';

/** Move detection is skipped when (removed rows) x (added rows) exceeds this. */
export const MOVE_MAX_PAIRS = 1_000_000;
/** Near-match comparisons are skipped (exact only) when (removed rows) x (added rows) exceeds this. */
export const MOVE_MAX_NEAR_PAIRS = 250_000;
/** Number of move color slots: diff-move-0 ... diff-move-5. */
export const MOVE_COLORS = 6;

/** Collapse whitespace runs to one space, trim, and lowercase when ignoreCase. */
export function normalizeMoveLine(text: string, ignoreCase = false): string {
  const s = text.replace(/\s+/g, ' ').trim();
  return ignoreCase ? s.toLowerCase() : s;
}

/** minMoveLines: floored; anything that is not a number >= 1 means 1. */
export function minMoveLinesOf(options: LineOptions): number {
  const n = options.minMoveLines;
  return typeof n === 'number' && n >= 1 ? Math.floor(n) : 1;
}

/** moveSimilarity: a number strictly between 0 and 1 enables near matches; anything else means exact only. */
export function moveThresholdOf(options: LineOptions): number {
  const t = options.moveSimilarity;
  return typeof t === 'number' && t > 0 && t < 1 ? t : 1;
}

/**
 * Detect moved blocks in a full row list (buildRows output, before collapsing).
 * Returns blocks sorted by newStart, with ids 0, 1, 2, ... in that order.
 */
export function buildMoves(rows: LineRow[], options: LineOptions = {}): MoveBlock[] {
  const n = rows.length;
  const region: number[] = new Array<number>(n).fill(-1);
  let r = -1;
  let removedCount = 0;
  let addedCount = 0;
  for (let i = 0; i < n; i++) {
    const t = rows[i]!.type;
    if (t === 'equal') continue;
    if (i === 0 || rows[i - 1]!.type === 'equal') r++;
    region[i] = r;
    if (t === 'removed') removedCount++;
    else if (t === 'added') addedCount++;
  }
  const pairs = removedCount * addedCount;
  if (pairs === 0 || pairs > MOVE_MAX_PAIRS) return [];

  const ignoreCase = options.ignoreCase === true;
  const minLines = minMoveLinesOf(options);
  const threshold = moveThresholdOf(options);
  const near = threshold < 1 && pairs <= MOVE_MAX_NEAR_PAIRS;

  const norm: string[] = rows.map((row) => (row.type === 'equal' ? '' : normalizeMoveLine(row.text, ignoreCase)));
  const removedIdx: number[] = [];
  const addedIdx: number[] = [];
  for (let i = 0; i < n; i++) {
    if (rows[i]!.type === 'removed') removedIdx.push(i);
    else if (rows[i]!.type === 'added') addedIdx.push(i);
  }

  // Candidates per added row: removed row indices in ascending order. For exact mode
  // only equal normalized text can match, so index by it (same result, fewer checks).
  const byNorm = new Map<string, number[]>();
  if (!near) {
    for (const i of removedIdx) {
      const list = byNorm.get(norm[i]!);
      if (list) list.push(i);
      else byNorm.set(norm[i]!, [i]);
    }
  }

  const simCache = new Map<number, boolean>();
  const eq = (i: number, j: number): boolean => {
    const a = norm[i]!;
    const b = norm[j]!;
    if (a === b) return true;
    if (!near || a === '' || b === '') return false;
    const key = i * n + j;
    let hit = simCache.get(key);
    if (hit === undefined) {
      hit = computeSimilarity(a, b, { html: false }) >= threshold;
      simCache.set(key, hit);
    }
    return hit;
  };

  const assigned = new Array<boolean>(n).fill(false);
  const found: Array<{ ri: number; aj: number; len: number }> = [];

  for (;;) {
    let bestRi = -1;
    let bestAj = -1;
    let bestLen = 0;
    for (const aj of addedIdx) {
      if (assigned[aj] || norm[aj] === '') continue;
      const candidates = near ? removedIdx : (byNorm.get(norm[aj]!) ?? []);
      for (const ri of candidates) {
        if (assigned[ri] || region[ri] === region[aj] || !eq(ri, aj)) continue;
        let len = 1;
        while (
          ri + len < n &&
          aj + len < n &&
          rows[ri + len]!.type === 'removed' &&
          rows[aj + len]!.type === 'added' &&
          !assigned[ri + len] &&
          !assigned[aj + len] &&
          eq(ri + len, aj + len)
        ) {
          len++;
        }
        while (norm[aj + len - 1] === '') len--; // blocks never end with a blank line
        if (len > bestLen) {
          bestRi = ri;
          bestAj = aj;
          bestLen = len;
        }
      }
    }
    if (bestLen === 0 || bestLen < minLines) break;
    for (let k = 0; k < bestLen; k++) {
      assigned[bestRi + k] = true;
      assigned[bestAj + k] = true;
    }
    found.push({ ri: bestRi, aj: bestAj, len: bestLen });
  }

  found.sort((a, b) => a.aj - b.aj);
  return found.map((f, id) => ({
    id,
    oldStart: rows[f.ri]!.oldNo!,
    newStart: rows[f.aj]!.newNo!,
    lines: f.len,
  }));
}

/** Rewrite removed/added rows covered by moves as moved-from/moved-to rows. */
export function applyMoves(rows: LineRow[], moves: MoveBlock[]): LineRow[] {
  if (moves.length === 0) return rows;
  const from = new Map<number, { id: number; to: number }>();
  const to = new Map<number, { id: number; from: number }>();
  for (const m of moves) {
    for (let k = 0; k < m.lines; k++) {
      from.set(m.oldStart + k, { id: m.id, to: m.newStart + k });
      to.set(m.newStart + k, { id: m.id, from: m.oldStart + k });
    }
  }
  return rows.map((row): LineRow => {
    if (row.type === 'removed') {
      const f = from.get(row.oldNo!);
      if (f) return { type: 'moved-from', oldNo: row.oldNo!, text: row.text, move: f.id, counterpart: f.to };
    } else if (row.type === 'added') {
      const t = to.get(row.newNo!);
      if (t) return { type: 'moved-to', newNo: row.newNo!, text: row.text, move: t.id, counterpart: t.from };
    }
    return row;
  });
}
