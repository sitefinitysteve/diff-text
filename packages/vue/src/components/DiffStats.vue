<template>
  <div
    class="text-diff-stats"
    :data-unit="stats.unit"
  >
    <span
      v-for="item in items"
      :key="item.kind"
      :class="['diff-stat', `diff-stat-${item.kind}`]"
    >
      <span aria-hidden="true">{{ item.visible }}</span>
      <span class="diff-sr">{{ item.label }}</span>
    </span>
    <span
      v-if="similarity !== null"
      class="diff-stat diff-stat-similarity"
    >{{ similarityPercent(similarity) }}% similar</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { PropType } from 'vue';
import { computeSimilarity, similarityPercent } from '@diff-text/core';
import type { DiffOptions, LineOptions } from '@diff-text/core';
import { fromKey, stableKey, statItems, statsFor } from '../model';
import type { StatsMode } from '../model';

const props = defineProps({
  oldText: {
    type: String,
    required: true,
  },
  newText: {
    type: String,
    required: true,
  },
  /** A text mode (counts code points) or 'unified' / 'split' (counts lines). Default 'words'. */
  mode: {
    type: String as PropType<StatsMode>,
    default: 'words',
  },
  /** Show the "N% similar" badge. Default true. */
  showSimilarity: {
    type: Boolean,
    default: true,
  },
  /** Options for the underlying diff (text-mode options, or line-view options incl. contextLines). */
  options: {
    type: Object as PropType<DiffOptions & LineOptions>,
    default: () => ({}),
  },
});

const optionsKey = computed(() => stableKey(props.options));
const stats = computed(() => statsFor(props.mode, props.oldText, props.newText, fromKey(optionsKey.value)));
const items = computed(() => statItems(stats.value));
const similarity = computed(() => (props.showSimilarity ? computeSimilarity(props.oldText, props.newText, { html: false }) : null));
</script>
