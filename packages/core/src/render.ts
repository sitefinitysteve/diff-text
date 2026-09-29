/**
 * Canonical HTML for every view. PHP reproduces these strings byte-for-byte;
 * Vue and React reproduce them structurally (same elements, classes, attributes, text).
 * No whitespace is emitted between tags and there is no trailing newline.
 */
import type {
  Change,
  DiffStats,
  HtmlDiffResult,
  Hunk,
  LineRow,
  LineRowType,
  RenderOptions,
  SplitCell,
  SplitHunk,
  SplitRow,
  TextMode,
} from './types';

/** Minus sign used for removals (U+2212). */
export const MINUS = '−';

/** Escape & < > " ' as &amp; &lt; &gt; &quot; &#39; (in that exact form). */
export function escapeHtml(text: string): string {
  // Browsers turn CR and CRLF into LF when parsing HTML, so emit LF up front:
  // otherwise server-rendered markup and the hydrated DOM disagree.
  return text.replace(/\r\n?/g, '\n').replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

/** Default prefix for every emitted id (SPEC section 18). */
export const DEFAULT_ID_PREFIX = 'td';

/** The id prefix to use: options.idPrefix when it is a non-empty string, else "td". Not escaped. */
export function idPrefixOf(options?: RenderOptions | { idPrefix?: string }): string {
  const p = options?.idPrefix;
  return typeof p === 'string' && p !== '' ? p : DEFAULT_ID_PREFIX;
}

/** ` id="{prefix}-change-{index}"` when anchors are on, else "". */
function anchorAttr(options: RenderOptions | undefined, index: number): string {
  if (options?.anchors !== true) return '';
  return ` id="${escapeHtml(idPrefixOf(options))}-change-${index}"`;
}

const MODE_CLASS: Record<TextMode, string> = {
  chars: 'text-diff-chars',
  words: 'text-diff-words',
  wordsWithSpace: 'text-diff-words-with-space',
  lines: 'text-diff-lines',
  sentences: 'text-diff-sentences',
};

export function modeClass(mode: TextMode): string {
  return MODE_CLASS[mode];
}

/** "1 unchanged line" / "N unchanged lines". */
export function collapsedLabel(count: number): string {
  return count === 1 ? '1 unchanged line' : `${count} unchanged lines`;
}

/**
 * The spans of a text-mode view. `extra(index)` returns attributes appended after
 * data-change-index on changed spans (used by playback).
 */
export function renderTextSpans(
  changes: Change[],
  options?: RenderOptions,
  extra: (index: number) => string = () => '',
): string {
  let out = '';
  let index = 0;
  for (const c of changes) {
    if (c.value === '') continue;
    const text = escapeHtml(c.value);
    if (c.added || c.removed) {
      const cls = c.added ? 'diff-added' : 'diff-removed';
      out += `<span class="${cls}"${anchorAttr(options, index)} data-change-index="${index}"${extra(index)}>${text}</span>`;
      index++;
    } else {
      out += `<span>${text}</span>`;
    }
  }
  return out;
}

/**
 * Text modes: one span per change; added/removed spans carry data-change-index
 * (and id="{idPrefix}-change-N" when options.anchors is true).
 */
export function renderText(mode: TextMode, changes: Change[], options?: RenderOptions): string {
  return `<div class="text-diff ${MODE_CLASS[mode]}">${renderTextSpans(changes, options)}</div>`;
}

const EMPTY_STATE = '<div class="diff-empty">No changes</div>';

function sign(type: LineRowType): string {
  const s = type === 'added' || type === 'moved-to' ? '+' : type === 'removed' || type === 'moved-from' ? MINUS : ' ';
  return `<span class="diff-sign" aria-hidden="true">${s}</span>`;
}

function collapsedRow(count: number): string {
  return `<div class="diff-row diff-row-collapsed">${collapsedLabel(count)}</div>`;
}

function hasChanges(hunks: Array<Hunk | SplitHunk>): boolean {
  return hunks.some((h) => h.type === 'hunk' && h.rows.some((r) => r.type !== 'equal'));
}

function isMoved(type: string): type is 'moved-from' | 'moved-to' {
  return type === 'moved-from' || type === 'moved-to';
}

/** "line 4 moved to line 9" / "line 9 moved from line 4". */
export function moveLabel(type: 'moved-from' | 'moved-to', lineNo: number, counterpart: number): string {
  return type === 'moved-from' ? `line ${lineNo} moved to line ${counterpart}` : `line ${lineNo} moved from line ${counterpart}`;
}

/** The counterpart link of a moved row; only the first row of a block carries the block's id. */
function moveLink(type: 'moved-from' | 'moved-to', move: number, counterpart: number, first: boolean, prefix: string): string {
  const p = escapeHtml(prefix);
  const self = type === 'moved-from' ? 'from' : 'to';
  const other = type === 'moved-from' ? 'to' : 'from';
  const id = first ? ` id="${p}-move-${move}-${self}"` : '';
  return `<a class="diff-move-link"${id} href="#${p}-move-${move}-${other}">moved ${other} line ${counterpart}</a>`;
}

function moveClass(move: number): string {
  return ` diff-move-${move % 6}`;
}

function unifiedRow(row: LineRow, changeIndex: number | null, firstOfMove: boolean, options?: RenderOptions): string {
  const oldNo = row.oldNo !== undefined ? String(row.oldNo) : '';
  const newNo = row.newNo !== undefined ? String(row.newNo) : '';
  const moved = isMoved(row.type);
  let attrs = `class="diff-row diff-row-${row.type}${moved ? moveClass(row.move!) : ''}"`;
  if (changeIndex !== null) attrs += anchorAttr(options, changeIndex);
  if (row.type === 'added') attrs += ` role="group" aria-label="added line ${row.newNo}"`;
  if (row.type === 'removed') attrs += ` role="group" aria-label="removed line ${row.oldNo}"`;
  if (row.type === 'moved-from') attrs += ` role="group" aria-label="${moveLabel(row.type, row.oldNo!, row.counterpart!)}"`;
  if (row.type === 'moved-to') attrs += ` role="group" aria-label="${moveLabel(row.type, row.newNo!, row.counterpart!)}"`;
  if (moved) attrs += ` data-move="${row.move}"`;
  if (changeIndex !== null) attrs += ` data-change-index="${changeIndex}"`;
  const link = isMoved(row.type)
    ? moveLink(row.type, row.move!, row.counterpart!, firstOfMove, idPrefixOf(options))
    : '';
  return (
    `<div ${attrs}>` +
    `<span class="diff-gutter diff-gutter-old">${oldNo}</span>` +
    `<span class="diff-gutter diff-gutter-new">${newNo}</span>` +
    sign(row.type) +
    `<span class="diff-line">${escapeHtml(row.text)}</span>` +
    link +
    `</div>`
  );
}

/** True when `row` is a moved row that does not continue the same block as `prev`. */
function startsMoveBlock(row: { type: string; move?: number }, prev: { type: string; move?: number } | null): boolean {
  if (!isMoved(row.type)) return false;
  return !(prev && prev.type === row.type && prev.move === row.move);
}

/**
 * Unified view. data-change-index goes on the first row of each contiguous run of
 * changed rows. With no changed rows at all, renders the empty state.
 * Options: idPrefix (move links, anchors) and anchors (SPEC section 18).
 */
export function renderUnified(hunks: Hunk[], options?: RenderOptions): string {
  let out = '<div class="text-diff text-diff-unified">';
  if (!hasChanges(hunks)) return out + EMPTY_STATE + '</div>';
  let index = 0;
  let inRun = false;
  let prev: LineRow | null = null;
  for (const h of hunks) {
    if (h.type === 'collapsed') {
      out += collapsedRow(h.count);
      inRun = false;
      prev = null;
      continue;
    }
    for (const row of h.rows) {
      const first = startsMoveBlock(row, prev);
      if (row.type === 'equal') {
        inRun = false;
        out += unifiedRow(row, null, false, options);
      } else {
        out += unifiedRow(row, inRun ? null : index++, first, options);
        inRun = true;
      }
      prev = row;
    }
  }
  return out + '</div>';
}

function renderParts(parts: Change[]): string {
  let out = '';
  for (const p of parts) {
    if (p.value === '') continue;
    const text = escapeHtml(p.value);
    if (p.added) out += `<span class="diff-added">${text}</span>`;
    else if (p.removed) out += `<span class="diff-removed">${text}</span>`;
    else out += `<span>${text}</span>`;
  }
  return out;
}

function splitCell(side: 'old' | 'new', c: SplitCell | undefined, firstOfMove: boolean, options?: RenderOptions): string {
  if (!c) return `<div class="diff-cell diff-cell-${side} diff-cell-empty"></div>`;
  let attrs = `class="diff-cell diff-cell-${side}`;
  if (isMoved(c.type)) {
    attrs += ` diff-cell-${c.type}" role="group" aria-label="${moveLabel(c.type, c.lineNo, c.counterpart!)}"`;
  } else if (c.type !== 'equal') {
    attrs += ` diff-cell-${c.type}" role="group" aria-label="${c.type} line ${c.lineNo}"`;
  } else {
    attrs += '"';
  }
  const body = c.parts ? renderParts(c.parts) : escapeHtml(c.text);
  const link = isMoved(c.type) ? moveLink(c.type, c.move!, c.counterpart!, firstOfMove, idPrefixOf(options)) : '';
  return (
    `<div ${attrs}>` +
    `<span class="diff-gutter">${c.lineNo}</span>` +
    sign(c.type) +
    `<span class="diff-line">${body}</span>` +
    link +
    `</div>`
  );
}

function splitRow(row: SplitRow, changeIndex: number | null, firstOfMove: boolean, options?: RenderOptions): string {
  const move = row.type === 'moved-from' ? row.left!.move : row.type === 'moved-to' ? row.right!.move : undefined;
  let attrs = `class="diff-row diff-row-${row.type}${move !== undefined ? moveClass(move) : ''}"`;
  if (changeIndex !== null) attrs += anchorAttr(options, changeIndex);
  if (move !== undefined) attrs += ` data-move="${move}"`;
  if (changeIndex !== null) attrs += ` data-change-index="${changeIndex}"`;
  return `<div ${attrs}>${splitCell('old', row.left, firstOfMove, options)}${splitCell('new', row.right, firstOfMove, options)}</div>`;
}

function splitMove(row: SplitRow): { type: string; move?: number } {
  const c = row.type === 'moved-from' ? row.left : row.type === 'moved-to' ? row.right : undefined;
  return c ? { type: row.type, move: c.move! } : { type: row.type };
}

/**
 * Split (side-by-side) view. Rows are equal | modified | removed | added |
 * moved-from | moved-to | collapsed. data-change-index goes on the first row of
 * each contiguous run of changed rows. Options as for renderUnified.
 */
export function renderSplit(hunks: SplitHunk[], options?: RenderOptions): string {
  let out = '<div class="text-diff text-diff-split">';
  if (!hasChanges(hunks)) return out + EMPTY_STATE + '</div>';
  let index = 0;
  let inRun = false;
  let prev: { type: string; move?: number } | null = null;
  for (const h of hunks) {
    if (h.type === 'collapsed') {
      out += collapsedRow(h.count);
      inRun = false;
      prev = null;
      continue;
    }
    for (const row of h.rows) {
      const cur = splitMove(row);
      const first = startsMoveBlock(cur, prev);
      if (row.type === 'equal') {
        inRun = false;
        out += splitRow(row, null, false, options);
      } else {
        out += splitRow(row, inRun ? null : index++, first, options);
        inRun = true;
      }
      prev = cur;
    }
  }
  return out + '</div>';
}

/** Round a similarity in [0,1] to an integer percent: floor(s * 100 + 0.5). */
export function similarityPercent(similarity: number): number {
  return Math.floor(similarity * 100 + 0.5);
}

function unitWord(unit: DiffStats['unit'], n: number): string {
  if (unit === 'lines') return n === 1 ? 'line' : 'lines';
  return n === 1 ? 'character' : 'characters';
}

function stat(kind: 'added' | 'removed' | 'unchanged', visible: string, n: number, unit: DiffStats['unit']): string {
  return (
    `<span class="diff-stat diff-stat-${kind}">` +
    `<span aria-hidden="true">${visible}</span>` +
    `<span class="diff-sr">${n} ${unitWord(unit, n)} ${kind}</span>` +
    `</span>`
  );
}

/** Stats badge. Similarity (optional) renders as "N% similar". */
export function renderStats(stats: DiffStats, similarity?: number | null): string {
  let out = `<div class="text-diff-stats" data-unit="${stats.unit}">`;
  out += stat('added', `+${stats.added}`, stats.added, stats.unit);
  out += stat('removed', `${MINUS}${stats.removed}`, stats.removed, stats.unit);
  out += stat('unchanged', `=${stats.unchanged}`, stats.unchanged, stats.unit);
  if (typeof similarity === 'number') {
    out += `<span class="diff-stat diff-stat-similarity">${similarityPercent(similarity)}% similar</span>`;
  }
  return out + '</div>';
}

/** HTML view: the diffHtml result inside the container. */
export function renderHtmlDiff(result: HtmlDiffResult): string {
  return `<div class="text-diff text-diff-html">${result.html}</div>`;
}
