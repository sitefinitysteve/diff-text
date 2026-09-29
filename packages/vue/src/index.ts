import DiffChars from './components/DiffChars.vue';
import DiffWords from './components/DiffWords.vue';
import DiffWordsWithSpace from './components/DiffWordsWithSpace.vue';
import DiffLines from './components/DiffLines.vue';
import DiffSentences from './components/DiffSentences.vue';
import DiffHtml from './components/DiffHtml.vue';
import DiffUnified from './components/DiffUnified.vue';
import DiffSplit from './components/DiffSplit.vue';
import DiffStats from './components/DiffStats.vue';
import DiffHeatmap from './components/DiffHeatmap.vue';
import DiffTimeline from './components/DiffTimeline.vue';
import DiffPlayback from './components/DiffPlayback.vue';

// Export all components
export {
  DiffChars,
  DiffWords,
  DiffWordsWithSpace,
  DiffLines,
  DiffSentences,
  DiffHtml,
  DiffUnified,
  DiffSplit,
  DiffStats,
  DiffHeatmap,
  DiffTimeline,
  DiffPlayback,
};

// For backward compatibility, export DiffWordsWithSpace as TextDiff
export { DiffWordsWithSpace as TextDiff };

// Pure functions from the shared core (bundled; no extra dependency)
export {
  computeDiff,
  diffHtml,
  computeSimilarity,
  buildHunks,
  buildSplitRows,
  computeStats,
  lineStats,
  normalizeQuotes,
  stripFormattingTags,
} from '@diff-text/core';

export type {
  Change,
  TextMode,
  DiffOptions,
  LineOptions,
  LineRow,
  Hunk,
  VisibleHunk,
  CollapsedHunk,
  SplitCell,
  SplitRow,
  SplitHunk,
  VisibleSplitHunk,
  DiffStats as DiffStatsResult,
  HtmlDiffOptions,
  HtmlDiffResult,
  HeatmapOptions,
  MoveBlock,
} from '@diff-text/core';

export type {
  DiffNavigation,
  DiffHtmlOptions,
  LineViewOptions,
  MoveOptions,
  StatsMode,
  TimelineMode,
  TimelineViewOptions,
} from './model';
