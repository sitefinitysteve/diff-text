import { forwardRef, useMemo } from 'react';
import type { HeatmapOptions } from '@diff-text/core';
import { anchorId, heatmapModel } from '../model';
import type { DiffNavigation } from '../model';
import { useIdPrefix, useStableOptions } from '../useIdPrefix';
import { useNavigation } from '../useNavigation';
import { containerClass, type BaseDiffProps, type IdProps } from './types';

export interface DiffHeatmapProps extends BaseDiffProps<HeatmapOptions>, IdProps {
  /** Show removed old sentences inline. Default true. */
  showRemoved?: boolean;
  /** Show the legend. Default true. */
  legend?: boolean;
}

const DEFAULT_OPTIONS: HeatmapOptions = {};

/** Rewrite heatmap (SPEC section 20): each sentence of the new text shaded by how much it changed. */
const DiffHeatmap = forwardRef<DiffNavigation, DiffHeatmapProps>(function DiffHeatmap(
  {
    oldText,
    newText,
    options = DEFAULT_OPTIONS,
    showRemoved = true,
    legend = true,
    anchors = false,
    idPrefix,
    className,
    ...rest
  },
  ref,
) {
  const [stableOptions, optionsKey] = useStableOptions(options);
  const model = useMemo(
    () => heatmapModel(oldText, newText, stableOptions, showRemoved),
    [oldText, newText, stableOptions, showRemoved],
  );
  const rootRef = useNavigation(ref, model.count, [oldText, newText, optionsKey, showRemoved]);
  const prefix = useIdPrefix(idPrefix);
  const idOf = (index: number | null) => anchorId(anchors, prefix, index);

  return (
    <div {...rest} ref={rootRef} className={containerClass('text-diff text-diff-heatmap', className)}>
      <div className="diff-heat-text">
        {model.items.map((item, index) => {
          if (item.kind === 'gap') return <span key={index}>{item.text}</span>;
          if (item.kind === 'removed') {
            return (
              <span
                key={index}
                id={idOf(item.changeIndex)}
                className="diff-heat-removed"
                data-change-index={item.changeIndex ?? undefined}
                title={item.label}
              >
                <span className="diff-sr">removed sentence: </span>
                {item.text}
              </span>
            );
          }
          if (item.changeIndex === null) {
            return (
              <span key={index} className="diff-heat" data-heat="0">
                {item.text}
              </span>
            );
          }
          return (
            <span
              key={index}
              id={idOf(item.changeIndex)}
              className="diff-heat"
              data-heat={item.heat}
              data-change-index={item.changeIndex}
              title={item.label}
            >
              {item.text}
              <span className="diff-sr">{` (${item.label})`}</span>
            </span>
          );
        })}
      </div>
      {legend && (
        <ul className="diff-heat-legend" aria-label="Heat legend">
          {model.legend.map((key) => (
            <li key={key.key} className={key.className} data-heat={key.heat}>
              <span className="diff-heat-swatch" aria-hidden="true" />
              {key.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});

export default DiffHeatmap;
