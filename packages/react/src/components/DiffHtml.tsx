import { forwardRef, useMemo } from 'react';
import { diffHtml } from '@diff-text/core';
import { countHtmlChanges } from '../model';
import type { DiffHtmlOptions, DiffNavigation } from '../model';
import { useStableOptions } from '../useIdPrefix';
import { useNavigation } from '../useNavigation';
import { containerClass, type BaseDiffProps } from './types';

export interface DiffHtmlProps extends BaseDiffProps<DiffHtmlOptions> {
  /**
   * Number between 0 and 1. When set and the text similarity falls below it,
   * the diff renders as a full replacement (old removed, new added).
   * Default: `null` (disabled).
   */
  similarityThreshold?: number | null;
  /**
   * Strip inline formatting tags (`<strong>`, `<em>`, `<b>`, `<i>`, `<u>`,
   * `<s>`, `<mark>`, `<sub>`, `<sup>`) before diffing. Default: `true`.
   */
  ignoreFormattingTags?: boolean;
}

const DEFAULT_OPTIONS: DiffHtmlOptions = {};

/**
 * HTML diff. Output is injected with `dangerouslySetInnerHTML` (the React
 * equivalent of Vue's `v-html`), so `oldText` and `newText` must be trusted
 * or sanitized by the caller before they are passed in.
 */
const DiffHtml = forwardRef<DiffNavigation, DiffHtmlProps>(function DiffHtml(
  { oldText, newText, options = DEFAULT_OPTIONS, similarityThreshold = null, ignoreFormattingTags = true, className, ...rest },
  ref,
) {
  const [stableOptions, optionsKey] = useStableOptions(options);
  const result = useMemo(
    () => diffHtml(oldText, newText, { ...stableOptions, similarityThreshold, ignoreFormattingTags }),
    [oldText, newText, stableOptions, similarityThreshold, ignoreFormattingTags],
  );
  const rootRef = useNavigation(ref, countHtmlChanges(result.html), [
    oldText,
    newText,
    optionsKey,
    similarityThreshold,
    ignoreFormattingTags,
  ]);

  return (
    <div
      {...rest}
      ref={rootRef}
      className={containerClass('text-diff text-diff-html', className)}
      dangerouslySetInnerHTML={{ __html: result.html }}
    />
  );
});

export default DiffHtml;
