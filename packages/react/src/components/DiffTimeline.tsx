import { Fragment, useMemo } from 'react';
import type { HTMLAttributes } from 'react';
import type { TextMode } from '@diff-text/core';
import { lineViewProps, timelineModel } from '../model';
import type { TimelineMode, TimelineViewOptions } from '../model';
import { useIdPrefix, useStableOptions } from '../useIdPrefix';
import DiffChars from './DiffChars';
import DiffLines from './DiffLines';
import DiffSentences from './DiffSentences';
import DiffSplit from './DiffSplit';
import DiffStats from './DiffStats';
import DiffUnified from './DiffUnified';
import DiffWords from './DiffWords';
import DiffWordsWithSpace from './DiffWordsWithSpace';
import type { TextDiffComponent } from './createTextDiff';
import { containerClass, type IdProps } from './types';

export interface DiffTimelineProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'dangerouslySetInnerHTML'>, IdProps {
  /** The versions, oldest first. Each step diffs versions[K-1] → versions[K]. */
  versions: string[];
  /** Version labels; missing entries default to "v1", "v2", ... */
  labels?: string[];
  /** A text mode, 'unified' or 'split'. Default 'words'. */
  mode?: TimelineMode;
  /** Options for every step's diff (text-mode options, or line-view options incl. contextLines and moves). */
  options?: TimelineViewOptions;
}

const TEXT_COMPONENTS: Record<TextMode, TextDiffComponent> = {
  chars: DiffChars,
  words: DiffWords,
  wordsWithSpace: DiffWordsWithSpace,
  lines: DiffLines,
  sentences: DiffSentences,
};

const DEFAULT_OPTIONS: TimelineViewOptions = {};

/** Revision timeline (SPEC section 22): one CSS-only tab (radio + label + panel) per consecutive pair of versions. */
export default function DiffTimeline({
  versions,
  labels,
  mode = 'words',
  options = DEFAULT_OPTIONS,
  anchors = false,
  idPrefix,
  className,
  ...rest
}: DiffTimelineProps) {
  const model = useMemo(() => timelineModel(versions, labels, mode), [versions, labels, mode]);
  const [stableOptions] = useStableOptions(options);
  const line = useMemo(() => lineViewProps(stableOptions), [stableOptions]);
  const prefix = useIdPrefix(idPrefix);
  const last = model.steps.length;

  return (
    <div {...rest} className={containerClass('text-diff-timeline', className)} role="group" aria-label="Revision timeline">
      {last === 0 && <div className="diff-empty">Nothing to compare</div>}
      {model.steps.map((step) => {
        const inner = `${prefix}-rev-${step.step}`;
        const texts = { oldText: step.oldText, newText: step.newText };
        let diff;
        if (model.mode === 'unified' || model.mode === 'split') {
          const View = model.mode === 'unified' ? DiffUnified : DiffSplit;
          diff = (
            <View {...texts} contextLines={line.contextLines} options={line.options} {...line.moves} anchors={anchors} idPrefix={inner} />
          );
        } else {
          const View = TEXT_COMPONENTS[model.mode];
          diff = <View {...texts} options={stableOptions} anchors={anchors} idPrefix={inner} />;
        }
        return (
          <Fragment key={step.step}>
            <input className="diff-rev-input" type="radio" name={`${prefix}-rev`} id={inner} defaultChecked={step.step === last} />
            <label className="diff-rev-label" htmlFor={inner}>
              {step.caption}
            </label>
            <div className="diff-rev-panel" role="group" aria-label={step.caption}>
              <div className="diff-rev-caption">{step.caption}</div>
              <DiffStats {...texts} mode={model.mode} options={stableOptions} />
              {diff}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
