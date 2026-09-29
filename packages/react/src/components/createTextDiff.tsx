import { forwardRef, useMemo } from 'react';
import type { ForwardRefExoticComponent, RefAttributes } from 'react';
import { modeClass } from '@diff-text/core';
import type { DiffOptions, TextMode } from '@diff-text/core';
import { anchorId, minimapLinks, textMarks, textModel } from '../model';
import type { DiffNavigation } from '../model';
import { useIdPrefix, useStableOptions } from '../useIdPrefix';
import { useNavigation } from '../useNavigation';
import { framed } from './MinimapFrame';
import type { BaseDiffProps, IdProps } from './types';

/** Props of the text-mode components (DiffChars, DiffWords, ...). */
export interface TextDiffProps extends BaseDiffProps<DiffOptions>, IdProps {
  /** Show a change minimap strip next to the diff (implies anchors). Default false. */
  minimap?: boolean;
}

/** Type of the text-mode components; the ref exposes next() / prev() / goTo() / count. */
export type TextDiffComponent = ForwardRefExoticComponent<TextDiffProps & RefAttributes<DiffNavigation>>;

const DEFAULT_OPTIONS: DiffOptions = {};

/** Builds one text-mode component: one span per change, changes numbered with data-change-index. */
export function createTextDiff(mode: TextMode, displayName: string): TextDiffComponent {
  const Component = forwardRef<DiffNavigation, TextDiffProps>(function TextDiff(
    { oldText, newText, options = DEFAULT_OPTIONS, anchors = false, idPrefix, minimap = false, className, ...rest },
    ref,
  ) {
    const [stableOptions, optionsKey] = useStableOptions(options);
    const model = useMemo(() => textModel(mode, oldText, newText, stableOptions), [oldText, newText, stableOptions]);
    const rootRef = useNavigation(ref, model.count, [oldText, newText, optionsKey, minimap]);
    const prefix = useIdPrefix(idPrefix);
    const withIds = anchors || minimap;
    const links = useMemo(() => (minimap ? minimapLinks(textMarks(model), prefix) : []), [minimap, model, prefix]);

    return framed(minimap, links, `text-diff ${modeClass(mode)}`, className, rest, (props) => (
      <div {...props} ref={rootRef}>
        {model.parts.map((part, index) =>
          part.changeIndex === null ? (
            <span key={index}>{part.value}</span>
          ) : (
            <span
              key={index}
              id={anchorId(withIds, prefix, part.changeIndex)}
              className={`diff-${part.kind}`}
              data-change-index={part.changeIndex}
            >
              {part.value}
            </span>
          ),
        )}
      </div>
    ));
  });
  Component.displayName = displayName;
  return Component;
}
