import { forwardRef } from 'react';
import { collapsedLabel } from '@diff-text/core';
import type { LineRow } from '@diff-text/core';
import { rowClass, rowMove, signFor, unifiedAriaLabel } from '../model';
import type { DiffNavigation, LineViewOptions, MoveOptions } from '../model';
import { framed } from './MinimapFrame';
import { MoveLinkView } from './MoveLinkView';
import { useLineView } from './useLineView';
import type { BaseDiffProps, IdProps } from './types';

export interface DiffUnifiedProps extends BaseDiffProps<LineViewOptions>, MoveOptions, IdProps {
  /** Unchanged lines shown around each change. Default 3. */
  contextLines?: number;
  /** Show a change minimap strip next to the diff (implies anchors). Default false. */
  minimap?: boolean;
}

const DEFAULT_OPTIONS: LineViewOptions = {};

/** Unified line view with old/new gutters, expandable "N unchanged lines" rows and optional moved blocks. */
const DiffUnified = forwardRef<DiffNavigation, DiffUnifiedProps>(function DiffUnified(
  {
    oldText,
    newText,
    contextLines = 3,
    options = DEFAULT_OPTIONS,
    detectMoves = false,
    minMoveLines,
    moveSimilarity,
    anchors = false,
    idPrefix,
    minimap = false,
    className,
    ...rest
  },
  ref,
) {
  const { rootRef, model, items, expand, links, idOf, linkOf } = useLineView<LineRow>('unified', ref, {
    oldText,
    newText,
    contextLines,
    options,
    detectMoves,
    minMoveLines,
    moveSimilarity,
    anchors,
    idPrefix,
    minimap,
  });

  return framed(minimap, links, 'text-diff text-diff-unified', className, rest, (props) => (
    <div {...props} ref={rootRef}>
      {!model.hasChanges ? (
        <div className="diff-empty">No changes</div>
      ) : (
        items.map((item) =>
          item.kind === 'collapsed' ? (
            <button key={item.key} type="button" className="diff-row diff-row-collapsed" onClick={() => expand(item.block)}>
              {collapsedLabel(item.count)}
            </button>
          ) : (
            <div
              key={item.key}
              id={idOf(item.changeIndex)}
              className={rowClass(item.row)}
              role={item.row.type === 'equal' ? undefined : 'group'}
              aria-label={unifiedAriaLabel(item.row)}
              data-move={rowMove(item.row)}
              data-change-index={item.changeIndex ?? undefined}
            >
              <span className="diff-gutter diff-gutter-old">{item.row.oldNo ?? ''}</span>
              <span className="diff-gutter diff-gutter-new">{item.row.newNo ?? ''}</span>
              <span className="diff-sign" aria-hidden="true">
                {signFor(item.row.type)}
              </span>
              <span className="diff-line">{item.row.text}</span>
              <MoveLinkView link={linkOf(item.row, item)} />
            </div>
          ),
        )
      )}
    </div>
  ));
});

export default DiffUnified;
