import { codePointLength } from './normalize';
import type { Change, DiffStats, Hunk, SplitHunk } from './types';

/** Added/removed/unchanged code points over a change list. */
export function computeStats(changes: Change[]): DiffStats {
  const stats: DiffStats = { added: 0, removed: 0, unchanged: 0, unit: 'codepoints' };
  for (const c of changes) {
    const n = codePointLength(c.value);
    if (c.added) stats.added += n;
    else if (c.removed) stats.removed += n;
    else stats.unchanged += n;
  }
  return stats;
}

/**
 * Added/removed/unchanged lines over unified or split hunks (collapsed lines count as unchanged).
 * Moved-from lines count as removed and moved-to lines as added.
 */
export function lineStats(hunks: Array<Hunk | SplitHunk>): DiffStats {
  const stats: DiffStats = { added: 0, removed: 0, unchanged: 0, unit: 'lines' };
  for (const h of hunks) {
    if (h.type === 'collapsed') {
      stats.unchanged += h.count;
      continue;
    }
    for (const row of h.rows) {
      if ('text' in row) {
        if (row.type === 'added' || row.type === 'moved-to') stats.added++;
        else if (row.type === 'removed' || row.type === 'moved-from') stats.removed++;
        else stats.unchanged++;
      } else {
        if (row.type === 'equal') stats.unchanged++;
        else {
          if (row.left) stats.removed++;
          if (row.right) stats.added++;
        }
      }
    }
  }
  return stats;
}
