export * from './types';
export { normalizeQuotes, stripFormattingTags, codePointLength } from './normalize';
export {
  computeSimilarity,
  prepareForSimilarity,
  similarityFromChanges,
  nonWhitespaceLength,
} from './similarity';
export type { SimilarityOptions } from './similarity';
export { computeDiff, cleanChanges, pickOptions, tokenize, tokenCount, wellFormed, TEXT_MODES } from './computeDiff';
export { diffHtml, DEFAULT_ORPHAN_MATCH_THRESHOLD } from './html';
export {
  buildRows,
  buildLineRows,
  buildHunks,
  buildSplitRows,
  pairRows,
  intraLineDiff,
  splitParts,
  splitLines,
  DEFAULT_CONTEXT_LINES,
  INTRALINE_MAX_LENGTH,
  INTRALINE_MIN_SIMILARITY,
} from './lines';
export { computeStats, lineStats } from './stats';
export {
  renderText,
  renderTextSpans,
  renderUnified,
  renderSplit,
  renderStats,
  renderHtmlDiff,
  escapeHtml,
  collapsedLabel,
  similarityPercent,
  modeClass,
  moveLabel,
  idPrefixOf,
  DEFAULT_ID_PREFIX,
  MINUS,
} from './render';
export {
  buildMoves,
  applyMoves,
  normalizeMoveLine,
  MOVE_MAX_PAIRS,
  MOVE_MAX_NEAR_PAIRS,
  MOVE_COLORS,
} from './moves';
export {
  buildHeatmap,
  renderHeatmap,
  heatLevel,
  heatLabel,
  changedPercent,
  HEAT_MATCH_THRESHOLD,
  HEAT_MAX_SENTENCES,
  HEAT_LABELS,
} from './heatmap';
export type {
  Heatmap,
  HeatmapOptions,
  HeatmapRenderOptions,
  HeatSegment,
  HeatSentence,
  HeatGap,
  HeatRemoved,
  HeatLevel,
  HeatStatus,
} from './heatmap';
export {
  minimapMarksText,
  minimapMarksLines,
  renderMinimap,
  renderWithMinimap,
  hundredths,
  formatPercent,
} from './minimap';
export type { MinimapMark, MinimapKind } from './minimap';
export { buildTimeline, renderTimeline, ARROW } from './timeline';
export type { Timeline, TimelineStep, TimelineOptions, TimelineMode } from './timeline';
export { renderPlayback, playbackStep } from './playback';
export type { PlaybackOptions } from './playback';
