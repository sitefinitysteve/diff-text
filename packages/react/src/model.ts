/**
 * Framework-agnostic view models shared by the Vue and React wrappers.
 * This file is byte-identical in packages/vue and packages/react.
 *
 * The models mirror @diff-text/core's canonical renderers (render.ts, heatmap.ts,
 * minimap.ts, timeline.ts, playback.ts) so that the framework components produce
 * the same elements, classes, attributes and text.
 */
import {
  ARROW,
  HEAT_LABELS,
  MINUS,
  TEXT_MODES,
  buildHeatmap,
  buildHunks,
  buildSplitRows,
  computeDiff,
  computeStats,
  heatLabel,
  lineStats,
  minimapMarksLines,
  minimapMarksText,
  moveLabel,
  pairRows,
  playbackStep,
} from '@diff-text/core';
import type {
  Change,
  DiffOptions,
  DiffStats,
  HeatmapOptions,
  LineOptions,
  LineRow,
  LineRowType,
  MinimapMark,
  SplitCell,
  SplitRow,
  TextMode,
} from '@diff-text/core';

/** Options accepted by the line views (DiffUnified, DiffSplit). */
export interface LineViewOptions {
  ignoreCase?: boolean;
  ignoreWhitespace?: boolean;
  stripTrailingCr?: boolean;
}

/** Moved-block detection (SPEC section 19); DiffUnified and DiffSplit take these as props. */
export interface MoveOptions {
  detectMoves?: boolean;
  minMoveLines?: number;
  moveSimilarity?: number;
}

/** Engine options accepted by DiffHtml (SPEC section 12; markers are fixed by the library). */
export interface DiffHtmlOptions {
  /** Absorb unchanged text runs shorter than this share of the changes around them. Default 0.3. */
  orphanMatchThreshold?: number;
  /** Compare text case-insensitively (the new document's spelling is shown). */
  ignoreCase?: boolean;
  /** Past this edit distance (in tokens), the whole documents are one replacement. */
  maxEditLength?: number;
}

/** Modes accepted by DiffStats: a text mode (code points) or a line view (lines). */
export type StatsMode = TextMode | 'unified' | 'split';

/** Modes accepted by DiffTimeline (anything else falls back to 'words'). */
export type TimelineMode = TextMode | 'unified' | 'split';

/** Diff options for DiffTimeline: text-mode options, or line-view options incl. contextLines and moves. */
export type TimelineViewOptions = DiffOptions & LineOptions;

/** Imperative navigation exposed by every diff view. */
export interface DiffNavigation {
  /** Move to the next change (wraps around). Returns the new index, or -1 when there are no changes. */
  next(): number;
  /** Move to the previous change (wraps around). Returns the new index, or -1 when there are no changes. */
  prev(): number;
  /** Move to change `index` (wrapped into range). Returns the new index, or -1 when there are no changes. */
  goTo(index: number): number;
  /** Number of navigable changes (elements with data-change-index). Always the current value. */
  readonly count: number;
}

/** Sign shown in the sign column: + for added/moved-to, − for removed/moved-from, space otherwise. */
export function signFor(type: LineRowType): string {
  if (type === 'added' || type === 'moved-to') return '+';
  if (type === 'removed' || type === 'moved-from') return MINUS;
  return ' ';
}

/**
 * Stable serialization of an options object (keys sorted, undefined dropped). Views key
 * their UI state (expanded blocks, current change) and memoized models on this string,
 * so an equal but newly created options object does not reset anything.
 */
export function stableKey(value: unknown): string {
  const json = JSON.stringify(value ?? null, (_key, v: unknown) => {
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return v;
    const record = v as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(record).sort()) sorted[k] = record[k];
    return sorted;
  });
  return json ?? 'null';
}

/** Inverse of stableKey: a plain copy of the options it serialized. */
export function fromKey<T>(key: string): T {
  return JSON.parse(key) as T;
}

/**
 * Text as it is displayed: every CRLF and lone CR becomes LF (SPEC section 13). HTML
 * parsers do the same, so server-rendered markup and the hydrated DOM agree.
 */
export function displayText(text: string): string {
  return text.includes('\r') ? text.replace(/\r\n?/g, '\n') : text;
}

function displayParts(parts: Change[] | undefined): Change[] | undefined {
  return parts?.map((p) => (p.value.includes('\r') ? { ...p, value: displayText(p.value) } : p));
}

