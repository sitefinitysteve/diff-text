import DiffChars from './components/DiffChars';
import DiffWords from './components/DiffWords';
import DiffWordsWithSpace from './components/DiffWordsWithSpace';
import DiffLines from './components/DiffLines';
import DiffSentences from './components/DiffSentences';
import DiffHtml from './components/DiffHtml';
import DiffUnified from './components/DiffUnified';
import DiffSplit from './components/DiffSplit';
import DiffStats from './components/DiffStats';
import DiffHeatmap from './components/DiffHeatmap';
import DiffTimeline from './components/DiffTimeline';
import DiffPlayback from './components/DiffPlayback';

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

export type { BaseDiffProps } from './components/types';
export type { TextDiffProps, TextDiffComponent } from './components/createTextDiff';
export type { DiffCharsProps } from './components/DiffChars';
export type { DiffWordsProps } from './components/DiffWords';
export type { DiffWordsWithSpaceProps } from './components/DiffWordsWithSpace';
export type { DiffLinesProps } from './components/DiffLines';
export type { DiffSentencesProps } from './components/DiffSentences';
export type { DiffHtmlProps } from './components/DiffHtml';
export type { DiffUnifiedProps } from './components/DiffUnified';
export type { DiffSplitProps } from './components/DiffSplit';
export type { DiffStatsProps } from './components/DiffStats';
export type { DiffHeatmapProps } from './components/DiffHeatmap';
export type { DiffTimelineProps } from './components/DiffTimeline';
export type { DiffPlaybackProps } from './components/DiffPlayback';
export type { IdProps } from './components/types';
