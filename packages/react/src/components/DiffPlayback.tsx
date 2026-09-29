import { forwardRef, useMemo } from 'react';
import { modeClass } from '@diff-text/core';
import type { DiffOptions, TextMode } from '@diff-text/core';
import { anchorId, playbackMode, playbackStyle, textModel } from '../model';
import type { DiffNavigation } from '../model';
import { useIdPrefix, useStableOptions } from '../useIdPrefix';
import { useNavigation } from '../useNavigation';
import { styleObject } from './MinimapFrame';
import { containerClass, type BaseDiffProps, type IdProps } from './types';

export interface DiffPlaybackProps extends BaseDiffProps<DiffOptions>, IdProps {
  /** A text mode. Default 'words'. */
  mode?: TextMode;
  /** Milliseconds between consecutive changes (overrides --text-diff-playback-step). */
  speed?: number;
}

const DEFAULT_OPTIONS: DiffOptions = {};

/** Animated playback (SPEC section 23): the changes appear one after another, CSS only, with a Replay toggle. */
const DiffPlayback = forwardRef<DiffNavigation, DiffPlaybackProps>(function DiffPlayback(
  { oldText, newText, mode = 'words', speed, options = DEFAULT_OPTIONS, anchors = false, idPrefix, className, ...rest },
  ref,
) {
  const textMode = playbackMode(mode);
  const [stableOptions, optionsKey] = useStableOptions(options);
  const model = useMemo(
    () => textModel(textMode, oldText, newText, stableOptions),
    [textMode, oldText, newText, stableOptions],
  );
  const rootRef = useNavigation(ref, model.count, [oldText, newText, textMode, optionsKey]);
  const prefix = useIdPrefix(idPrefix);

  return (
    <div {...rest} className={containerClass('text-diff-playback-wrap', className)}>
      <input className="diff-replay-input" type="checkbox" id={`${prefix}-replay`} />
      <label className="diff-replay" htmlFor={`${prefix}-replay`}>
        Replay
      </label>
      <div ref={rootRef} className={`text-diff ${modeClass(textMode)} text-diff-playback`} style={styleObject(playbackStyle(speed))}>
        {model.parts.map((part, index) =>
          part.changeIndex === null ? (
            <span key={index}>{part.value}</span>
          ) : (
            <span
              key={index}
              id={anchorId(anchors, prefix, part.changeIndex)}
              className={`diff-${part.kind}`}
              data-change-index={part.changeIndex}
              style={styleObject(`--td-i:${part.changeIndex}`)}
            >
              {part.value}
            </span>
          ),
        )}
      </div>
    </div>
  );
});

export default DiffPlayback;