function displayCell(cell: SplitCell | undefined): SplitCell | undefined {
  if (!cell) return cell;
  const out: SplitCell = { ...cell, text: displayText(cell.text) };
  if (cell.parts) out.parts = displayParts(cell.parts);
  return out;
}

/** A unified row or split row with its display text (see displayText). */
function displayRow<R>(row: R): R {
  const r = row as unknown as LineRow & SplitRow;
  if (typeof r.text === 'string') return { ...row, text: displayText(r.text) };
  return { ...row, left: displayCell(r.left), right: displayCell(r.right) };
}

// ---------------------------------------------------------------------------
// Element ids (SPEC section 18)
// ---------------------------------------------------------------------------

/**
 * Default id prefix built from a framework id (React/Vue useId()): "td-" plus the id
 * with every character outside [A-Za-z0-9_-] removed, so it is valid in ids, fragments
 * and CSS selectors.
 */
export function generatedIdPrefix(frameworkId: string): string {
  return `td-${frameworkId.replace(/[^A-Za-z0-9_-]/g, '')}`;
}

/** The idPrefix prop when it is a non-empty string, else the generated default. */
export function resolveIdPrefix(prop: string | null | undefined, generated: string): string {
  return typeof prop === 'string' && prop !== '' ? prop : generated;
}

/** id="{prefix}-change-{index}" when anchors are on (and the element carries an index). */
export function anchorId(anchors: boolean, prefix: string, index: number | null): string | undefined {
  return anchors && index !== null ? `${prefix}-change-${index}` : undefined;
}

// ---------------------------------------------------------------------------
// Text modes
// ---------------------------------------------------------------------------

export interface TextPart {
  value: string;
  kind: 'equal' | 'added' | 'removed';
  /** data-change-index for added/removed parts, null for unchanged ones. */
  changeIndex: number | null;
}

export interface TextModel {
  parts: TextPart[];
  count: number;
  /** The raw change list (for the minimap). */
  changes: Change[];
}

export function textModelOf(changes: Change[]): TextModel {
  const parts: TextPart[] = [];
  let index = 0;
  for (const c of changes) {
    if (c.value === '') continue;
    const value = displayText(c.value);
    if (c.added) parts.push({ value, kind: 'added', changeIndex: index++ });
    else if (c.removed) parts.push({ value, kind: 'removed', changeIndex: index++ });
    else parts.push({ value, kind: 'equal', changeIndex: null });
  }
  return { parts, count: index, changes };
}

export function textModel(mode: TextMode, oldText: string, newText: string, options?: DiffOptions): TextModel {
  return textModelOf(computeDiff(mode, oldText, newText, options ?? {}));
}

export function textMarks(model: TextModel): MinimapMark[] {
  return minimapMarksText(model.changes);
}

/** Intra-line parts of a split cell (no data-change-index). */
export function partKind(part: Change): 'equal' | 'added' | 'removed' {
  return part.added ? 'added' : part.removed ? 'removed' : 'equal';
}

export function nonEmptyParts(parts: Change[]): Change[] {
  return parts.filter((p) => p.value !== '');
}

// ---------------------------------------------------------------------------
// Minimap (SPEC section 21)
// ---------------------------------------------------------------------------

export interface MinimapLink {
  key: number;
  className: string;
  href: string;
  style: string;
  label: string;
}

function percent(h: number): string {
  const frac = h % 100;
  return `${Math.floor(h / 100)}.${frac < 10 ? '0' : ''}${frac}%`;
}

