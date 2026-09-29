/**
 * Change minimap (SPEC section 21): a strip of links, one per change, positioned by
 * where the change sits in the new document. All positions are integer hundredths
 * of a percent computed with integer arithmetic, so every port gets the same bytes.
 */
import { codePointLength } from './normalize';
import { escapeHtml, idPrefixOf } from './render';
import type { Change, Hunk, RenderOptions, SplitHunk } from './types';

export type MinimapKind = 'added' | 'removed' | 'modified' | 'moved';

export interface MinimapMark {
  /** The change index N (matches data-change-index / id="{prefix}-change-N"). */
  index: number;
  kind: MinimapKind;
  /** Top offset in hundredths of a percent, 0..10000. */
  top: number;
  /** Height in hundredths of a percent, 0..10000 - top. */
  height: number;
}

/**
 * round(part / total * 100, 2 decimals, half up) as an integer number of hundredths:
 * floor((2 * part * 10000 + total) / (2 * total)). 0 when total <= 0.
 * (Exact in doubles for total below ~1e11; PHP: intdiv.)
 */
export function hundredths(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.floor((2 * part * 10000 + total) / (2 * total));
}

/** Format hundredths as a percentage with exactly two decimals: 1250 → "12.50%". */
export function formatPercent(h: number): string {
  const frac = h % 100;
  return `${Math.floor(h / 100)}.${frac < 10 ? '0' : ''}${frac}%`;
}

function mark(index: number, kind: MinimapKind, start: number, end: number, total: number): MinimapMark {
  const top = hundredths(start, total);
  return { index, kind, top, height: hundredths(end, total) - top };
}

/**
 * Marks for a text-mode change list: one per added/removed change, positioned by
 * code-point offset in the new text. Removed changes have zero height.
 */
export function minimapMarksText(changes: Change[]): MinimapMark[] {
  let total = 0;
  for (const c of changes) if (!c.removed) total += codePointLength(c.value);
  const out: MinimapMark[] = [];
  let offset = 0;
  let index = 0;
  for (const c of changes) {
    if (c.value === '') continue;
    const len = codePointLength(c.value);
    if (c.added) {
      out.push(mark(index++, 'added', offset, offset + len, total));
      offset += len;
    } else if (c.removed) {
      out.push(mark(index++, 'removed', offset, offset, total));
    } else {
      offset += len;
    }
  }
  return out;
}

type AnyRow = { type: string; newNo?: number; right?: unknown };

function hasNewSide(row: AnyRow): boolean {
  return row.newNo !== undefined || row.right !== undefined;
}

function runKind(types: string[]): MinimapKind {
  if (types.every((t) => t === 'added')) return 'added';
  if (types.every((t) => t === 'removed')) return 'removed';
  if (types.every((t) => t === 'moved-from' || t === 'moved-to')) return 'moved';
  return 'modified';
}

/**
 * Marks for unified hunks or split hunks: one per contiguous run of changed rows
 * (the same runs that carry data-change-index), positioned by new-document line.
 */
export function minimapMarksLines(hunks: Array<Hunk | SplitHunk>): MinimapMark[] {
  let total = 0;
  for (const h of hunks) {
    if (h.type === 'collapsed') total += h.count;
    else for (const row of h.rows as AnyRow[]) if (hasNewSide(row)) total++;
  }
  const out: MinimapMark[] = [];
  let before = 0; // new lines before the current row
  let run: { start: number; types: string[]; lines: number } | null = null;
  const close = (): void => {
    if (!run) return;
    out.push(mark(out.length, runKind(run.types), run.start, run.start + run.lines, total));
    run = null;
  };
  for (const h of hunks) {
    if (h.type === 'collapsed') {
      close();
      before += h.count;
      continue;
    }
    for (const row of h.rows as AnyRow[]) {
      if (row.type === 'equal') {
        close();
      } else {
        if (!run) run = { start: before, types: [], lines: 0 };
        run.types.push(row.type);
        if (hasNewSide(row)) run.lines++;
      }
      if (hasNewSide(row)) before++;
    }
  }
  close();
  return out;
}

const KIND_WORD: Record<MinimapKind, string> = {
  added: 'added',
  removed: 'removed',
  modified: 'modified',
  moved: 'moved',
};

/** The minimap strip. Each mark links to #{idPrefix}-change-N (render the diff with anchors: true). */
export function renderMinimap(marks: MinimapMark[], options: RenderOptions = {}): string {
  const prefix = escapeHtml(idPrefixOf(options));
  let out = '<nav class="text-diff-minimap" aria-label="Change minimap">';
  for (const m of marks) {
    out +=
      `<a class="diff-minimap-mark diff-minimap-${m.kind}" href="#${prefix}-change-${m.index}" ` +
      `style="top:${formatPercent(m.top)};height:${formatPercent(m.height)}" ` +
      `aria-label="Change ${m.index + 1}: ${KIND_WORD[m.kind]}"></a>`;
  }
  return out + '</nav>';
}

/** Diff and minimap side by side; the strip is sticky (see style.css). */
export function renderWithMinimap(diffHtml: string, minimapHtml: string): string {
  return `<div class="text-diff-with-minimap">${diffHtml}${minimapHtml}</div>`;
}
