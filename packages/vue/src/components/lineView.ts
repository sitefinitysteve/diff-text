import { computed, ref, watch } from 'vue';
import type { PropType } from 'vue';
import type { LineRow, SplitRow } from '@diff-text/core';
import {
  anchorId,
  expandItems,
  fromKey,
  minimapLinks,
  moveLink,
  splitModel,
  splitRowsOf,
  stableKey,
  unifiedModel,
  unifiedRowsOf,
} from '../model';
import type { LineViewModel, LineViewOptions, MoveOptions, RowItem } from '../model';
import { useIdPrefix } from '../useIdPrefix';
import { useNavigation } from '../useNavigation';

/** Props shared by DiffUnified and DiffSplit. */
export const lineViewProps = {
  oldText: {
    type: String,
    required: true as const,
  },
  newText: {
    type: String,
    required: true as const,
  },
  /** Unchanged lines shown around each change. Default 3. */
  contextLines: {
    type: Number,
    default: 3,
  },
  /** ignoreCase, ignoreWhitespace, stripTrailingCr. */
  options: {
    type: Object as PropType<LineViewOptions>,
    default: () => ({}),
  },
  /** Detect moved blocks of lines (SPEC section 19). Default false. */
  detectMoves: {
    type: Boolean,
    default: false,
  },
  /** Minimum lines in a moved block. Default 1. */
  minMoveLines: {
    type: Number,
    default: undefined,
  },
  /** Near-match threshold for moved lines, strictly between 0 and 1. Default: exact matches only. */
  moveSimilarity: {
    type: Number,
    default: undefined,
  },
  /** Put id="{idPrefix}-change-N" on the first row of every change. Default false. */
  anchors: {
    type: Boolean,
    default: false,
  },
  /** Prefix for emitted ids (anchors, move links). Default: unique per instance. */
  idPrefix: {
    type: String,
    default: undefined,
  },
  /** Show a change minimap strip next to the diff (implies anchors). Default false. */
  minimap: {
    type: Boolean,
    default: false,
  },
};

interface LineViewPropValues {
  oldText: string;
  newText: string;
  contextLines: number;
  options: LineViewOptions;
  detectMoves: boolean;
  minMoveLines?: number;
  moveSimilarity?: number;
  anchors: boolean;
  idPrefix?: string;
  minimap: boolean;
}

/** State, expansion and navigation of DiffUnified ('unified') or DiffSplit ('split'). */
export function useLineView<R extends LineRow | SplitRow>(kind: 'unified' | 'split', props: LineViewPropValues) {
  const optionsKey = computed(() => stableKey(props.options));
  const movesKey = computed(() =>
    stableKey({ detectMoves: props.detectMoves, minMoveLines: props.minMoveLines, moveSimilarity: props.moveSimilarity }),
  );
  const model = computed(() => {
    const options = fromKey<LineViewOptions>(optionsKey.value);
    const moves = fromKey<MoveOptions>(movesKey.value);
    return (kind === 'unified'
      ? unifiedModel(props.oldText, props.newText, props.contextLines, options, moves)
      : splitModel(props.oldText, props.newText, props.contextLines, options, moves)) as LineViewModel<R>;
  });
  // UI state is keyed on content, not on the model object: an equal options object from
  // an unrelated parent re-render keeps expanded blocks and the current change.
  const content = [() => props.oldText, () => props.newText, () => props.contextLines, optionsKey, movesKey, () => props.minimap];

  // Indices of collapsed blocks the user expanded.
  const expanded = ref<number[]>([]);
  watch(content, () => {
    expanded.value = [];
  });
  const toRows = (kind === 'unified' ? unifiedRowsOf : splitRowsOf) as (rows: LineRow[]) => R[];
  const items = computed(() => expandItems(model.value, new Set(expanded.value), toRows));
  function expand(block: number) {
    if (!expanded.value.includes(block)) expanded.value = [...expanded.value, block];
  }

  const prefix = useIdPrefix(() => props.idPrefix);
  const anchors = computed(() => props.anchors || props.minimap);
  const links = computed(() => (props.minimap ? minimapLinks(model.value.marks(), prefix.value) : []));
  const idOf = (index: number | null) => anchorId(anchors.value, prefix.value, index);
  const linkOf = (row: { type: string; move?: number; counterpart?: number } | undefined, item: RowItem<R>) =>
    row ? moveLink(row, item.firstOfMove, prefix.value) : null;

  const { root, exposed } = useNavigation(
    computed(() => model.value.count),
    content,
  );
  return { root, model, items, expand, links, idOf, linkOf, exposed };
}
