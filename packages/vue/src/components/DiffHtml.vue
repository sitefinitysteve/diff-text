<template>
  <div
    ref="root"
    class="text-diff text-diff-html"
    v-html="result.html"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { PropType } from 'vue';
import { diffHtml } from '@diff-text/core';
import { countHtmlChanges, fromKey, stableKey } from '../model';
import type { DiffHtmlOptions } from '../model';
import { useNavigation } from '../useNavigation';

const props = defineProps({
  oldText: {
    type: String,
    required: true,
  },
  newText: {
    type: String,
    required: true,
  },
  /** Engine options: orphanMatchThreshold (default 0.3), ignoreCase, maxEditLength. */
  options: {
    type: Object as PropType<DiffHtmlOptions>,
    default: () => ({}),
  },
  /** 0..1. Below this similarity the diff renders as a full replacement. null disables it. */
  similarityThreshold: {
    type: Number as PropType<number | null>,
    default: null,
  },
  /** Strip inline formatting tags (strong, em, b, i, u, s, mark, sub, sup) before diffing. */
  ignoreFormattingTags: {
    type: Boolean,
    default: true,
  },
});

const optionsKey = computed(() => stableKey(props.options));

// Inputs are rendered as raw HTML (v-html): callers must sanitize untrusted input.
const result = computed(() =>
  diffHtml(props.oldText, props.newText, {
    ...fromKey<DiffHtmlOptions>(optionsKey.value),
    similarityThreshold: props.similarityThreshold,
    ignoreFormattingTags: props.ignoreFormattingTags,
  }),
);

const { root, exposed } = useNavigation(
  computed(() => countHtmlChanges(result.value.html)),
  [() => props.oldText, () => props.newText, optionsKey, () => props.similarityThreshold, () => props.ignoreFormattingTags],
);

defineExpose(exposed);
</script>
