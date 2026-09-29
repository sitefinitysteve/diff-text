import { forwardRef } from 'react';
import { collapsedLabel } from '@diff-text/core';
import type { SplitCell, SplitRow } from '@diff-text/core';
import { cellAriaLabel, cellClass, nonEmptyParts, partKind, rowClass, rowMove, signFor } from '../model';
import type { DiffNavigation, LineViewOptions, MoveLink, MoveOptions } from '../model';
import { framed } from './MinimapFrame';
import { MoveLinkView } from './MoveLinkView';
import { useLineView } from './useLineView';
import type { BaseDiffProps, IdProps } from './types';

export interface DiffSplitProps extends BaseDiffProps<LineViewOptions>, MoveOptions, IdProps {
  /** Unchanged lines shown around each change. Default 3. */
  contextLines?: number;
  /** Show a change minimap strip next to the diff (implies anchors). Default false. */
  minimap?: boolean;
}

const DEFAULT_OPTIONS: LineViewOptions = {};

function Cell({ side, cell, link }: { side: 'old' | 'new'; cell: SplitCell | undefined; link: MoveLink | null }) {
  if (!cell) return <div className={cellClass(side, cell)} />;
  return (
    <div
      className={cellClass(side, cell)}
      role={cell.type === 'equal' ? undefined : 'group'}
      aria-label={cellAriaLabel(cell)}
    >
      <span className="diff-gutter">{cell.lineNo}</span>
      <span className="diff-sign" aria-hidden="true">
        {signFor(cell.type)}
      </span>
      <span className="diff-line">
        {cell.parts
          ? nonEmptyParts(cell.parts).map((part, index) => {
              const kind = partKind(part);
              return kind === 'equal' ? (
                <span key={index}>{part.value}</span>
              ) : (
                <span key={index} className={`diff-${kind}`}>
                  {part.value}
                </span>
              );
            })
          : cell.text}
      </span>
      <MoveLinkView link={link} />
    </div>
  );
}

/** Side-by-side line view with intra-line word highlights, expandable "N unchanged lines" rows and optional moved blocks. */
const DiffSplit = forwardRef<DiffNavigation, DiffSplitProps>(function DiffSplit(
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
  const { rootRef, model, items, expand, links, idOf, linkOf } = useLineView<SplitRow>('split', ref, {
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

  return framed(minimap, links, 'text-diff text-diff-split', className, rest, (props) => (
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
              data-move={rowMove(item.row)}
              data-change-index={item.changeIndex ?? undefined}
            >
              <Cell side="old" cell={item.row.left} link={linkOf(item.row.left, item)} />
              <Cell side="new" cell={item.row.right} link={linkOf(item.row.right, item)} />
            </div>
          ),
        )
      )}
    </div>
  ));
});

export default DiffSplit;
