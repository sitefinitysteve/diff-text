import { useMemo } from 'react';
import type { ForwardedRef } from 'react';
import type { LineRow, SplitRow } from '@diff-text/core';
import {
  anchorId,
  expandItems,
  minimapLinks,
  moveLink,
  splitModel,
  splitRowsOf,
  unifiedModel,
  unifiedRowsOf,
} from '../model';
import type { DiffNavigation, LineViewModel, LineViewOptions, MoveOptions, RowItem } from '../model';
import { useIdPrefix, useStableOptions } from '../useIdPrefix';
import { useNavigation } from '../useNavigation';
import { useExpanded } from './useExpanded';

export interface LineViewInput extends MoveOptions {
  oldText: string;
  newText: string;
  contextLines: number;
  options: LineViewOptions;
  anchors: boolean;
  idPrefix: string | undefined;
  minimap: boolean;
}

/** State, expansion and navigation of DiffUnified ('unified') or DiffSplit ('split'). */
export function useLineView<R extends LineRow | SplitRow>(
  kind: 'unified' | 'split',
  ref: ForwardedRef<DiffNavigation>,
  input: LineViewInput,
) {
  const { oldText, newText, contextLines, anchors, idPrefix, minimap } = input;
  const [options, optionsKey] = useStableOptions(input.options);
  const [moves, movesKey] = useStableOptions<MoveOptions>({
    detectMoves: input.detectMoves,
    minMoveLines: input.minMoveLines,
    moveSimilarity: input.moveSimilarity,
  });
  const model = useMemo(
    () =>
      (kind === 'unified'
        ? unifiedModel(oldText, newText, contextLines, options, moves)
        : splitModel(oldText, newText, contextLines, options, moves)) as LineViewModel<R>,
    [kind, oldText, newText, contextLines, options, moves],
  );
  // UI state is keyed on content, not on the model object: an equal options object from
  // an unrelated parent re-render keeps expanded blocks and the current change.
  const content = [oldText, newText, contextLines, optionsKey, movesKey, minimap];
  const rootRef = useNavigation(ref, model.count, content);
  const { expanded, expand } = useExpanded(content);
  const items = useMemo(
    () => expandItems(model, expanded, (kind === 'unified' ? unifiedRowsOf : splitRowsOf) as (rows: LineRow[]) => R[]),
    [kind, model, expanded],
  );

  const prefix = useIdPrefix(idPrefix);
  const withIds = anchors || minimap;
  const links = useMemo(() => (minimap ? minimapLinks(model.marks(), prefix) : []), [minimap, model, prefix]);
  const idOf = (index: number | null) => anchorId(withIds, prefix, index);
  const linkOf = (row: { type: string; move?: number; counterpart?: number } | undefined, item: RowItem<R>) =>
    row ? moveLink(row, item.firstOfMove, prefix) : null;

  return { rootRef, model, items, expand, links, idOf, linkOf };
}