export function minimapLinks(marks: MinimapMark[], prefix: string): MinimapLink[] {
  return marks.map((m) => ({
    key: m.index,
    className: `diff-minimap-mark diff-minimap-${m.kind}`,
    href: `#${prefix}-change-${m.index}`,
    style: `top:${percent(m.top)};height:${percent(m.height)}`,
    label: `Change ${m.index + 1}: ${m.kind}`,
  }));
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

/** Number of data-change-index markers in diffHtml output. */
export function countHtmlChanges(html: string): number {
  const matches = html.match(/data-change-index="\d+"/g);
  return matches ? matches.length : 0;
}

// ---------------------------------------------------------------------------
// Line views
// ---------------------------------------------------------------------------

export interface RowItem<R> {
  kind: 'row';
  key: string;
  row: R;
  changeIndex: number | null;
  /** Moved rows: true on the first row of a move block (it carries the link id). */
  firstOfMove: boolean;
}

export interface CollapsedItem {
  kind: 'collapsed';
  key: string;
  /** Index of the collapsed block among the view's blocks (used for expansion state). */
  block: number;
  count: number;
  rows: LineRow[];
}

type Block<R> = { type: 'hunk'; rows: R[] } | { type: 'collapsed'; count: number; rows: LineRow[] };

export interface LineViewModel<R> {
  items: Array<RowItem<R> | CollapsedItem>;
  /** False when no visible row is changed: the view renders the empty state. */
  hasChanges: boolean;
  count: number;
  /** Minimap marks (same runs as data-change-index). */
  marks: () => MinimapMark[];
}

/** Move id of a unified or split row, or undefined when it is not a moved row. */
function moveOf(row: { type: string; move?: number; left?: SplitCell; right?: SplitCell }): number | undefined {
  if (row.type !== 'moved-from' && row.type !== 'moved-to') return undefined;
  if (row.move !== undefined) return row.move;
  return row.type === 'moved-from' ? row.left?.move : row.right?.move;
}

function indexBlocks<R extends { type: string }>(blocks: Array<Block<R>>): LineViewModel<R> {
  const items: Array<RowItem<R> | CollapsedItem> = [];
  let index = 0;
  let inRun = false;
  let hasChanges = false;
  blocks.forEach((b, block) => {
    if (b.type === 'collapsed') {
      items.push({ kind: 'collapsed', key: `c${block}`, block, count: b.count, rows: b.rows.map(displayRow) });
      inRun = false;
      return;
    }
    let prev: R | null = null;
    b.rows.forEach((raw, i) => {
      const row = displayRow(raw);
      const key = `h${block}-${i}`;
      const move = moveOf(row);
      const firstOfMove = move !== undefined && !(prev && prev.type === row.type && moveOf(prev) === move);
      if (row.type === 'equal') {
        inRun = false;
        items.push({ kind: 'row', key, row, changeIndex: null, firstOfMove });
      } else {
        hasChanges = true;
        items.push({ kind: 'row', key, row, changeIndex: inRun ? null : index++, firstOfMove });
        inRun = true;
      }
      prev = row;
    });
  });
  let marks: MinimapMark[] | null = null;
  return {
    items,
    hasChanges,
    count: index,
    marks: () => (marks ??= minimapMarksLines(blocks as unknown as Parameters<typeof minimapMarksLines>[0])),
  };
}

function lineOptions(
  options: LineViewOptions | undefined,
  contextLines: number | undefined,
  moves: MoveOptions | undefined,
): LineOptions {
  const out: LineOptions = { ...(options ?? {}) };
  if (contextLines !== undefined) out.contextLines = contextLines;
  if (moves?.detectMoves !== undefined) out.detectMoves = moves.detectMoves;
  if (moves?.minMoveLines !== undefined) out.minMoveLines = moves.minMoveLines;
  if (moves?.moveSimilarity !== undefined) out.moveSimilarity = moves.moveSimilarity;
  return out;
}

export function unifiedModel(
  oldText: string,
  newText: string,
  contextLines?: number,
  options?: LineViewOptions,
  moves?: MoveOptions,
): LineViewModel<LineRow> {
  return indexBlocks<LineRow>(buildHunks(oldText, newText, lineOptions(options, contextLines, moves)));
}

export function splitModel(
  oldText: string,
  newText: string,
  contextLines?: number,
  options?: LineViewOptions,
  moves?: MoveOptions,
): LineViewModel<SplitRow> {
  return indexBlocks<SplitRow>(buildSplitRows(oldText, newText, lineOptions(options, contextLines, moves)));
}

/**
 * Replace every expanded collapsed block with its rows (unchanged rows never carry a
 * change index, so expanding does not renumber anything).
 */
export function expandItems<R>(
  model: LineViewModel<R>,
  expanded: { has(block: number): boolean },
  toRows: (rows: LineRow[]) => R[],
): Array<RowItem<R> | CollapsedItem> {
  const out: Array<RowItem<R> | CollapsedItem> = [];
  for (const item of model.items) {
    if (item.kind === 'collapsed' && expanded.has(item.block)) {
      toRows(item.rows).forEach((row, i) => {
        out.push({ kind: 'row', key: `${item.key}-${i}`, row, changeIndex: null, firstOfMove: false });
      });
    } else {
      out.push(item);
    }
  }
  return out;
}

export const unifiedRowsOf = (rows: LineRow[]): LineRow[] => rows;
export const splitRowsOf = (rows: LineRow[]): SplitRow[] => pairRows(rows);

export function unifiedAriaLabel(row: LineRow): string | undefined {
  if (row.type === 'added') return `added line ${row.newNo}`;
  if (row.type === 'removed') return `removed line ${row.oldNo}`;
  if (row.type === 'moved-from') return moveLabel(row.type, row.oldNo!, row.counterpart!);
  if (row.type === 'moved-to') return moveLabel(row.type, row.newNo!, row.counterpart!);
  return undefined;
}

/** Class list of a unified or split row, e.g. "diff-row diff-row-moved-to diff-move-1". */
export function rowClass(row: { type: string; move?: number; left?: SplitCell; right?: SplitCell }): string {
  const move = moveOf(row);
  return `diff-row diff-row-${row.type}${move !== undefined ? ` diff-move-${move % 6}` : ''}`;
}

/** data-move of a moved row, or undefined. */
export function rowMove(row: { type: string; move?: number; left?: SplitCell; right?: SplitCell }): number | undefined {
  return moveOf(row);
}

/** Class list of a split cell. */
export function cellClass(side: 'old' | 'new', cell: SplitCell | undefined): string {
  if (!cell) return `diff-cell diff-cell-${side} diff-cell-empty`;
  return cell.type === 'equal' ? `diff-cell diff-cell-${side}` : `diff-cell diff-cell-${side} diff-cell-${cell.type}`;
}

/** aria-label of a changed split cell, or undefined for equal cells. */
export function cellAriaLabel(cell: SplitCell): string | undefined {
  if (cell.type === 'equal') return undefined;
  if (cell.type === 'moved-from' || cell.type === 'moved-to') return moveLabel(cell.type, cell.lineNo, cell.counterpart!);
  return `${cell.type} line ${cell.lineNo}`;
}

export interface MoveLink {
  id: string | undefined;
  href: string;
  text: string;
}

/** The counterpart link of a moved row or cell; only the first row of a block carries the id. */
export function moveLink(
  item: { type: string; move?: number; counterpart?: number },
  first: boolean,
  prefix: string,
): MoveLink | null {
  if (item.type !== 'moved-from' && item.type !== 'moved-to') return null;
  const self = item.type === 'moved-from' ? 'from' : 'to';
  const other = item.type === 'moved-from' ? 'to' : 'from';
  return {
    id: first ? `${prefix}-move-${item.move}-${self}` : undefined,
    href: `#${prefix}-move-${item.move}-${other}`,
    text: `moved ${other} line ${item.counterpart}`,
  };
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export function statsFor(
  mode: StatsMode,
  oldText: string,
  newText: string,
  options?: DiffOptions & LineOptions,
): DiffStats {
  if (mode === 'unified') return lineStats(buildHunks(oldText, newText, options ?? {}));
  if (mode === 'split') return lineStats(buildSplitRows(oldText, newText, options ?? {}));
  return computeStats(computeDiff(mode, oldText, newText, options ?? {}));
}

export interface StatItem {
  kind: 'added' | 'removed' | 'unchanged';
  visible: string;
  label: string;
}

function unitWord(unit: DiffStats['unit'], n: number): string {
  if (unit === 'lines') return n === 1 ? 'line' : 'lines';
  return n === 1 ? 'character' : 'characters';
}

export function statItems(stats: DiffStats): StatItem[] {
  const item = (kind: StatItem['kind'], visible: string, n: number): StatItem => ({
    kind,
    visible,
    label: `${n} ${unitWord(stats.unit, n)} ${kind}`,
  });
  return [
    item('added', `+${stats.added}`, stats.added),
    item('removed', `${MINUS}${stats.removed}`, stats.removed),
    item('unchanged', `=${stats.unchanged}`, stats.unchanged),
  ];
}

// ---------------------------------------------------------------------------
// Heatmap (SPEC section 20)
// ---------------------------------------------------------------------------

export interface HeatItem {
  kind: 'gap' | 'removed' | 'sentence';
  text: string;
  /** Sentences only. */
  heat: number;
  /** data-change-index for heat >= 1 sentences and removed markers, else null. */
  changeIndex: number | null;
  /** title / screen-reader label (heat >= 1 sentences). */
  label: string;
}

export interface HeatLegendItem {
  key: string;
  className: string;
  heat: number | undefined;
  text: string;
}

export interface HeatmapModel {
  items: HeatItem[];
  legend: HeatLegendItem[];
  count: number;
}

export function heatmapModel(
  oldText: string,
  newText: string,
  options: HeatmapOptions | undefined,
  showRemoved: boolean,
): HeatmapModel {
  const heatmap = buildHeatmap(oldText, newText, options ?? {});
  const items: HeatItem[] = [];
  const counts = [0, 0, 0, 0, 0];
  let removed = 0;
  let index = 0;
  for (const seg of heatmap.segments) {
    if (seg.type === 'gap') {
      items.push({ kind: 'gap', text: displayText(seg.text), heat: 0, changeIndex: null, label: '' });
    } else if (seg.type === 'removed') {
      if (!showRemoved) continue;
      removed++;
      items.push({ kind: 'removed', text: displayText(seg.text), heat: 0, changeIndex: index++, label: 'removed sentence' });
    } else {
      counts[seg.heat]!++;
      const changed = seg.heat !== 0;
      items.push({
        kind: 'sentence',
        text: displayText(seg.text),
        heat: seg.heat,
        changeIndex: changed ? index++ : null,
        label: changed ? heatLabel(seg) : '',
      });
    }
  }
  const legend: HeatLegendItem[] = counts.map((n, h) => ({
    key: `h${h}`,
    className: 'diff-heat-key',
    heat: h,
    text: `${HEAT_LABELS[h]} (${n})`,
  }));
  if (showRemoved) {
    legend.push({ key: 'removed', className: 'diff-heat-key diff-heat-key-removed', heat: undefined, text: `removed (${removed})` });
  }
  return { items, legend, count: index };
}

// ---------------------------------------------------------------------------
// Timeline (SPEC section 22)
// ---------------------------------------------------------------------------

export interface TimelineStepItem {
  /** 1-based step number K (versions[K-1] → versions[K]). */
  step: number;
  oldText: string;
  newText: string;
  /** "from → to". */
  caption: string;
}

export interface TimelineModel {
  mode: TimelineMode;
  steps: TimelineStepItem[];
}

export function timelineMode(mode: unknown): TimelineMode {
  if (mode === 'unified' || mode === 'split') return mode;
  return (TEXT_MODES as readonly unknown[]).includes(mode) ? (mode as TextMode) : 'words';
}

export function timelineModel(versions: readonly string[], labels: readonly unknown[] | undefined, mode: unknown): TimelineModel {
  const names = versions.map((_, i) => {
    const l = labels?.[i];
    return typeof l === 'string' ? l : `v${i + 1}`;
  });
  const steps: TimelineStepItem[] = [];
  for (let k = 1; k < versions.length; k++) {
    steps.push({ step: k, oldText: versions[k - 1]!, newText: versions[k]!, caption: `${names[k - 1]} ${ARROW} ${names[k]}` });
  }
  return { mode: timelineMode(mode), steps };
}

/** Split timeline options into the props of DiffUnified / DiffSplit. */
export function lineViewProps(options: TimelineViewOptions | undefined): {
  contextLines: number | undefined;
  moves: MoveOptions;
  options: LineViewOptions;
} {
  const { contextLines, detectMoves, minMoveLines, moveSimilarity, ...rest } = options ?? {};
  return { contextLines, moves: { detectMoves, minMoveLines, moveSimilarity }, options: rest };
}

// ---------------------------------------------------------------------------
// Playback (SPEC section 23)
// ---------------------------------------------------------------------------

/** DiffPlayback's mode: a text mode, anything else falls back to 'words'. */
export function playbackMode(mode: unknown): TextMode {
  return (TEXT_MODES as readonly unknown[]).includes(mode) ? (mode as TextMode) : 'words';
}

/** The inner div's style, or undefined when speed is absent/invalid. */
export function playbackStyle(speed: unknown): string | undefined {
  const ms = playbackStep(speed);
  return ms === null ? undefined : `--text-diff-playback-step:${ms}ms`;
}
