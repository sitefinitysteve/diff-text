<template>
  <div
    ref="root"
    class="text-diff text-diff-heatmap"
  >
    <div class="diff-heat-text">
      <template
        v-for="(item, index) in model.items"
        :key="index"
      >
        <span v-if="item.kind === 'gap'">{{ item.text }}</span>
        <span
          v-else-if="item.kind === 'removed'"
          :id="idOf(item.changeIndex)"
          class="diff-heat-removed"
          :data-change-index="item.changeIndex ?? undefined"
          :title="item.label"
        ><span class="diff-sr">{{ 'removed sentence: ' }}</span>{{ item.text }}</span>
        <span
          v-else-if="item.changeIndex === null"
          class="diff-heat"
          data-heat="0"
        >{{ item.text }}</span>
        <span
          v-else
          :id="idOf(item.changeIndex)"
          class="diff-heat"
          :data-heat="item.heat"
          :data-change-index="item.changeIndex"
          :title="item.label"
        >{{ item.text }}<span class="diff-sr">{{ ` (${item.label})` }}</span></span>
      </template>
    </div>
    <ul
      v-if="legend"
      class="diff-heat-legend"
      aria-label="Heat legend"
    >
      <li
        v-for="key in model.legend"
        :key="key.key"
        :class="key.className"
        :data-heat="key.heat"
      ><span
        class="diff-heat-swatch"
        aria-hidden="true"
      />{{ key.text }}</li>
    </ul>
  </div>
</template>

<script setup lang="ts">
// Rewrite heatmap (SPEC section 20): each sentence of the new text shaded by how much it changed.
import { computed } from 'vue';
import type { PropType } from 'vue';
import type { HeatmapOptions } from '@diff-text/core';
import { anchorId, fromKey, heatmapModel, stableKey } from '../model';
import { useIdPrefix } from '../useIdPrefix';
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
  /** ignoreCase. */
  options: {
    type: Object as PropType<HeatmapOptions>,
    default: () => ({}),
  },
  /** Show removed old sentences inline. Default true. */
  showRemoved: {
    type: Boolean,
    default: true,
  },
  /** Show the legend. Default true. */
  legend: {
    type: Boolean,
    default: true,
  },
  /** Put id="{idPrefix}-change-N" on every changed sentence. Default false. */
  anchors: {
    type: Boolean,
    default: false,
  },
  /** Prefix for emitted ids. Default: unique per instance. */
  idPrefix: {
    type: String,
    default: undefined,
  },
});

const optionsKey = computed(() => stableKey(props.options));
const model = computed(() =>
  heatmapModel(props.oldText, props.newText, fromKey<HeatmapOptions>(optionsKey.value), props.showRemoved),
);
const prefix = useIdPrefix(() => props.idPrefix);
const idOf = (index: number | null) => anchorId(props.anchors, prefix.value, index);

const { root, exposed } = useNavigation(
  computed(() => model.value.count),
  [() => props.oldText, () => props.newText, optionsKey, () => props.showRemoved],
);

defineExpose(exposed);
</script>
