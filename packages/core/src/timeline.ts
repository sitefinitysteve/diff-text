/**
 * Revision timeline (SPEC section 22): diffs of each consecutive pair of versions,
 * rendered as a CSS-only step switcher (radio inputs + labels + panels).
 */
import { computeDiff, TEXT_MODES } from './computeDiff';
import { buildHunks, buildSplitRows } from './lines';
import { escapeHtml, idPrefixOf, renderSplit, renderStats, renderText, renderUnified } from './render';
import { computeSimilarity } from './similarity';
import { computeStats, lineStats } from './stats';
import type { Change, DiffOptions, DiffStats, Hunk, LineOptions, RenderOptions, SplitHunk, TextMode } from './types';

export type TimelineMode = TextMode | 'unified' | 'split';

export interface TimelineOptions extends DiffOptions, LineOptions {
  /** Diff mode for every step. Default "words". */
  mode?: TimelineMode;
  /** Version labels; missing entries default to "v1", "v2", ... */
  labels?: string[];
}

export interface TimelineStep {
  /** 1-based step number K (versions K-1 → K in 0-based terms). */
  step: number;
  fromLabel: string;
  toLabel: string;
  stats: DiffStats;
  similarity: number;
  /** Text modes. */
  changes?: Change[];
  /** unified / split. */
  hunks?: Hunk[] | SplitHunk[];
}

export interface Timeline {
  mode: TimelineMode;
  labels: string[];
  steps: TimelineStep[];
}

/** Arrow between version labels (U+2192). */
export const ARROW = '→';

function modeOf(mode: unknown): TimelineMode {
  if (mode === 'unified' || mode === 'split') return mode;
  return (TEXT_MODES as readonly unknown[]).includes(mode) ? (mode as TextMode) : 'words';
}

export function buildTimeline(versions: string[], options: TimelineOptions = {}): Timeline {
  const mode = modeOf(options.mode);
  const labels = versions.map((_, i) => {
    const l = options.labels?.[i];
    return typeof l === 'string' ? l : `v${i + 1}`;
  });
  const steps: TimelineStep[] = [];
  for (let k = 1; k < versions.length; k++) {
    const a = versions[k - 1]!;
    const b = versions[k]!;
    const step: TimelineStep = {
      step: k,
      fromLabel: labels[k - 1]!,
      toLabel: labels[k]!,
      stats: { added: 0, removed: 0, unchanged: 0, unit: 'codepoints' },
      similarity: computeSimilarity(a, b, { html: false }),
    };
    if (mode === 'unified' || mode === 'split') {
      const hunks = mode === 'unified' ? buildHunks(a, b, options) : buildSplitRows(a, b, options);
      step.hunks = hunks;
      step.stats = lineStats(hunks);
    } else {
      const changes = computeDiff(mode, a, b, options);
      step.changes = changes;
      step.stats = computeStats(changes);
    }
    steps.push(step);
  }
  return { mode, labels, steps };
}

function stepDiff(timeline: Timeline, step: TimelineStep, inner: RenderOptions): string {
  if (timeline.mode === 'unified') return renderUnified(step.hunks as Hunk[], inner);
  if (timeline.mode === 'split') return renderSplit(step.hunks as SplitHunk[], inner);
  return renderText(timeline.mode, step.changes ?? [], inner);
}

/**
 * CSS-only timeline: per step an <input type="radio">, its <label>, and its panel,
 * in that order; the last step is checked. Each panel's diff is rendered with the
 * id prefix "{idPrefix}-rev-K" so ids never collide across panels.
 */
export function renderTimeline(timeline: Timeline, options: RenderOptions = {}): string {
  const raw = idPrefixOf(options);
  const p = escapeHtml(raw);
  let out = '<div class="text-diff-timeline" role="group" aria-label="Revision timeline">';
  if (timeline.steps.length === 0) return out + '<div class="diff-empty">Nothing to compare</div></div>';
  const last = timeline.steps.length;
  for (const step of timeline.steps) {
    const k = step.step;
    const caption = `${escapeHtml(step.fromLabel)} ${ARROW} ${escapeHtml(step.toLabel)}`;
    const inner: RenderOptions = { idPrefix: `${raw}-rev-${k}`, anchors: options.anchors === true };
    out +=
      `<input class="diff-rev-input" type="radio" name="${p}-rev" id="${p}-rev-${k}"${k === last ? ' checked' : ''}>` +
      `<label class="diff-rev-label" for="${p}-rev-${k}">${caption}</label>` +
      `<div class="diff-rev-panel" role="group" aria-label="${caption}">` +
      `<div class="diff-rev-caption">${caption}</div>` +
      renderStats(step.stats, step.similarity) +
      stepDiff(timeline, step, inner) +
      '</div>';
  }
  return out + '</div>';
}
