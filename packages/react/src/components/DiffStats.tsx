import { useMemo } from 'react';
import type { HTMLAttributes } from 'react';
import { computeSimilarity, similarityPercent } from '@diff-text/core';
import type { DiffOptions, LineOptions } from '@diff-text/core';
import { statItems, statsFor } from '../model';
import type { StatsMode } from '../model';
import { useStableOptions } from '../useIdPrefix';
import { containerClass } from './types';

export interface DiffStatsProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'dangerouslySetInnerHTML'> {
  oldText: string;
  newText: string;
  /** A text mode (counts code points) or 'unified' / 'split' (counts lines). Default 'words'. */
  mode?: StatsMode;
  /** Show the "N% similar" badge. Default true. */
  showSimilarity?: boolean;
  /** Options for the underlying diff (text-mode options, or line-view options incl. contextLines). */
  options?: DiffOptions & LineOptions;
}

const DEFAULT_OPTIONS: DiffOptions & LineOptions = {};

/** Badge with added / removed / unchanged counts and, optionally, the similarity. */
export default function DiffStats({
  oldText,
  newText,
  mode = 'words',
  showSimilarity = true,
  options = DEFAULT_OPTIONS,
  className,
  ...rest
}: DiffStatsProps) {
  const [stableOptions] = useStableOptions(options);
  const stats = useMemo(() => statsFor(mode, oldText, newText, stableOptions), [mode, oldText, newText, stableOptions]);
  const similarity = useMemo(
    () => (showSimilarity ? computeSimilarity(oldText, newText, { html: false }) : null),
    [showSimilarity, oldText, newText],
  );

  return (
    <div {...rest} className={containerClass('text-diff-stats', className)} data-unit={stats.unit}>
      {statItems(stats).map((item) => (
        <span key={item.kind} className={`diff-stat diff-stat-${item.kind}`}>
          <span aria-hidden="true">{item.visible}</span>
          <span className="diff-sr">{item.label}</span>
        </span>
      ))}
      {similarity !== null && (
        <span className="diff-stat diff-stat-similarity">{similarityPercent(similarity)}% similar</span>
      )}
    </div>
  );
}
