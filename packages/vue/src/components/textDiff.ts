import { computed } from 'vue';
import type { PropType } from 'vue';
import type { DiffOptions, TextMode } from '@diff-text/core';
import { anchorId, fromKey, minimapLinks, stableKey, textMarks, textModel } from '../model';
import { useIdPrefix } from '../useIdPrefix';
import { useNavigation } from '../useNavigation';

/** Props shared by the text-mode components (DiffChars, DiffWords, ...). */
export const textDiffProps = {
  oldText: {
    type: String,
    required: true as const,
  },
  newText: {
    type: String,
    required: true as const,
  },
  /** ignoreCase, maxEditLength (lines also: ignoreWhitespace, newlineIsToken, stripTrailingCr). */
  options: {
    type: Object as PropType<DiffOptions>,
    default: () => ({}),
  },
  /** Put id="{idPrefix}-change-N" on every change. Default false. */
  anchors: {
    type: Boolean,
    default: false,
  },
  /** Prefix for emitted ids. Default: unique per instance (see README, SSR on Vue < 3.5). */
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

interface TextDiffPropValues {
  oldText: string;
  newText: string;
  options: DiffOptions;
  anchors: boolean;
  idPrefix?: string;
  minimap: boolean;
}

/** State and navigation of one text-mode component. */
export function useTextDiff(mode: TextMode, props: TextDiffPropValues) {
  const optionsKey = computed(() => stableKey(props.options));
  const model = computed(() => textModel(mode, props.oldText, props.newText, fromKey<DiffOptions>(optionsKey.value)));
  const prefix = useIdPrefix(() => props.idPrefix);
  const anchors = computed(() => props.anchors || props.minimap);
  const links = computed(() => (props.minimap ? minimapLinks(textMarks(model.value), prefix.value) : []));
  const { root, exposed } = useNavigation(
    computed(() => model.value.count),
    [() => props.oldText, () => props.newText, optionsKey, () => props.minimap],
  );
  const idOf = (index: number | null) => anchorId(anchors.value, prefix.value, index);
  return { root, model, links, idOf, exposed };
}
