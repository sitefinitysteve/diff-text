<template>
  <div class="text-diff-playback-wrap">
    <input
      :id="`${prefix}-replay`"
      class="diff-replay-input"
      type="checkbox"
    >
    <label
      class="diff-replay"
      :for="`${prefix}-replay`"
    >Replay</label>
    <div
      ref="root"
      :class="`text-diff ${modeClass(playbackMode(mode))} text-diff-playback`"
      :style="playbackStyle(speed)"
    >
      <template
        v-for="(part, index) in model.parts"
        :key="index"
      >
        <span v-if="part.changeIndex === null">{{ part.value }}</span>
        <span
          v-else
          :id="anchorId(anchors, prefix, part.changeIndex)"
          :class="`diff-${part.kind}`"
          :data-change-index="part.changeIndex"
          :style="`--td-i:${part.changeIndex}`"
        >{{ part.value }}</span>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
// Animated playback (SPEC section 23): the changes appear one after another, CSS only, with a Replay toggle.
import { computed } from 'vue';
import type { PropType } from 'vue';
import { modeClass } from '@diff-text/core';
import type { DiffOptions, TextMode } from '@diff-text/core';
import { anchorId, fromKey, playbackMode, playbackStyle, stableKey, textModel } from '../model';
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
  /** A text mode. Default 'words'. */
  mode: {
    type: String as PropType<TextMode>,
    default: 'words',
  },
  /** Milliseconds between consecutive changes (overrides --text-diff-playback-step). */
  speed: {
    type: Number,
    default: undefined,
  },
  /** Options for the underlying diff (ignoreCase, maxEditLength, ...). */
  options: {
    type: Object as PropType<DiffOptions>,
    default: () => ({}),
  },
  /** Put id="{idPrefix}-change-N" on every change. Default false. */
  anchors: {
    type: Boolean,
    default: false,
  },
  /** Prefix for emitted ids (the Replay checkbox, anchors). Default: unique per instance. */
  idPrefix: {
    type: String,
    default: undefined,
  },
});

const optionsKey = computed(() => stableKey(props.options));
const model = computed(() =>
  textModel(playbackMode(props.mode), props.oldText, props.newText, fromKey<DiffOptions>(optionsKey.value)),
);
const prefix = useIdPrefix(() => props.idPrefix);

const { root, exposed } = useNavigation(
  computed(() => model.value.count),
  [() => props.oldText, () => props.newText, () => props.mode, optionsKey],
);

defineExpose(exposed);
</script>
